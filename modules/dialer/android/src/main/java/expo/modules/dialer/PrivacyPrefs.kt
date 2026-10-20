package expo.modules.dialer

import android.content.Context
import java.io.File

/**
 * Privacy settings, kept in the app's private storage.
 *
 * The app keeps everything on the phone: call recordings are written to the app's private folder
 * (no other app can read it), the app is excluded from cloud backups and has no internet
 * permission at all.
 */
object PrivacyPrefs {
  private const val NAME = "dialer_privacy"

  private fun p(ctx: Context) = ctx.getSharedPreferences(NAME, 0)

  fun hideOnLockScreen(ctx: Context) = p(ctx).getBoolean("hideLock", false)
  fun blockScreenshots(ctx: Context) = p(ctx).getBoolean("noShots", false)
  /** Delete call recordings older than this many days (0 = keep until deleted). */
  fun recordingDays(ctx: Context) = p(ctx).getInt("recDays", 0)

  fun all(ctx: Context): Map<String, Any> = mapOf(
    "hideOnLockScreen" to hideOnLockScreen(ctx),
    "blockScreenshots" to blockScreenshots(ctx),
    "recordingDays" to recordingDays(ctx),
  )

  fun set(ctx: Context, key: String, value: Any?) {
    val e = p(ctx).edit()
    when (key) {
      "hideOnLockScreen" -> e.putBoolean("hideLock", value == true)
      "blockScreenshots" -> e.putBoolean("noShots", value == true)
      "recordingDays" -> e.putInt("recDays", ((value as? Number)?.toInt() ?: 0).coerceIn(0, 3650))
    }
    e.apply()
    if (key == "recordingDays") cleanup(ctx)
    if (key == "blockScreenshots") CallManager.refreshActivityFlags()
  }

  private fun dir(ctx: Context) = File(ctx.filesDir, "recordings")

  /** Removes recordings past the chosen age. */
  fun cleanup(ctx: Context) {
    val days = recordingDays(ctx)
    if (days <= 0) return
    val cutoff = System.currentTimeMillis() - days * 24L * 60 * 60 * 1000
    dir(ctx).listFiles()?.forEach { f -> if (f.lastModified() < cutoff) f.delete() }
  }

  /** Wipes every recording the app has stored. */
  fun deleteEverything(ctx: Context) {
    dir(ctx).listFiles()?.forEach { it.delete() }
    // anything left over from the earlier call-screening feature
    File(ctx.filesDir, "screening").listFiles()?.forEach { it.delete() }
  }
}
