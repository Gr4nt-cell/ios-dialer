package expo.modules.dialer

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.Call
import java.util.Locale

/** Optional, once-per-ring local speech. No reverse lookup or online voices. */
object CallerAnnouncer {
  private const val PREFS = "dialer_call_announcer"
  private val main = Handler(Looper.getMainLooper())
  private var engine: TextToSpeech? = null
  private var token = 0
  private var currentId: String? = null
  private var completion: ((Boolean, String?) -> Unit)? = null
  @Volatile private var lastError: String? = null

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  fun all(ctx: Context): Map<String, Any?> = mapOf(
    "enabled" to prefs(ctx).getBoolean("enabled", false),
    "speakNumbers" to prefs(ctx).getBoolean("speakNumbers", false),
    "error" to lastError,
  )

  fun set(ctx: Context, enabled: Boolean, speakNumbers: Boolean) {
    prefs(ctx).edit().putBoolean("enabled", enabled).putBoolean("speakNumbers", speakNumbers).apply()
    if (!enabled) main.post { stop() }
  }

  private fun audible(ctx: Context): Boolean {
    val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val notifications = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return audio.ringerMode == AudioManager.RINGER_MODE_NORMAL &&
      audio.getStreamVolume(AudioManager.STREAM_RING) > 0 &&
      notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL
  }

  private fun incoming(locale: Locale, identity: String?): String = when (locale.language) {
    "tr" -> identity?.let { "$it arıyor" } ?: "Gelen arama"
    "es" -> identity?.let { "Llamada de $it" } ?: "Llamada entrante"
    "zh" -> identity?.let { "$it 来电" } ?: "有来电"
    "th" -> identity?.let { "สายเรียกเข้าจาก $it" } ?: "สายเรียกเข้า"
    "pl" -> identity?.let { "Dzwoni $it" } ?: "Połączenie przychodzące"
    "ja" -> identity?.let { "$it から着信です" } ?: "着信です"
    "it" -> identity?.let { "Chiamata da $it" } ?: "Chiamata in arrivo"
    else -> identity?.let { "Incoming call from $it" } ?: "Incoming call"
  }

  fun announce(ctx: Context, call: Call, id: String) {
    if (!prefs(ctx).getBoolean("enabled", false) || !audible(ctx)) return
    val locked = (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
    val hideIdentity = locked && PrivacyPrefs.hideOnLockScreen(ctx)
    val number = call.details.handle?.schemeSpecificPart.orEmpty()
    val identity = if (hideIdentity) null else {
      CallNotifications.lookupName(ctx, number)?.take(160)
        ?: if (prefs(ctx).getBoolean("speakNumbers", false)) number.filter { it.isDigit() }.takeIf { it.isNotBlank() }?.toCharArray()?.joinToString(" ") else null
    }
    speak(ctx.applicationContext, id, identity, null)
  }

  fun preview(ctx: Context, done: (Boolean, String?) -> Unit) {
    main.post {
      if (CallManager.hasLiveCalls()) { done(false, "Test the announcer when no call is active."); return@post }
      if (!audible(ctx)) { done(false, "Turn on ring sound and turn off Do Not Disturb to hear the test."); return@post }
      speak(ctx.applicationContext, "preview", "Stephen", done)
    }
  }

  private fun valid(ctx: Context, id: String): Boolean {
    if (!audible(ctx)) return false
    if (id == "preview") return !CallManager.hasLiveCalls()
    val call = CallManager.callById(id) ?: return false
    val busy = CallManager.topLevelCalls().any { it != call && CallManager.stateOf(it) == Call.STATE_ACTIVE }
    return !busy && CallManager.stateOf(call) == Call.STATE_RINGING
  }

  private fun speak(ctx: Context, id: String, identity: String?, done: ((Boolean, String?) -> Unit)?) {
    stop()
    currentId = id
    completion = done
    lastError = null
    val generation = token
    val locale = Locale.getDefault()
    try {
      engine = TextToSpeech(ctx) { status -> main.post {
        if (token != generation) return@post
        try {
          val tts = engine
          if (status != TextToSpeech.SUCCESS || tts == null || !valid(ctx, id)) {
            finish(false, "The call announcer voice is unavailable."); return@post
          }
          val voice = tts.voices?.firstOrNull { it.locale == locale && !it.isNetworkConnectionRequired }
            ?: tts.voices?.firstOrNull { it.locale.language == locale.language && !it.isNetworkConnectionRequired }
          if (voice == null || tts.setVoice(voice) != TextToSpeech.SUCCESS) {
            finish(false, "Install an offline text-to-speech voice for your phone language in Android settings."); return@post
          }
          tts.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
          tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { main.post { if (generation == token) Ringer.duckForAnnouncement(true) } }
            override fun onDone(utteranceId: String?) { main.post { if (generation == token) finish(true, null) } }
            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) { main.post { if (generation == token) finish(false, "The announcer voice could not play.") } }
          })
          val lockedNow = (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
          val safeIdentity = if (lockedNow && PrivacyPrefs.hideOnLockScreen(ctx)) null else identity
          if (tts.speak(incoming(locale, safeIdentity), TextToSpeech.QUEUE_FLUSH, null, "caller_notice_$generation") == TextToSpeech.ERROR)
            finish(false, "The announcer voice could not play.")
        } catch (_: Exception) { finish(false, "The announcer voice could not play.") }
      } }
      main.postDelayed({ if (generation == token) finish(false, "The call announcer timed out.") }, 12000)
      monitor(ctx, id, generation, identity != null)
    } catch (_: Exception) { finish(false, "The announcer engine is unavailable.") }
  }

  private fun monitor(ctx: Context, id: String, generation: Int, privateContent: Boolean) {
    main.postDelayed({
      if (generation != token) return@postDelayed
      val locked = (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
      if (!valid(ctx, id) || (privateContent && locked && PrivacyPrefs.hideOnLockScreen(ctx))) stop()
      else monitor(ctx, id, generation, privateContent)
    }, 300)
  }

  private fun finish(ok: Boolean, error: String?) {
    lastError = error
    val done = completion
    completion = null
    stop()
    done?.invoke(ok, error)
  }

  fun stop() {
    token++
    currentId = null
    main.removeCallbacksAndMessages(null)
    try { engine?.stop(); engine?.shutdown() } catch (_: Exception) {}
    engine = null
    Ringer.duckForAnnouncement(false)
    val done = completion
    completion = null
    done?.invoke(false, "Announcement cancelled.")
  }
}
