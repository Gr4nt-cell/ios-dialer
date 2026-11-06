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
import android.media.AudioAttributes
import android.media.AudioManager
import android.Manifest
import android.content.pm.PackageManager
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.Call
import android.telecom.CallAudioState
import java.util.Locale
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
 * Microphone capture is best effort: speakerphone does not guarantee remote audio.
 * OEM detection is informational; only firmware-granted permissions enable direct call audio.
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

    @Volatile private var requested = false

    fun isRecording(): Boolean = instance?.recorder != null

    fun dir(ctx: Context): File = File(ctx.filesDir, "recordings").apply { if (!exists()) mkdirs() }

    fun start(ctx: Context, number: String): Boolean {
      if (requested || instance != null) return true
      lastError = null
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        lastError = "Microphone permission is required."
        return false
      }
      if (CallManager.topLevelCalls().count { CallManager.stateOf(it) == Call.STATE_ACTIVE } != 1) {
        lastError = "Connect one call before starting recording."
        return false
      }
      if (CallManager.isMuted()) {
        lastError = "Unmute the call so the recording announcement can be heard."
        return false
      }
      requested = true
      return try {
        val intent = Intent(ctx, RecordingService::class.java).putExtra("number", number)
        ContextCompat.startForegroundService(ctx, intent)
        true
      } catch (e: Exception) {
        requested = false
        lastError = e.message ?: "Couldn’t start recording"
        false
      }
    }

    fun stop(ctx: Context) {
      requested = false
      instance?.let { service -> service.handler.post { service.finish() } }
      try { ctx.stopService(Intent(ctx, RecordingService::class.java)) } catch (_: Exception) {}
    }

    fun stateJson(): Any = if (requested || instance != null) {
      JSONObject().put("startedAt", startedAt).put("source", sourceName)
        .put("phase", instance?.phase ?: "starting")
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
  private var phase = "starting"
  private var callId: String? = null
  private var speech: TextToSpeech? = null
  private var closing = false
  private var previousRoute: Int? = null
  private var receivedAudio = false

  private fun fail(message: String) {
    lastError = message
    finish()
  }

  // Never continue across a hold, swap, disconnected call, mute or a headset change.
  private fun sessionValid(): Boolean {
    val call = callId?.let { CallManager.callById(it) } ?: return false
    return CallManager.stateOf(call) == Call.STATE_ACTIVE && !CallManager.isMuted() && CallManager.isSpeaker()
  }

  private val watchdog = object : Runnable {
    override fun run() {
      if (closing) return
      val call = callId?.let { CallManager.callById(it) }
      if (call == null || CallManager.stateOf(call) == Call.STATE_DISCONNECTED || CallManager.stateOf(call) == Call.STATE_DISCONNECTING) {
        finish()
        return
      }
      if (!sessionValid()) {
        fail("Recording stopped because the call ended, was held or muted, or left speakerphone.")
        return
      }
      handler.postDelayed(this, 500)
    }
  }

  private fun announce() {
    phase = "announcing"
    CallManager.emit()
    // Offline engine only. A locally completed utterance does not prove remote audibility.
    speech = TextToSpeech(this) { status -> handler.post {
      if (closing) return@post
      try {
      val tts = speech
      if (status != TextToSpeech.SUCCESS || tts == null) {
        fail("Recording did not start: the announcement voice is unavailable. Install an offline English text-to-speech voice.")
        return@post
      }
      val language = tts.setLanguage(Locale.US)
      val voice = tts.voices?.firstOrNull { it.locale.language == "en" && !it.isNetworkConnectionRequired }
      if (language < 0 || voice == null || tts.setVoice(voice) != TextToSpeech.SUCCESS) {
        fail("Recording did not start: install an offline English text-to-speech voice in Android settings.")
        return@post
      }
      val audio = getSystemService(AUDIO_SERVICE) as AudioManager
      if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) {
        fail("Recording did not start: turn up media volume so the announcement can be heard.")
        return@post
      }
      tts.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(id: String?) {}
        override fun onDone(id: String?) { handler.post {
          if (!closing && id == "recording_notice") {
            speech?.shutdown()
            speech = null
            if (sessionValid()) startCapture() else fail("Recording did not start: keep the call active, unmuted and on speakerphone.")
          }
        } }
        @Deprecated("Deprecated in Java")
        override fun onError(id: String?) { handler.post {
          if (!closing) fail("Recording did not start: the spoken announcement failed.")
        } }
      })
      if (tts.speak("This call is being recorded", TextToSpeech.QUEUE_FLUSH, null, "recording_notice") == TextToSpeech.ERROR) {
        fail("Recording did not start: the spoken announcement failed.")
      }
      } catch (e: Exception) {
        fail("Recording did not start: the announcement engine failed. Check the offline voice in Android settings.")
      }
    } }
    handler.postDelayed({ if (!closing && phase == "announcing") fail("Recording did not start: the announcement timed out.") }, 15000)
  }

  private fun startCapture() {
    val privileged = RecordingSupport.directAudioGranted(this)
    if (!privileged || !begin(MediaRecorder.AudioSource.VOICE_CALL, "call")) {
      if (!begin(MediaRecorder.AudioSource.MIC, "microphone")) {
        fail("This phone blocks microphone capture during calls. Call recording is unavailable on this device.")
        return
      }
    }
    phase = "recording"
    try { goForeground() } catch (e: Exception) {
      fail(e.message ?: "Android could not keep the recorder running.")
      return
    }
    receivedAudio = false
    handler.postDelayed({ checkSilence(0) }, 1200)
    CallManager.emit()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (instance == this && phase != "starting") return START_NOT_STICKY
    instance = this
    if (!requested) {
      finish()
      return START_NOT_STICKY
    }
    number = intent?.getStringExtra("number") ?: ""
    val active = CallManager.topLevelCalls().firstOrNull { CallManager.stateOf(it) == Call.STATE_ACTIVE }
    callId = active?.let { CallManager.idOf(it) }
    if (callId == null || CallManager.isMuted()) {
      fail("Recording did not start: connect and unmute the call first.")
      return START_NOT_STICKY
    }
    try {
      goForeground()
      previousRoute = CallManager.service?.callAudioState?.route
      CallManager.setRoute(CallAudioState.ROUTE_SPEAKER)
      // Telecom route changes are asynchronous; wait for the route before speaking.
      waitForSpeaker(0)
    } catch (e: Exception) {
      fail(e.message ?: "Couldn’t start recording")
    }
    return START_NOT_STICKY
  }

  private fun waitForSpeaker(round: Int) {
    if (closing) return
    val call = callId?.let { CallManager.callById(it) }
    if (call == null || CallManager.stateOf(call) != Call.STATE_ACTIVE || CallManager.isMuted()) {
      fail("Recording did not start: the call is no longer active or was muted.")
    } else if (CallManager.isSpeaker()) {
      handler.post(watchdog)
      try { announce() } catch (_: Exception) {
        fail("Recording did not start: the announcement engine is unavailable.")
      }
    } else if (round < 15) {
      handler.postDelayed({ waitForSpeaker(round + 1) }, 200)
    } else {
      fail("Recording did not start: this phone could not enable speakerphone.")
    }
  }

  private fun checkSilence(round: Int) {
    val r = recorder ?: return
    if (closing) return
    val amp = try { r.maxAmplitude } catch (_: Exception) { 0 }
    if (amp > 0) receivedAudio = true
    if (!receivedAudio && round >= 12) {
      // AAC file size is not evidence of sound: some devices encode only silence.
      if (sourceName == "call") {
        release(deleteFile = true)
        if (!begin(MediaRecorder.AudioSource.MIC, "microphone")) {
          fail("This phone blocks call recording.")
          return
        }
        handler.postDelayed({ checkSilence(0) }, 1000)
        CallManager.emit()
        return
      }
      release(deleteFile = true)
      fail("No microphone audio was detected. This phone may block recording during calls. Try a speakerphone test call and speak within the first 15 seconds.")
      return
    }
    handler.postDelayed({ checkSilence(round + 1) }, 1000)
  }

  private fun newRecorder(): MediaRecorder =
    if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else @Suppress("DEPRECATION") MediaRecorder()

  private fun begin(source: Int, name: String): Boolean {
    // Standard AAC rates; retry independently because OEM encoders differ.
    return listOf(44100, 16000, 8000).any { beginAtRate(source, name, it) }
  }

  private fun beginAtRate(source: Int, name: String, sampleRate: Int): Boolean {
    val digits = number.filter { it.isDigit() || it == '+' }.replace("+", "")
    val out = File(dir(this), "rec_${System.currentTimeMillis()}_${digits.ifEmpty { "unknown" }}.m4a")
    val r = try { newRecorder() } catch (_: Exception) { return false }
    return try {
      r.setAudioSource(source)
      r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      r.setAudioChannels(1)
      r.setAudioSamplingRate(sampleRate)
      r.setAudioEncodingBitRate(if (sampleRate == 44100) 96000 else 32000)
      r.setOnErrorListener { failedRecorder, _, _ -> handler.post {
        if (!closing && recorder === failedRecorder) fail("Android stopped the recorder. Check microphone access and available storage.")
      } }
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
    if (closing) return
    closing = true
    requested = false
    try { speech?.stop(); speech?.shutdown() } catch (_: Exception) {}
    speech = null
    handler.removeCallbacksAndMessages(null)
    release(deleteFile = false)
    // Restore only when our speaker route is still selected; respect user route changes.
    previousRoute?.let { if (CallManager.isSpeaker()) CallManager.setRoute(it) }
    previousRoute = null
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
    finish()
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
      .setContentTitle(if (phase == "recording") "Recording call" else "Preparing call recording")
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
