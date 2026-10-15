package expo.modules.dialer

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent

/**
 * Only used to host the call island: windows of type TYPE_ACCESSIBILITY_OVERLAY are drawn above
 * the status bar and receive touches there, so the pill can sit around the selfie camera and be
 * tapped. Events are ignored and no window content is read.
 */
class IslandAccessibilityService : AccessibilityService() {

  override fun onServiceConnected() {
    super.onServiceConnected()
    CallManager.appContext = CallManager.appContext ?: applicationContext
    IslandOverlay.attachService(this)
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

  override fun onInterrupt() {}

  override fun onUnbind(intent: android.content.Intent?): Boolean {
    IslandOverlay.detachService(this)
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    IslandOverlay.detachService(this)
    super.onDestroy()
  }

  companion object {
    fun isEnabled(ctx: Context): Boolean {
      val me = ComponentName(ctx, IslandAccessibilityService::class.java).flattenToString()
      val list = try {
        Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: ""
      } catch (_: Exception) { "" }
      return list.split(':').any { it.equals(me, ignoreCase = true) }
    }
  }
}
