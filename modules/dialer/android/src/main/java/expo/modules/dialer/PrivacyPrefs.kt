package expo.modules.dialer

import android.content.Context

/**
 * Privacy settings kept in the app's private storage.
 */
object PrivacyPrefs {
  private const val NAME = "dialer_privacy"

  private fun p(ctx: Context) = ctx.getSharedPreferences(NAME, 0)

  fun hideOnLockScreen(ctx: Context) = p(ctx).getBoolean("hideLock", false)
  fun blockScreenshots(ctx: Context) = p(ctx).getBoolean("noShots", false)
  fun all(ctx: Context): Map<String, Any> = mapOf(
    "hideOnLockScreen" to hideOnLockScreen(ctx),
    "blockScreenshots" to blockScreenshots(ctx),
  )

  fun set(ctx: Context, key: String, value: Any?) {
    val e = p(ctx).edit()
    when (key) {
      "hideOnLockScreen" -> e.putBoolean("hideLock", value == true)
      "blockScreenshots" -> e.putBoolean("noShots", value == true)
    }
    e.apply()
    if (key == "blockScreenshots") CallManager.refreshActivityFlags()
  }
}
