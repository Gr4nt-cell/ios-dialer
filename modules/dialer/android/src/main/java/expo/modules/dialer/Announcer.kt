package expo.modules.dialer

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * Says who is calling, over the ringtone.
 *
 * Text-to-speech is the phone's own engine, so nothing is sent anywhere and it
 * works offline. It speaks on the ring stream, which means the ring volume
 * controls it and silent or vibrate mode keeps it quiet — a caller
 * announcement that talks through a silent phone is worse than none.
 */
object Announcer {
  private const val PREFS = "dialer_overlay" // shared with the island prefs
  private const val KEY_ON = "announce"
  private const val KEY_REPEAT = "announceRepeat"
  private const val KEY_UNKNOWN = "announceUnknown"

  private var tts: TextToSpeech? = null
  private var ready = false
  private var pending: String? = null
  private var spoken = 0
  private var target = 0
  private val main = Handler(Looper.getMainLooper())

  fun enabled(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getBoolean(KEY_ON, false)
  fun repeats(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getInt(KEY_REPEAT, 2)
  fun announcesUnknown(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getBoolean(KEY_UNKNOWN, false)

  fun setPrefs(ctx: Context, on: Boolean, repeat: Int, unknown: Boolean) {
    ctx.getSharedPreferences(PREFS, 0).edit()
      .putBoolean(KEY_ON, on)
      .putInt(KEY_REPEAT, repeat.coerceIn(1, 5))
      .putBoolean(KEY_UNKNOWN, unknown)
      .apply()
  }

  /** Reads a number aloud a digit at a time; "0244..." as a number is unintelligible. */
  private fun spell(number: String): String =
    number.filter { it.isDigit() || it == '+' }.map { if (it == '+') "plus" else it.toString() }.joinToString(" ")

  /**
   * Speaks the caller for an incoming call. Call it when the ringtone starts;
   * it returns straight away and says nothing when the setting is off, the
   * phone is not on its normal ringer profile, or the caller is unknown and
   * unknown callers are not announced.
   */
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

    target = repeats(ctx)
    spoken = 0
    pending = "Call from $who"
    val engine = tts
    if (engine != null && ready) speakNow() else start(ctx)
  }

  private fun start(ctx: Context) {
    if (tts != null) return
    tts = TextToSpeech(ctx.applicationContext) { status ->
      ready = status == TextToSpeech.SUCCESS
      if (!ready) return@TextToSpeech
      tts?.language = Locale.getDefault().takeIf { tts?.isLanguageAvailable(it) == TextToSpeech.LANG_AVAILABLE } ?: Locale.US
      tts?.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      main.post { speakNow() }
    }
  }

  private fun speakNow() {
    val line = pending ?: return
    val engine = tts ?: return
    if (spoken >= target) return
    spoken++
    val params = Bundle().apply { putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_RING) }
    engine.speak(line, TextToSpeech.QUEUE_ADD, params, "caller-$spoken")
    if (spoken < target) main.postDelayed({ speakNow() }, 4000)
  }

  /** Stops talking: the call was answered, rejected, or silenced. */
  fun stop() {
    pending = null
    spoken = 0
    main.removeCallbacksAndMessages(null)
    try { tts?.stop() } catch (_: Exception) {}
  }

  /** Speaks one line immediately, for the preview button in Settings. */
  fun preview(ctx: Context, line: String) {
    target = 1
    spoken = 0
    pending = line
    if (tts != null && ready) speakNow() else start(ctx)
  }
}
