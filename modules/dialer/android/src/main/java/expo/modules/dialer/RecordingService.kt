package expo.modules.dialer

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaMetadataRetriever
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Records the current call into app storage (recordings/rec_<time>_<number>.m4a).
 *
 * Android lets only system apps hear the other side of a call directly, so we try the
 * call-audio source first and fall back to the microphone if it is blocked or silent.
 * With the microphone, the other person is captured clearly when the call is on speaker.
 * Runs as a microphone foreground service so it keeps recording when the app is in the background.
 */
class RecordingService : Service() {

  companion object {
    private const val CHANNEL = "call_recording"
    private const val NOTIFICATION_ID = 7412

    @Volatile var instance: RecordingService? = null
      private set
    @Volatile var startedAt: Long = 0
      private set
    @Volatile var sourceName: String = ""
      private set
    @Volatile var lastError: String? = null
      private set

    fun isRecording(): Boolean = instance?.recorder != null

    fun dir(ctx: Context): File = File(ctx.filesDir, "recordings").apply { if (!exists()) mkdirs() }

    fun start(ctx: Context, number: String): Boolean {
      if (isRecording()) return true
      lastError = null
      return try {
        val intent = Intent(ctx, RecordingService::class.java).putExtra("number", number)
        ContextCompat.startForegroundService(ctx, intent)
        true
      } catch (e: Exception) {
        lastError = e.message ?: "Couldn’t start recording"
        false
      }
    }

    fun stop(ctx: Context) {
      instance?.finish()
      try { ctx.stopService(Intent(ctx, RecordingService::class.java)) } catch (_: Exception) {}
    }

    fun stateJson(): Any = if (isRecording()) {
      JSONObject().put("startedAt", startedAt).put("source", sourceName)
    } else {
      JSONObject.NULL
    }

    fun list(ctx: Context): String {
      val arr = JSONArray()
      val files = dir(ctx).listFiles { f -> f.isFile && f.name.endsWith(".m4a") }?.sortedByDescending { it.lastModified() } ?: emptyList()
      val current = instance?.file
      for (f in files) {
        if (f == current) continue
        val parts = f.nameWithoutExtension.split("_")
        val date = parts.getOrNull(1)?.toLongOrNull() ?: f.lastModified()
        val number = parts.getOrNull(2) ?: ""
        var duration = 0L
        try {
          val r = MediaMetadataRetriever()
          r.setDataSource(f.absolutePath)
          duration = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) / 1000
          r.release()
        } catch (_: Exception) {}
        arr.put(
          JSONObject()
            .put("uri", Uri.fromFile(f).toString())
            .put("name", f.name)
            .put("number", number)
            .put("date", date)
            .put("duration", duration)
            .put("size", f.length()),
        )
      }
      return arr.toString()
    }

    fun delete(ctx: Context, name: String): Boolean {
      val f = File(dir(ctx), File(name).name)
      return f.exists() && f.delete()
    }
  }

  private var recorder: MediaRecorder? = null
  private var file: File? = null
  private val handler = Handler(Looper.getMainLooper())
  private var number: String = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    instance = this
    number = intent?.getStringExtra("number") ?: ""
    try {
      goForeground()
    } catch (e: Exception) {
      lastError = e.message ?: "Couldn’t start recording"
      stopSelf()
      return START_NOT_STICKY
    }
    if (recorder == null) {
      // Prefer the call's own audio; fall back to the microphone if the phone blocks it.
      if (!begin(MediaRecorder.AudioSource.VOICE_CALL, "call")) {
        if (!begin(MediaRecorder.AudioSource.MIC, "microphone")) {
          lastError = "This phone doesn’t allow call recording"
          finish()
          return START_NOT_STICKY
        }
      } else {
        // Some phones accept VOICE_CALL but deliver silence. Check, then switch to the mic.
        handler.postDelayed({ checkSilence(0) }, 1200)
      }
    }
    CallManager.emit()
    return START_NOT_STICKY
  }

  private fun checkSilence(round: Int) {
    val r = recorder ?: return
    if (sourceName != "call") return
    val amp = try { r.maxAmplitude } catch (_: Exception) { 0 }
    if (amp > 0) return
    if (round < 2) {
      handler.postDelayed({ checkSilence(round + 1) }, 900)
      return
    }
    // Silent call-audio source: restart on the microphone, keeping the original start time.
    val keepStart = startedAt
    release(deleteFile = true)
    if (begin(MediaRecorder.AudioSource.MIC, "microphone")) startedAt = keepStart else finish()
    CallManager.emit()
  }

  private fun newRecorder(): MediaRecorder =
    if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()

  private fun begin(source: Int, name: String): Boolean {
    val digits = number.filter { it.isDigit() || it == '+' }.replace("+", "")
    val out = File(dir(this), "rec_${System.currentTimeMillis()}_${digits.ifEmpty { "unknown" }}.m4a")
    val r = newRecorder()
    return try {
      r.setAudioSource(source)
      r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      r.setAudioChannels(1)
      r.setAudioSamplingRate(44100)
      r.setAudioEncodingBitRate(96000)
      r.setOutputFile(out.absolutePath)
      r.prepare()
      r.start()
      recorder = r
      file = out
      sourceName = name
      startedAt = System.currentTimeMillis()
      true
    } catch (_: Throwable) {
      try { r.release() } catch (_: Throwable) {}
      out.delete()
      false
    }
  }

  private fun release(deleteFile: Boolean) {
    val r = recorder ?: return
    recorder = null
    var ok = true
    try { r.stop() } catch (_: Throwable) { ok = false }
    try { r.release() } catch (_: Throwable) {}
    val f = file
    file = null
    if (f != null && (deleteFile || !ok || f.length() < 1024)) f.delete()
  }

  fun finish() {
    handler.removeCallbacksAndMessages(null)
    release(deleteFile = false)
    startedAt = 0
    sourceName = ""
    if (instance == this) instance = null
    try {
      if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    } catch (_: Exception) {}
    stopSelf()
    CallManager.emit()
  }

  override fun onDestroy() {
    if (recorder != null) finish()
    if (instance == this) instance = null
    super.onDestroy()
  }

  private fun goForeground() {
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = getSystemService(NotificationManager::class.java)
      nm?.createNotificationChannel(NotificationChannel(CHANNEL, "Call recording", NotificationManager.IMPORTANCE_LOW))
    }
    val n: Notification = NotificationCompat.Builder(this, CHANNEL)
      .setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle("Recording call")
      .setContentText("Tap Record on the call screen to stop")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } else {
      startForeground(NOTIFICATION_ID, n)
    }
  }
}
