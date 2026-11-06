package expo.modules.dialer

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.Process
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.Executors

/** Bundled English neural TTS. No microphone, network, or installed TTS service. */
object EmbeddedCallerSpeech {
  private const val ASSETS = "caller-speech-v1"
  private const val MODEL = "en_US-libritts_r-medium.onnx"
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor { task ->
    Thread({ Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND); task.run() }, "CallerSpeech")
  }
  // Only accessed by worker. The model is released after one minute without use.
  private var engine: OfflineTts? = null
  private var activity = 0L

  private fun model(ctx: Context): OfflineTts {
    engine?.let { return it }
    val dir = File(ctx.noBackupFilesDir, ASSETS)
    val ready = File(dir, ".ready")
    if (!ready.exists()) {
      dir.deleteRecursively()
      fun copy(path: String, target: File) {
        val children = ctx.assets.list(path).orEmpty()
        if (children.isEmpty()) {
          target.parentFile?.mkdirs()
          ctx.assets.open(path).use { input -> target.outputStream().use { input.copyTo(it) } }
        } else {
          target.mkdirs()
          children.forEach { copy("$path/$it", File(target, it)) }
        }
      }
      copy(ASSETS, dir)
      ready.writeText("1")
    }
    return OfflineTts(config = OfflineTtsConfig(model = OfflineTtsModelConfig(
      vits = OfflineTtsVitsModelConfig(
        model = File(dir, MODEL).absolutePath,
        tokens = File(dir, "tokens.txt").absolutePath,
        dataDir = File(dir, "espeak-ng-data").absolutePath,
        noiseScale = 0.333f, noiseScaleW = 0.333f,
      ), numThreads = 1, debug = false, provider = "cpu",
    ))).also { engine = it }
  }

  private fun releaseLater() {
    val stamp = ++activity
    main.postDelayed({ worker.execute {
      if (activity == stamp) { engine?.release(); engine = null }
    } }, 60000)
  }

  fun warm(ctx: Context) {
    val app = ctx.applicationContext
    worker.execute {
      try { model(app) } catch (_: Exception) { /* Recording and generic clips remain available. */ }
      catch (_: LinkageError) { /* Unsupported runtime: retain the prerecorded fallback. */ }
      finally { releaseLater() }
    }
  }

  fun synthesize(ctx: Context, identity: String, voice: String, current: () -> Boolean, done: (File?) -> Unit) {
    val app = ctx.applicationContext
    worker.execute {
      if (!current()) return@execute
      var result: File? = null
      var partial: File? = null
      try {
        // Bound work for long or malformed contact labels. Names never appear in filenames or logs.
        val name = identity.replace(Regex("[\\p{Cntrl}]"), " ").trim().take(80)
        val key = MessageDigest.getInstance("SHA-256").digest("$ASSETS|$voice|$name".toByteArray())
          .joinToString("") { "%02x".format(it.toInt() and 255) }
        val cache = File(app.cacheDir, "caller-speech").apply { mkdirs() }
        val file = File(cache, "$key.wav")
        val now = System.currentTimeMillis()
        cache.listFiles()?.filter { now - it.lastModified() > 86400000L }?.forEach { it.delete() }
        if (file.isFile && file.length() > 44) {
          file.setLastModified(now)
          result = file
        } else if (name.isNotBlank() && current()) {
          // LibriTTS readers 14 (female) and 17 (male); indices from the bundled model's JSON.
          val audio = model(app).generate("Incoming call from $name.", sid = if (voice == "male") 805 else 307, speed = 1.0f)
          if (audio.samples.isNotEmpty()) {
            partial = File(cache, "$key.tmp")
            if (audio.save(partial.absolutePath) && partial.renameTo(file)) result = file
          }
        }
        val files = cache.listFiles()?.filter { it.extension == "wav" }?.sortedByDescending { it.lastModified() }.orEmpty()
        var bytes = 0L
        files.forEachIndexed { index, entry ->
          bytes += entry.length()
          if (index >= 64 || bytes > 8L * 1024 * 1024) entry.delete()
        }
      } catch (_: Exception) { result = null }
      catch (_: LinkageError) { result = null }
      finally { partial?.delete(); releaseLater() }
      val output = result
      main.post { if (current()) done(output) }
    }
  }
}
