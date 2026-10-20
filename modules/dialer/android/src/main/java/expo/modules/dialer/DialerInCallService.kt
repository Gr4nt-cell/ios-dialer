package expo.modules.dialer

import android.content.Intent
import android.os.IBinder
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.InCallService

/**
 * Android binds this service for every call once the app holds the default
 * phone-app (dialer) role. It feeds CallManager, which drives the RN call screen.
 */
class DialerInCallService : InCallService() {

  override fun onCreate() {
    super.onCreate()
    CallManager.hook(application)
    CallNotifications.createChannels(this)
  }

  override fun onBind(intent: Intent?): IBinder? {
    CallManager.service = this
    return super.onBind(intent)
  }

  override fun onUnbind(intent: Intent?): Boolean {
    Ringer.stop()
    IslandOverlay.hideAll()
    CallManager.service = null
    CallNotifications.cancel(this)
    return super.onUnbind(intent)
  }

  override fun onCallAdded(call: Call) {
    super.onCallAdded(call)
    CallManager.service = this
    CallManager.add(call)
    val ringing = CallManager.stateOf(call) == Call.STATE_RINGING
    // Unknown caller set to "screen automatically": answer on speaker after a moment and screen it.
    val number = call.details.handle?.schemeSpecificPart.orEmpty()
    if (ringing && CallScreener.shouldAutoScreen(number)) {
      val id = CallManager.idOf(call)
      if (id != null) {
        android.os.Handler(mainLooper).postDelayed({
          if (CallManager.callById(id)?.let { CallManager.stateOf(it) } == Call.STATE_RINGING) {
            CallScreener.start(this, id)
            CallManager.launchUi(this)
          }
        }, 2500)
      }
    }
    // Incoming calls surface through the full-screen notification (lock screen)
    // or a heads-up banner; outgoing calls open the call screen straight away.
    if (!ringing || !CallNotifications.canNotify(this)) CallManager.launchUi(this)
  }

  override fun onCallRemoved(call: Call) {
    super.onCallRemoved(call)
    CallScreener.onCallRemoved(this, CallManager.idOf(call))
    CallManager.remove(call)
    if (!CallManager.hasLiveCalls()) {
      CallNotifications.cancel(this)
      RecordingService.stop(this)
      Ringer.stop()
    }
  }

  // Telecom asks us to stop ringing (volume key, power button…)
  override fun onSilenceRinger() {
    super.onSilenceRinger()
    Ringer.silence()
  }

  @Deprecated("Deprecated in Java")
  override fun onCallAudioStateChanged(audioState: CallAudioState?) {
    @Suppress("DEPRECATION")
    super.onCallAudioStateChanged(audioState)
    CallManager.emit()
  }
}
