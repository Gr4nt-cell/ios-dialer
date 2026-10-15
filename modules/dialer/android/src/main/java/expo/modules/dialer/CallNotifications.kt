package expo.modules.dialer

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.ContactsContract
import android.telecom.Call
import android.telecom.CallAudioState
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * The call notification. Uses Android's call style (answer / decline while ringing,
 * hang up · mute · speaker during a call), which the system also shows on lock screens,
 * cover / rear screens and status-bar call chips. The in-call service is kept in the
 * foreground with it while a call is live.
 */
object CallNotifications {
  private const val CH_INCOMING = "dialer_incoming_v2"
  private const val CH_ONGOING = "dialer_ongoing_v2"
  const val ID = 4401
  const val ACTION_DECLINE = "expo.modules.dialer.DECLINE"
  const val ACTION_HANGUP = "expo.modules.dialer.HANGUP"
  const val ACTION_MUTE = "expo.modules.dialer.MUTE"
  const val ACTION_SPEAKER = "expo.modules.dialer.SPEAKER"

  private var lastKey: String? = null
  private var foreground = false
  private val nameCache = HashMap<String, String?>()

  fun createChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
    val incoming = NotificationChannel(CH_INCOMING, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
      setSound(null, null) // the app plays the ringtone itself (see Ringer)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    val ongoing = NotificationChannel(CH_ONGOING, "Ongoing calls", NotificationManager.IMPORTANCE_DEFAULT).apply {
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    try {
      nm.deleteNotificationChannel("dialer_incoming_v1")
      nm.deleteNotificationChannel("dialer_ongoing_v1")
    } catch (_: Exception) {}
    nm.createNotificationChannels(listOf(incoming, ongoing))
  }

  fun canNotify(ctx: Context): Boolean = NotificationManagerCompat.from(ctx).areNotificationsEnabled()

  @SuppressLint("MissingPermission")
  fun update(ctx: Context) {
    val ringing = CallManager.ringingCall()
    val ongoing = CallManager.primaryCall()
    val audio = CallManager.service?.callAudioState
    try {
      if (ringing != null) {
        val key = "in:" + CallManager.idOf(ringing) + ":" + IslandOverlay.serviceOn() + ":" + isLocked(ctx)
        if (key != lastKey) post(ctx, build(ctx, ringing, incoming = true, callStyle = true)) { build(ctx, ringing, incoming = true, callStyle = false) }
        lastKey = key
      } else if (ongoing != null) {
        val key = "on:" + CallManager.idOf(ongoing) + ":" + CallManager.stateOf(ongoing) + ":" +
          ongoing.details.connectTimeMillis + ":" + (audio?.isMuted == true) + ":" + audio?.route
        if (key != lastKey) post(ctx, build(ctx, ongoing, incoming = false, callStyle = true)) { build(ctx, ongoing, incoming = false, callStyle = false) }
        lastKey = key
      } else {
        cancel(ctx)
      }
    } catch (_: Exception) {
    }
  }

  /** Posts the notification; keeps the in-call service in the foreground with it when possible. */
  @SuppressLint("MissingPermission")
  private fun post(ctx: Context, n: Notification, fallback: () -> Notification) {
    val service = CallManager.service
    if (service != null) {
      try {
        if (Build.VERSION.SDK_INT >= 30) {
          service.startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL)
        } else {
          service.startForeground(ID, n)
        }
        foreground = true
        return
      } catch (_: Exception) {
        // not allowed right now — fall through to a normal notification
      }
    }
    val nm = NotificationManagerCompat.from(ctx)
    try {
      nm.notify(ID, n)
    } catch (_: Exception) {
      // call style needs the foreground service on newer Android; use the plain style instead
      try { nm.notify(ID, fallback()) } catch (_: Exception) {}
    }
  }

  fun cancel(ctx: Context) {
    lastKey = null
    if (foreground) {
      try {
        CallManager.service?.let {
          if (Build.VERSION.SDK_INT >= 24) it.stopForeground(android.app.Service.STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") it.stopForeground(true)
        }
      } catch (_: Exception) {}
      foreground = false
    }
    try { NotificationManagerCompat.from(ctx).cancel(ID) } catch (_: Exception) {}
  }

  private fun flags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  fun openApp(ctx: Context): PendingIntent? {
    val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    intent.putExtra("dialer_show_call", true)
    return PendingIntent.getActivity(ctx, 1, intent, flags())
  }

  private fun broadcast(ctx: Context, action: String, id: String, req: Int): PendingIntent =
    PendingIntent.getBroadcast(
      ctx, req,
      Intent(ctx, CallActionReceiver::class.java).setAction(action).putExtra("id", id),
      flags()
    )

  private fun answerIntent(ctx: Context, id: String): PendingIntent =
    PendingIntent.getActivity(
      ctx, 3,
      Intent(ctx, AnswerActivity::class.java).putExtra("id", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      flags()
    )

  fun title(ctx: Context, call: Call): String {
    val number = call.details.handle?.schemeSpecificPart ?: ""
    return lookupName(ctx, number)
      ?: call.details.callerDisplayName?.takeIf { it.isNotBlank() }
      ?: number.ifEmpty { "Unknown" }
  }

  private fun build(ctx: Context, call: Call, incoming: Boolean, callStyle: Boolean): Notification {
    val id = CallManager.idOf(call) ?: ""
    val name = title(ctx, call)
    val state = CallManager.stateOf(call)
    val audio = CallManager.service?.callAudioState
    val muted = audio?.isMuted == true
    val speaker = audio?.route == CallAudioState.ROUTE_SPEAKER
    val open = openApp(ctx)
    val decline = broadcast(ctx, ACTION_DECLINE, id, 4)
    val hangup = broadcast(ctx, ACTION_HANGUP, id, 5)
    val mute = broadcast(ctx, ACTION_MUTE, id, 6)
    val spk = broadcast(ctx, ACTION_SPEAKER, id, 7)
    val answer = answerIntent(ctx, id)

    val text = when {
      incoming -> "Incoming call"
      state == Call.STATE_HOLDING -> "On hold"
      state == Call.STATE_ACTIVE -> if (muted) "Ongoing call · muted" else "Ongoing call"
      else -> "Calling…"
    }

    // With the call island on and the phone unlocked, the island shows the incoming call,
    // so the notification stays quiet (no pop-up banner on top of the island).
    val islandTakesOver = incoming && IslandOverlay.serviceOn() && IslandOverlay.islandEnabled(ctx) && !isLocked(ctx)
    val b = NotificationCompat.Builder(ctx, if (incoming && !islandTakesOver) CH_INCOMING else CH_ONGOING)
      .setSmallIcon(android.R.drawable.sym_action_call)
      .setContentTitle(name)
      .setContentText(text)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setSilent(!incoming)
      .setContentIntent(open)
      .setColorized(true)
      .setColor(if (incoming) 0xFF30D158.toInt() else 0xFF34C759.toInt())

    if (incoming) {
      b.setPriority(if (islandTakesOver) NotificationCompat.PRIORITY_DEFAULT else NotificationCompat.PRIORITY_MAX)
      if (open != null && !islandTakesOver) b.setFullScreenIntent(open, true)
    } else {
      b.setPriority(NotificationCompat.PRIORITY_HIGH)
      val connected = call.details.connectTimeMillis
      if (state == Call.STATE_ACTIVE && connected > 0) b.setWhen(connected).setShowWhen(true).setUsesChronometer(true)
    }

    if (callStyle) {
      val person = Person.Builder().setName(name).setImportant(true).build()
      val style = if (incoming) {
        NotificationCompat.CallStyle.forIncomingCall(person, decline, answer)
      } else {
        NotificationCompat.CallStyle.forOngoingCall(person, hangup)
      }
      b.setStyle(style)
      if (!incoming) {
        b.addAction(0, if (muted) "Unmute" else "Mute", mute)
        b.addAction(0, if (speaker) "Phone" else "Speaker", spk)
      }
    } else if (incoming) {
      b.addAction(0, "Decline", decline)
      b.addAction(0, "Answer", answer)
    } else {
      b.addAction(0, "Hang up", hangup)
      b.addAction(0, if (muted) "Unmute" else "Mute", mute)
      b.addAction(0, if (speaker) "Phone" else "Speaker", spk)
    }

    b.addExtras(xiaomiFocus(ctx, name, text, incoming, if (incoming) answer else spk, if (incoming) decline else hangup))
    return b.build()
  }

  /**
   * HyperOS "focus notification" extras (Super Island / cover screen). HyperOS only shows these
   * for apps Xiaomi has approved; on other phones they are simply ignored.
   */
  private fun xiaomiFocus(ctx: Context, name: String, text: String, incoming: Boolean, primary: PendingIntent, secondary: PendingIntent): Bundle {
    val extras = Bundle()
    try {
      val param = JSONObject().put(
        "param_v2",
        JSONObject()
          .put("protocol", 1)
          .put("business", "call")
          .put("ticker", name)
          .put("aodTitle", name)
          .put("enableFloat", incoming)
          .put("updatable", true)
          .put("baseInfo", JSONObject().put("title", name).put("content", text).put("type", 2))
          .put(
            "hintInfo",
            JSONObject().put("type", 1).put("title", text)
              .put("actionInfo", JSONObject().put("action", "miui.focus.action_primary")),
          ),
      )
      extras.putString("miui.focus.param", param.toString())
      if (Build.VERSION.SDK_INT >= 23) {
        val icon = Icon.createWithResource(ctx, android.R.drawable.sym_action_call)
        val actions = Bundle()
        actions.putParcelable(
          "miui.focus.action_primary",
          Notification.Action.Builder(icon, if (incoming) "Answer" else "Speaker", primary).build(),
        )
        actions.putParcelable(
          "miui.focus.action_secondary",
          Notification.Action.Builder(icon, if (incoming) "Decline" else "End", secondary).build(),
        )
        extras.putBundle("miui.focus.actions", actions)
      }
    } catch (_: Exception) {}
    return extras
  }

  private fun isLocked(ctx: Context): Boolean = try {
    (ctx.getSystemService(Context.KEYGUARD_SERVICE) as android.app.KeyguardManager).isKeyguardLocked
  } catch (_: Exception) { true }

  fun lookupName(ctx: Context, number: String): String? {
    if (number.isBlank()) return null
    if (nameCache.containsKey(number)) return nameCache[number]
    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return null
    val name = try {
      ctx.contentResolver.query(
        Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number)),
        arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME),
        null, null, null
      )?.use { if (it.moveToFirst()) it.getString(0) else null }
    } catch (_: Exception) { null }
    nameCache[number] = name
    return name
  }
}
