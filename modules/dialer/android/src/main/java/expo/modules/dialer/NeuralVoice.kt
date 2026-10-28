package expo.modules.dialer

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import java.util.concurrent.Executors

/**
 * The app's own voice.
 *
 * Two Piper voices ship inside the app and are spoken by sherpa-onnx, so the
 * announcement sounds the same on every phone and never depends on which
 * speech engine happens to be installed. Everything runs on the device.
 *
 * Synthesis takes a moment and must not touch the main thread, so it happens
 * on a single worker and the audio is handed to AudioTrack on the ring stream
 * — the same stream as the ringtone, which keeps the volume keys in charge.
 */
object NeuralVoice {
  private const val TAG = "NeuralVoice"
  private const val ASSET_ROOT = "tts"

  /** Which bundled voice to use. */
  enum class Which(val slot: String) { MALE("male"), FEMALE("female") }

  private val worker = Executors.newSingleThreadExecutor()
  private var engines = HashMap<String, OfflineTts>()
  private var track: AudioTrack? = null
  @Volatile private var cancelled = false

  /** True when the voices were packaged into this build. */
  fun available(ctx: Context): Boolean = try {
    val list = ctx.assets.list("$ASSET_ROOT/male") ?: emptyArray()
    list.contains("model.onnx")
  } catch (_: Exception) { false }

  /**
   * espeak-ng turns the words into phonemes and insists on a real directory,
   * so its data is unpacked out of the assets once and kept.
   */
  private fun phonemeData(ctx: Context): String? {
    val dir = File(ctx.filesDir, "espeak-ng-data")
    val marker = File(dir, ".copied")
    if (marker.exists()) return dir.absolutePath
    return try {
      copyAsset(ctx, "$ASSET_ROOT/espeak-ng-data", dir)
      marker.createNewFile()
      dir.absolutePath
    } catch (e: Exception) {
      Log.w(TAG, "could not unpack espeak-ng-data: ${e.message}")
      null
    }
  }

  private fun copyAsset(ctx: Context, path: String, dest: File) {
    val children = ctx.assets.list(path) ?: emptyArray()
    if (children.isEmpty()) {
      dest.parentFile?.mkdirs()
      ctx.assets.open(path).use { input -> dest.outputStream().use { input.copyTo(it) } }
      return
    }
    dest.mkdirs()
    for (child in children) copyAsset(ctx, "$path/$child", File(dest, child))
  }

  private fun engine(ctx: Context, which: Which): OfflineTts? {
    engines[which.slot]?.let { return it }
    if (!available(ctx)) return null
    val data = phonemeData(ctx) ?: return null
    return try {
      val config = OfflineTtsConfig(
        model = OfflineTtsModelConfig(
          vits = OfflineTtsVitsModelConfig(
            model = "$ASSET_ROOT/${which.slot}/model.onnx",
            tokens = "$ASSET_ROOT/${which.slot}/tokens.txt",
            dataDir = data,
          ),
          numThreads = 2,
          debug = false,
        ),
      )
      val tts = OfflineTts(assetManager = ctx.assets, config = config)
      engines[which.slot] = tts
      tts
    } catch (e: Throwable) {
      // a missing model or an ABI without the native library: fall back to the
      // system voice rather than taking the ring down with us
      Log.w(TAG, "could not start the bundled voice: ${e.message}")
      null
    }
  }

  /**
   * Speaks a line, off the main thread. `onFailure` runs when the bundled
   * voice can't be used at all, so the caller can fall back.
   */
  fun speak(ctx: Context, line: String, which: Which, speed: Float = 1.0f, onFailure: () -> Unit) {
    cancelled = false
    worker.execute {
      val tts = engine(ctx, which)
      if (tts == null) {
        onFailure()
        return@execute
      }
      try {
        val audio = tts.generate(text = line, sid = 0, speed = speed)
        if (cancelled || audio.samples.isEmpty()) return@execute
        play(audio.samples, audio.sampleRate)
      } catch (e: Throwable) {
        Log.w(TAG, "synthesis failed: ${e.message}")
        onFailure()
      }
    }
  }

  private fun play(samples: FloatArray, sampleRate: Int) {
    stopTrack()
    if (cancelled) return
    val min = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT)
    val size = maxOf(min, samples.size * 4)
    val t = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .setLegacyStreamType(AudioManager.STREAM_RING)
          .build(),
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
          .setSampleRate(sampleRate)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .build(),
      )
      .setBufferSizeInBytes(size)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
    track = t
    try {
      t.play()
      var off = 0
      while (off < samples.size && !cancelled) {
        val n = t.write(samples, off, samples.size - off, AudioTrack.WRITE_BLOCKING)
        if (n <= 0) break
        off += n
      }
      if (!cancelled) t.stop()
    } catch (e: Exception) {
      Log.w(TAG, "playback failed: ${e.message}")
    } finally {
      stopTrack()
    }
  }

  private fun stopTrack() {
    track?.let {
      try { it.pause(); it.flush(); it.release() } catch (_: Exception) {}
    }
    track = null
  }

  /** The call was answered or silenced. */
  fun stop() {
    cancelled = true
    stopTrack()
  }
}
