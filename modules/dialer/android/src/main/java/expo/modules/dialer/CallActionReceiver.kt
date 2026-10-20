package expo.modules.dialer

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

/** Decline / Hang up / Mute / Speaker buttons on call notifications. */
class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: ""
    when (intent.action) {
      CallNotifications.ACTION_DECLINE -> CallManager.reject(id, null)
      CallNotifications.ACTION_HANGUP -> CallManager.hangup(id)
      CallNotifications.ACTION_MUTE -> CallManager.toggleMute()
      CallNotifications.ACTION_SPEAKER -> CallManager.toggleSpeaker()
    }
  }
}

/** Invisible trampoline for the notification's Answer button: answers, then opens the call screen. */
class AnswerActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val id = intent.getStringExtra("id")
    if (id != null) {
      when (intent.getStringExtra("mode")) {
        "hold" -> CallManager.holdAndAnswer(id)
        "end" -> CallManager.endAndAnswer(id)
        else -> CallManager.answer(id)
      }
    }
    CallManager.launchUi(this)
    finish()
  }
}
