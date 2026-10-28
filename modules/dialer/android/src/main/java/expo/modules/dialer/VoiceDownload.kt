package expo.modules.dialer

import android.content.Context
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream

/**
 * Fetches a neural voice when the person asks for it.
 *
 * The models are 17.8MB each and most people use one, so they are not in the
 * app — they sit on the release the app was built from and come down on
 * request. The phonemiser data is shared by both voices and arrives once.
 *
 * Everything lands in filesDir/voices. A download that fails part-way leaves
 * a .part file, never a truncated model that would fail to load later.
 */
object VoiceDownload {
  private const val TAG = "VoiceDownload"
  private const val BASE = "https://github.com/Gr4nt-cell/ios-dialer/releases/download/latest"

  private val worker = Executors.newSingleThreadExecutor()

  /** idle | running | done | failed, with 0–100 for the running case. */
  @Volatile private var state = "idle"
  @Volatile private var progress = 0
  @Volatile private var activeSlot: String? = null
  @Volatile private var lastError: String? = null

  fun voicesDir(ctx: Context) = File(ctx.filesDir, "voices").apply { mkdirs() }
  fun modelFile(ctx: Context, slot: String) = File(voicesDir(ctx), "$slot/model.onnx")
  fun tokensFile(ctx: Context, slot: String) = File(voicesDir(ctx), "$slot/tokens.txt")
  fun phonemeDir(ctx: Context) = File(voicesDir(ctx), "espeak-ng-data")

  /** A voice is usable once its model, its tokens and the shared data are here. */
  fun installed(ctx: Context, slot: String): Boolean =
    modelFile(ctx, slot).length() > 1_000_000 &&
      tokensFile(ctx, slot).length() > 0 &&
      File(phonemeDir(ctx), "phontab").exists()

  fun status(ctx: Context): Map<String, Any?> = mapOf(
    "state" to state,
    "progress" to progress,
    "slot" to activeSlot,
    "error" to lastError,
    "male" to installed(ctx, "male"),
    "female" to installed(ctx, "female"),
  )

  fun remove(ctx: Context, slot: String): Boolean {
    NeuralVoice.release(slot)
    return File(voicesDir(ctx), slot).deleteRecursively()
  }

  /** Starts a download; progress is read back through status(). */
  fun start(ctx: Context, slot: String) {
    if (state == "running") return
    state = "running"
    progress = 0
    activeSlot = slot
    lastError = null
    val app = ctx.applicationContext

    worker.execute {
      try {
        val dir = File(voicesDir(app), slot).apply { mkdirs() }

        // the shared phonemiser data, once
        if (!File(phonemeDir(app), "phontab").exists()) {
          val zip = File(voicesDir(app), "espeak-ng-data.zip")
          download("$BASE/espeak-ng-data.zip", zip) { p -> progress = p * 40 / 100 }
          unzip(zip, voicesDir(app))
          zip.delete()
        }
        progress = 40

        download("$BASE/voice-$slot-tokens.txt", File(dir, "tokens.txt")) {}
        download("$BASE/voice-$slot.onnx", File(dir, "model.onnx")) { p -> progress = 40 + p * 60 / 100 }

        if (!installed(app, slot)) throw IllegalStateException("the download finished but the files are not usable")
        progress = 100
        state = "done"
      } catch (e: Throwable) {
        Log.w(TAG, "voice download failed: ${e.message}")
        lastError = e.message ?: "Download failed"
        state = "failed"
      } finally {
        activeSlot = null
      }
    }
  }

  private fun download(url: String, dest: File, onProgress: (Int) -> Unit) {
    val part = File(dest.parentFile, "${dest.name}.part")
    part.parentFile?.mkdirs()
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      connectTimeout = 20000
      readTimeout = 60000
      instanceFollowRedirects = true
    }
    try {
      conn.connect()
      if (conn.responseCode !in 200..299) throw IllegalStateException("HTTP ${conn.responseCode} for ${dest.name}")
      val total = conn.contentLengthLong
      var read = 0L
      conn.inputStream.use { input ->
        part.outputStream().use { out ->
          val buf = ByteArray(64 * 1024)
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            read += n
            if (total > 0) onProgress(((read * 100) / total).toInt().coerceIn(0, 100))
          }
        }
      }
      if (total > 0 && read != total) throw IllegalStateException("${dest.name} came down short")
      if (dest.exists()) dest.delete()
      if (!part.renameTo(dest)) throw IllegalStateException("could not store ${dest.name}")
    } finally {
      part.delete()
      conn.disconnect()
    }
  }

  private fun unzip(zip: File, into: File) {
    ZipInputStream(zip.inputStream().buffered()).use { zis ->
      while (true) {
        val entry = zis.nextEntry ?: break
        val out = File(into, entry.name)
        // never let an archive write outside the directory it was meant for
        if (!out.canonicalPath.startsWith(into.canonicalPath + File.separator)) {
          throw IllegalStateException("refusing a path outside the voice folder")
        }
        if (entry.isDirectory) {
          out.mkdirs()
        } else {
          out.parentFile?.mkdirs()
          out.outputStream().use { zis.copyTo(it) }
        }
        zis.closeEntry()
      }
    }
  }
}
