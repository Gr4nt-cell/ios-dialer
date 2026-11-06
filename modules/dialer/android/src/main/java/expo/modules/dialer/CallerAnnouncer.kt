package expo.modules.dialer

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.telecom.Call

/** Optional local speech, three repetitions per ring. No online lookup or voices. */
object CallerAnnouncer {
  private const val PREFS = "dialer_call_announcer"
  private val main = Handler(Looper.getMainLooper())
  private var audioPlayer: MediaPlayer? = null
  @Volatile private var fallbackPlaying = false
  @Volatile private var token = 0
  private var repeats = 0
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
    else EmbeddedCallerSpeech.warm(ctx.applicationContext)
  }

  private fun audible(ctx: Context): Boolean {
    val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val notifications = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return audio.ringerMode == AudioManager.RINGER_MODE_NORMAL &&
      audio.getStreamVolume(AudioManager.STREAM_RING) > 0 &&
      notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL
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
    main.postDelayed({ if (generation == token) finish(false, "Announcement playback timed out.") }, 45000)
    monitor(ctx, id, generation, id != "preview" && identity != null)
    val locked = (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
    val safeIdentity = if (id != "preview" && locked && PrivacyPrefs.hideOnLockScreen(ctx)) null else identity
    if (safeIdentity.isNullOrBlank() || safeIdentity.all { it in '0'..'9' || it.isWhitespace() }) {
      playFallback(ctx, id, safeIdentity, generation)
      return
    }
    val voice = AnnouncementVoice.all(ctx)["callerVoice"] ?: "female"
    EmbeddedCallerSpeech.synthesize(ctx, safeIdentity, voice, { token == generation && !fallbackPlaying }) { file ->
      if (generation != token || fallbackPlaying) return@synthesize
      if (!valid(ctx, id)) { stop(); return@synthesize }
      val privateNow = id != "preview" && (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked && PrivacyPrefs.hideOnLockScreen(ctx)
      if (file == null && id == "preview") { finish(false, "The bundled name voice could not initialize. Try the test again."); return@synthesize }
      if (privateNow || file == null) { playFallback(ctx, id, null, generation); return@synthesize }
      try {
        val player = MediaPlayer()
        audioPlayer = player
        player.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        player.setDataSource(file.absolutePath)
        player.setOnPreparedListener {
          if (generation == token && valid(ctx, id)) { fallbackPlaying = true; Ringer.duckForAnnouncement(true); it.start() }
          else if (generation == token) stop()
        }
        player.setOnSeekCompleteListener { if (generation == token && valid(ctx, id)) it.start() }
        player.setOnCompletionListener { completed ->
          if (generation == token) repeatOrFinish(ctx, id, generation) { completed.seekTo(0) }
        }
        player.setOnErrorListener { _, _, _ ->
          if (generation == token) finish(false, "The offline name announcement could not play.")
          true
        }
        player.prepareAsync()
      } catch (_: Exception) { playFallback(ctx, id, null, generation) }
    }
    // On slow devices keep ringing, and use a short generic clip if synthesis takes too long.
    main.postDelayed({
      if (generation == token && !fallbackPlaying && audioPlayer == null) {
        if (id == "preview") finish(false, "The offline name voice took too long. Try the test again.")
        else playFallback(ctx, id, null, generation)
      }
    }, 12000)
  }

  private fun playFallback(ctx: Context, id: String, identity: String?, generation: Int) {
    if (generation != token || fallbackPlaying) return
    if (!valid(ctx, id)) { stop(); return }
    fallbackPlaying = true
    try { audioPlayer?.release() } catch (_: Exception) {}
    audioPlayer = null
    val locked = (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
    val safeIdentity = if (locked && PrivacyPrefs.hideOnLockScreen(ctx)) null else identity
    val clips = AnnouncementVoice.incomingResources(ctx, safeIdentity)
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    fun playAt(index: Int) {
      if (generation != token) return
      if (!valid(ctx, id)) { stop(); return }
      if (index >= clips.size) { repeatOrFinish(ctx, id, generation) { playAt(0) }; return }
      try {
        val player = MediaPlayer.create(ctx, clips[index], attributes, AudioManager.AUDIO_SESSION_ID_GENERATE)
        if (player == null) { finish(false, "The bundled announcement could not be opened."); return }
        audioPlayer = player
        player.setOnCompletionListener { completed ->
          if (generation == token && audioPlayer === completed) {
            audioPlayer = null
            try { completed.release() } catch (_: Exception) {}
            playAt(index + 1)
          }
        }
        player.setOnErrorListener { _, _, _ ->
          if (generation == token) finish(false, "The bundled announcement could not play.")
          true
        }
        Ringer.duckForAnnouncement(true)
        player.start()
      } catch (_: Exception) { finish(false, "The bundled announcement could not play.") }
    }
    playAt(0)
  }

  private fun monitor(ctx: Context, id: String, generation: Int, privateContent: Boolean) {
    main.postDelayed({
      if (generation != token) return@postDelayed
      val locked = (ctx.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
      if (!valid(ctx, id) || (privateContent && locked && PrivacyPrefs.hideOnLockScreen(ctx))) stop()
      else monitor(ctx, id, generation, privateContent)
    }, 300)
  }

  private fun repeatOrFinish(ctx: Context, id: String, generation: Int, replay: () -> Unit) {
    repeats++
    if (repeats >= 3) { finish(true, null); return }
    main.postDelayed({
      if (generation != token) return@postDelayed
      if (valid(ctx, id)) replay() else stop()
    }, 800)
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
    repeats = 0
    currentId = null
    main.removeCallbacksAndMessages(null)
    try { audioPlayer?.stop() } catch (_: Exception) {}
    try { audioPlayer?.release() } catch (_: Exception) {}
    audioPlayer = null
    fallbackPlaying = false
    Ringer.duckForAnnouncement(false)
    val done = completion
    completion = null
    done?.invoke(false, "Announcement cancelled.")
  }
}
