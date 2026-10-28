package expo.modules.dialer

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
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
  private const val KEY_VOICE = "announceVoice"
  private const val KEY_BUNDLED = "announceBundled" // "male", "female", or "" for the phone's own

  private var tts: TextToSpeech? = null
  private var ready = false
  private var pending: String? = null
  private var spoken = 0
  private var target = 0
  private val main = Handler(Looper.getMainLooper())

  fun enabled(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getBoolean(KEY_ON, false)
  fun repeats(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getInt(KEY_REPEAT, 2)
  fun announcesUnknown(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getBoolean(KEY_UNKNOWN, false)
  fun chosenVoice(ctx: Context): String? = ctx.getSharedPreferences(PREFS, 0).getString(KEY_VOICE, null)

  /** "male" and "female" are the bundled voices; "" hands back to the phone's engine. */
  fun bundledVoice(ctx: Context): String =
    ctx.getSharedPreferences(PREFS, 0).getString(KEY_BUNDLED, null)
      ?: if (NeuralVoice.available(ctx)) "female" else ""

  fun setBundledVoice(ctx: Context, which: String) {
    ctx.getSharedPreferences(PREFS, 0).edit().putString(KEY_BUNDLED, which).apply()
  }

  fun bundledAvailable(ctx: Context) = NeuralVoice.available(ctx)

  private fun bundledChoice(ctx: Context): NeuralVoice.Which? = when (bundledVoice(ctx)) {
    "male" -> NeuralVoice.Which.MALE
    "female" -> NeuralVoice.Which.FEMALE
    else -> null
  }

  fun setVoice(ctx: Context, name: String?) {
    ctx.getSharedPreferences(PREFS, 0).edit().putString(KEY_VOICE, name).apply()
    applyVoice(ctx)
  }

  /**
   * The voices worth offering, best first.
   *
   * Phones ship a mix: old formant voices that sound robotic, and modern
   * neural ones that don't. The neural ones report a higher quality and are
   * usually marked local, so ranking on quality and dropping anything that
   * needs the network puts the human-sounding ones at the top — and keeps the
   * announcement working with no signal.
   */
  fun voices(ctx: Context): List<Map<String, Any?>> {
    val engine = tts ?: run { start(ctx); tts } ?: return emptyList()
    val all = try { engine.voices ?: emptySet<Voice>() } catch (_: Exception) { return emptyList() }
    val lang = Locale.getDefault().language
    return all
      .filter { !it.isNetworkConnectionRequired }
      .filter { it.features?.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED) != true }
      .sortedWith(
        compareByDescending<Voice> { it.locale.language == lang }
          .thenByDescending { it.quality }
          .thenBy { it.name },
      )
      .take(12)
      .map {
        mapOf(
          "id" to it.name,
          "label" to prettyVoice(it),
          "quality" to it.quality,
          "locale" to it.locale.toLanguageTag(),
        )
      }
  }

  /** "en-gb-x-gbd-local" is not a name anyone wants to read. */
  private fun prettyVoice(v: Voice): String {
    val place = v.locale.getDisplayName(Locale.getDefault())
    val grade = when {
      v.quality >= Voice.QUALITY_VERY_HIGH -> "very high"
      v.quality >= Voice.QUALITY_HIGH -> "high"
      v.quality >= Voice.QUALITY_NORMAL -> "normal"
      else -> "low"
    }
    val variant = v.name.substringAfterLast('-', "").takeIf { it.isNotBlank() && it != "local" } ?: v.name.takeLast(4)
    return "$place · $grade · $variant"
  }

  /** Picks the stored voice, or the best one available. */
  private fun applyVoice(ctx: Context) {
    val engine = tts ?: return
    val all = try { engine.voices ?: emptySet<Voice>() } catch (_: Exception) { return }
    if (all.isEmpty()) return
    val want = chosenVoice(ctx)
    val lang = Locale.getDefault().language
    val pick = all.firstOrNull { it.name == want }
      ?: all.filter { !it.isNetworkConnectionRequired }
        .sortedWith(
          compareByDescending<Voice> { it.locale.language == lang }
            .thenByDescending { it.quality },
        )
        .firstOrNull()
    if (pick != null) try { engine.voice = pick } catch (_: Exception) {}
  }

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

    val bundled = bundledChoice(ctx)
    if (bundled != null) {
      speakBundled(ctx, bundled)
      return
    }
    val engine = tts
    if (engine != null && ready) speakNow() else start(ctx)
  }

  private fun start(ctx: Context) {
    if (tts != null) return
    val app = ctx.applicationContext
    tts = TextToSpeech(app) { status ->
      ready = status == TextToSpeech.SUCCESS
      if (!ready) return@TextToSpeech
      tts?.language = Locale.getDefault().takeIf { tts?.isLanguageAvailable(it) == TextToSpeech.LANG_AVAILABLE } ?: Locale.US
      applyVoice(app)
      // a shade under normal reads as calmer and is easier to catch across a room
      try { tts?.setSpeechRate(0.95f) } catch (_: Exception) {}
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

  /** Repeats through the app's own voice, falling back if it can't start. */
  private fun speakBundled(ctx: Context, which: NeuralVoice.Which) {
    val line = pending ?: return
    if (spoken >= target) return
    spoken++
    NeuralVoice.speak(ctx, line, which, speed = 0.95f) {
      // the bundled voice failed: use the phone's engine for this call
      main.post { if (tts != null && ready) speakNow() else start(ctx) }
    }
    if (spoken < target) main.postDelayed({ speakBundled(ctx, which) }, 4000)
  }

  /** Stops talking: the call was answered, rejected, or silenced. */
  fun stop() {
    pending = null
    spoken = 0
    main.removeCallbacksAndMessages(null)
    NeuralVoice.stop()
    try { tts?.stop() } catch (_: Exception) {}
  }

  /** Speaks one line immediately, for the preview button in Settings. */
  fun preview(ctx: Context, line: String) {
    target = 1
    spoken = 0
    pending = line
    val bundled = bundledChoice(ctx)
    if (bundled != null) {
      speakBundled(ctx, bundled)
      return
    }
    if (tts != null && ready) speakNow() else start(ctx)
  }

  /** Preview one bundled voice without making it the choice. */
  fun previewBundled(ctx: Context, which: String, line: String) {
    val pick = if (which == "male") NeuralVoice.Which.MALE else NeuralVoice.Which.FEMALE
    target = 1
    spoken = 0
    pending = line
    speakBundled(ctx, pick)
  }
}
