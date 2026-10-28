package expo.modules.dialer

import android.content.Context
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Fetches the FunctionGemma weights.
 *
 * The URL is supplied by the caller rather than fixed here. Gemma's weights
 * are licence-gated on Hugging Face, so there is no address this app can hard
 * code and expect to work for everyone — whoever runs the app points it at a
 * copy they are entitled to use, or at a mirror of their own.
 *
 * The file lands beside the voices in the app's own storage. As there, a
 * download that stops short leaves a .part file rather than a half model that
 * would fail to load much later and much more confusingly.
 */
object BrainDownload {
  private const val TAG = "BrainDownload"
  private val worker = Executors.newSingleThreadExecutor()

  @Volatile private var state = "idle" // idle | running | done | failed
  @Volatile private var progress = 0
  @Volatile private var lastError: String? = null

  fun status(ctx: Context): Map<String, Any?> = mapOf(
    "state" to state,
    "progress" to progress,
    "error" to lastError,
    "installed" to GemmaBrain.installed(ctx),
  )

  fun start(ctx: Context, url: String) {
    if (state == "running") return
    if (url.isBlank() || !url.startsWith("https://")) {
      state = "failed"
      lastError = "The model address must be an https link"
      return
    }
    state = "running"
    progress = 0
    lastError = null
    val app = ctx.applicationContext

    worker.execute {
      val dest = GemmaBrain.modelFile(app)
      val part = File(dest.parentFile, "${dest.name}.part")
      var conn: HttpURLConnection? = null
      try {
        GemmaBrain.release()
        conn = (URL(url).openConnection() as HttpURLConnection).apply {
          connectTimeout = 20000
          readTimeout = 120000
          instanceFollowRedirects = true
        }
        conn.connect()
        if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode}")
        val total = conn.contentLengthLong
        var read = 0L
        conn.inputStream.use { input ->
          part.outputStream().use { out ->
            val buf = ByteArray(128 * 1024)
            while (true) {
              val n = input.read(buf)
              if (n < 0) break
              out.write(buf, 0, n)
              read += n
              if (total > 0) progress = ((read * 100) / total).toInt().coerceIn(0, 100)
            }
          }
        }
        if (total > 0 && read != total) throw IllegalStateException("the download came down short")
        if (read < 50_000_000) throw IllegalStateException("that file is too small to be the model")
        if (dest.exists()) dest.delete()
        if (!part.renameTo(dest)) throw IllegalStateException("could not store the model")
        progress = 100
        state = "done"
      } catch (e: Throwable) {
        Log.w(TAG, "model download failed: ${e.message}")
        lastError = e.message ?: "Download failed"
        state = "failed"
      } finally {
        part.delete()
        conn?.disconnect()
      }
    }
  }
}
