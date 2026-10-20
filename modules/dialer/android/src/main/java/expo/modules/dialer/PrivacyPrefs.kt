package expo.modules.dialer

import android.content.Context
import java.io.File

/**
 * Privacy and call-screening settings, kept in the app's private storage.
 *
 * The app keeps everything on the phone: recordings and screening transcripts are written to the
 * app's private folder (no other app can read it), the app is excluded from cloud backups and has
 * no internet permission at all, and call screening only uses on-device speech recognition unless
 * the user explicitly allows the online service.
 */
object PrivacyPrefs {
  private const val NAME = "dialer_privacy"

  private fun p(ctx: Context) = ctx.getSharedPreferences(NAME, 0)

  fun hideOnLockScreen(ctx: Context) = p(ctx).getBoolean("hideLock", false)
  fun blockScreenshots(ctx: Context) = p(ctx).getBoolean("noShots", false)
  /** Delete call recordings older than this many days (0 = keep until deleted). */
  fun recordingDays(ctx: Context) = p(ctx).getInt("recDays", 0)
  /** Call screening may fall back to Google's online speech recognition. Off by default. */
  fun allowOnlineSpeech(ctx: Context) = p(ctx).getBoolean("onlineSpeech", false)
  /** Calls from numbers that aren't in your contacts: "ring", "silence", "screen" or "decline". */
  fun unknownCallers(ctx: Context) = p(ctx).getString("unknown", "ring") ?: "ring"
  /** Calls with no caller ID: same choices. */
  fun hiddenCallers(ctx: Context) = p(ctx).getString("hidden", "ring") ?: "ring"
  /** Your name for the screening greeting (optional). */
  fun screenName(ctx: Context) = p(ctx).getString("screenName", "") ?: ""
  fun keepTranscripts(ctx: Context) = p(ctx).getBoolean("keepTranscripts", true)

  fun all(ctx: Context): Map<String, Any> = mapOf(
    "hideOnLockScreen" to hideOnLockScreen(ctx),
    "blockScreenshots" to blockScreenshots(ctx),
    "recordingDays" to recordingDays(ctx),
    "allowOnlineSpeech" to allowOnlineSpeech(ctx),
    "unknownCallers" to unknownCallers(ctx),
    "hiddenCallers" to hiddenCallers(ctx),
    "screenName" to screenName(ctx),
    "keepTranscripts" to keepTranscripts(ctx),
  )

  fun set(ctx: Context, key: String, value: Any?) {
    val e = p(ctx).edit()
    when (key) {
      "hideOnLockScreen" -> e.putBoolean("hideLock", value == true)
      "blockScreenshots" -> e.putBoolean("noShots", value == true)
      "recordingDays" -> e.putInt("recDays", ((value as? Number)?.toInt() ?: 0).coerceIn(0, 3650))
      "allowOnlineSpeech" -> e.putBoolean("onlineSpeech", value == true)
      "unknownCallers" -> e.putString("unknown", value?.toString() ?: "ring")
      "hiddenCallers" -> e.putString("hidden", value?.toString() ?: "ring")
      "screenName" -> e.putString("screenName", value?.toString()?.take(40) ?: "")
      "keepTranscripts" -> e.putBoolean("keepTranscripts", value == true)
    }
    e.apply()
    if (key == "recordingDays") cleanup(ctx)
    if (key == "blockScreenshots") CallManager.refreshActivityFlags()
    if (key == "keepTranscripts" && value != true) deleteAllTranscripts(ctx)
  }

  /** Removes recordings and transcripts past the chosen age. */
  fun cleanup(ctx: Context) {
    val days = recordingDays(ctx)
    if (days <= 0) return
    val cutoff = System.currentTimeMillis() - days * 24L * 60 * 60 * 1000
    listOf(File(ctx.filesDir, "recordings"), File(ctx.filesDir, "screening")).forEach { dir ->
      dir.listFiles()?.forEach { f -> if (f.lastModified() < cutoff) f.delete() }
    }
  }

  fun deleteAllTranscripts(ctx: Context) {
    File(ctx.filesDir, "screening").listFiles()?.forEach { it.delete() }
  }

  /** Wipes every recording and transcript the app has stored. */
  fun deleteEverything(ctx: Context) {
    listOf(File(ctx.filesDir, "recordings"), File(ctx.filesDir, "screening")).forEach { dir ->
      dir.listFiles()?.forEach { it.delete() }
    }
  }
}
