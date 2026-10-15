package expo.modules.dialer

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

/** Decline / Hang up buttons on call notifications. */
class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    when (intent.action) {
      CallNotifications.ACTION_DECLINE -> CallManager.reject(id, null)
      CallNotifications.ACTION_HANGUP -> CallManager.hangup(id)
    }
  }
}

/** Invisible trampoline for the notification's Answer button: answers, then opens the call screen. */
class AnswerActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    intent.getStringExtra("id")?.let { CallManager.answer(it) }
    CallManager.launchUi(this)
    finish()
  }
}
