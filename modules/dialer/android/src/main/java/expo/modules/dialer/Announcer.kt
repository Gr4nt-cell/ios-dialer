package expo.modules.dialer

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.util.Log
import com.github.csukuangfj.piper.phonemize.piperPhonemizeInitialize
import com.github.csukuangfj.piper.phonemize.piperPhonemizeText
import com.k2fsa.sherpa.onnx.GenerationConfig
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Offline caller announcements using the app's bundled neural male and female
 * voices. Caller names and numbers never leave the device and Android's
 * TextToSpeech engine is not used.
 */
object Announcer {
  private const val TAG = "CallerAnnouncer"
  private const val PREFS = "dialer_overlay"
  private const val KEY_ON = "announce"
  private const val KEY_REPEAT = "announceRepeat"
  private const val KEY_UNKNOWN = "announceUnknown"
  private const val KEY_VOICE = "announceVoice"

  private val worker = Executors.newSingleThreadExecutor { task ->
    Thread(task, "caller-announcement").apply { isDaemon = true }
  }
  private val playbackToken = AtomicInteger(0)
  private val trackLock = Any()

  @Volatile private var activeTrack: AudioTrack? = null
  private var piperReady = false
  private var cachedVoice: String? = null
  private var cachedTts: OfflineTts? = null

  fun enabled(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getBoolean(KEY_ON, false)
  fun repeats(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getInt(KEY_REPEAT, 2)
  fun announcesUnknown(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getBoolean(KEY_UNKNOWN, false)

  fun chosenVoice(ctx: Context): String {
    val stored = ctx.getSharedPreferences(PREFS, 0).getString(KEY_VOICE, null)
    return if (stored == "male" || stored == "female") stored else "female"
  }

  fun setVoice(ctx: Context, name: String?) {
    val voice = if (name == "male") "male" else "female"
    ctx.getSharedPreferences(PREFS, 0).edit().putString(KEY_VOICE, voice).apply()
  }

  fun voices(ctx: Context): List<Map<String, Any?>> {
    if (!voiceAssetsAvailable(ctx)) return emptyList()
    return listOf(
      mapOf("id" to "female", "label" to "Female"),
      mapOf("id" to "male", "label" to "Male"),
    )
  }

  private fun voiceAssetsAvailable(ctx: Context): Boolean = try {
    ctx.assets.open("tts/voice-female.onnx").use { }
    ctx.assets.open("tts/voice-female-tokens.txt").use { }
    ctx.assets.open("tts/voice-male.onnx").use { }
    ctx.assets.open("tts/voice-male-tokens.txt").use { }
    ctx.assets.open("espeak-ng-data/phontab").use { }
    true
  } catch (_: Exception) {
    false
  }

  fun setPrefs(ctx: Context, on: Boolean, repeat: Int, unknown: Boolean) {
    ctx.getSharedPreferences(PREFS, 0).edit()
      .putBoolean(KEY_ON, on)
      .putInt(KEY_REPEAT, repeat.coerceIn(1, 5))
      .putBoolean(KEY_UNKNOWN, unknown)
      .apply()
  }

  private fun spell(number: String): String =
    number.filter { it.isDigit() || it == '+' }
      .map { if (it == '+') "plus" else it.toString() }
      .joinToString(" ")

  fun announce(ctx: Context, number: String?) {
    if (!enabled(ctx)) return
    val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
    if (audio.getStreamVolume(AudioManager.STREAM_RING) <= 0) return

    val name = number?.let { CallNotifications.lookupName(ctx, it) }?.takeIf { it.isNotBlank() }
    val who = when {
      name != null -> name
      !announcesUnknown(ctx) -> return
      number.isNullOrBlank() -> "unknown caller"
      else -> spell(number)
    }

    enqueue(ctx, "Call from $who", repeats(ctx), preview = false)
  }

  fun preview(ctx: Context, line: String) {
    enqueue(ctx, line, 1, preview = true)
  }

  private fun enqueue(ctx: Context, line: String, count: Int, preview: Boolean) {
    val app = ctx.applicationContext
    val token = playbackToken.incrementAndGet()
    worker.execute {
      try {
        if (token != playbackToken.get()) return@execute
        val tts = ttsFor(app, chosenVoice(app))
        val phonemes = piperPhonemizeText(line, "en-us")
          ?: throw IllegalStateException("Could not phonemize the caller announcement")
        val codepoints = try {
          Array(phonemes.numSentences) { sentence -> phonemes.getPhonemes(sentence) }
        } finally {
          phonemes.close()
        }
        if (codepoints.isEmpty() || token != playbackToken.get()) return@execute

        val audio = tts.generateWithConfig(
          text = "",
          config = GenerationConfig(phonemeCodepoints = codepoints),
        )
        for (repeatIndex in 0 until count.coerceIn(1, 5)) {
          if (token != playbackToken.get()) break
          playAudio(audio.samples, audio.sampleRate, token, preview)
          if (repeatIndex + 1 < count && token == playbackToken.get()) Thread.sleep(4_000)
        }
      } catch (error: Exception) {
        Log.w(TAG, "Offline caller announcement failed", error)
      }
    }
  }

  private fun ttsFor(ctx: Context, voice: String): OfflineTts {
    if (cachedVoice == voice && cachedTts != null) return cachedTts!!

    cachedTts?.let { try { it.free() } catch (_: Exception) {} }
    cachedTts = null
    cachedVoice = null

    if (!piperReady) {
      piperPhonemizeInitialize(ctx)
      piperReady = true
    }

    val modelDir = File(ctx.filesDir, "caller-voice").apply { mkdirs() }
    val modelFile = File(modelDir, "voice-$voice.onnx")
    val tokenFile = File(modelDir, "voice-$voice-tokens.txt")
    copyAssetIfMissing(ctx, "tts/voice-$voice.onnx", modelFile)
    copyAssetIfMissing(ctx, "tts/voice-$voice-tokens.txt", tokenFile)

    val config = OfflineTtsConfig(
      model = OfflineTtsModelConfig(
        vits = OfflineTtsVitsModelConfig(
          model = modelFile.absolutePath,
          tokens = tokenFile.absolutePath,
          noiseScale = 0.55f,
          noiseScaleW = 0.8f,
          lengthScale = 1.0f,
        ),
        numThreads = 2,
        provider = "cpu",
      ),
    )
    val engine = OfflineTts(config = config)
    cachedVoice = voice
    cachedTts = engine
    return engine
  }

  private fun copyAssetIfMissing(ctx: Context, assetName: String, destination: File) {
    if (destination.isFile && destination.length() > 0) return
    destination.parentFile?.mkdirs()
    val temporary = File(destination.parentFile, "${destination.name}.tmp")
    try {
      ctx.assets.open(assetName).use { input ->
        temporary.outputStream().use { output -> input.copyTo(output) }
      }
      if (!temporary.renameTo(destination)) throw IllegalStateException("Could not install voice asset: $assetName")
    } catch (error: Exception) {
      temporary.delete()
      throw error
    }
  }

  private fun playAudio(samples: FloatArray, sampleRate: Int, token: Int, preview: Boolean) {
    if (samples.isEmpty() || sampleRate <= 0 || token != playbackToken.get()) return
    val minimumBuffer = AudioTrack.getMinBufferSize(
      sampleRate,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_FLOAT,
    )
    if (minimumBuffer <= 0) return

    val attributes = AudioAttributes.Builder()
      .setUsage(if (preview) AudioAttributes.USAGE_MEDIA else AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    val format = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
      .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
      .setSampleRate(sampleRate)
      .build()

    val track = AudioTrack.Builder()
      .setAudioAttributes(attributes)
      .setAudioFormat(format)
      .setBufferSizeInBytes(maxOf(minimumBuffer, sampleRate * 4))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()

    synchronized(trackLock) {
      if (token != playbackToken.get()) {
        track.release()
        return
      }
      activeTrack = track
    }

    try {
      track.play()
      var offset = 0
      while (offset < samples.size && token == playbackToken.get()) {
        val written = track.write(samples, offset, samples.size - offset, AudioTrack.WRITE_BLOCKING)
        if (written <= 0) break
        offset += written
      }
    } finally {
      synchronized(trackLock) {
        if (activeTrack === track) activeTrack = null
      }
      try { track.stop() } catch (_: Exception) {}
      track.release()
    }
  }

  /** Stops speech when the call is answered, rejected, or silenced. */
  fun stop() {
    playbackToken.incrementAndGet()
    synchronized(trackLock) {
      val track = activeTrack
      activeTrack = null
      try { track?.pause() } catch (_: Exception) {}
      try { track?.flush() } catch (_: Exception) {}
      try { track?.stop() } catch (_: Exception) {}
    }
  }
}
