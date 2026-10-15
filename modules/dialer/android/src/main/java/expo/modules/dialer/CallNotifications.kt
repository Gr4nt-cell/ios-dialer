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
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.telecom.Call
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

object CallNotifications {
  private const val CH_INCOMING = "dialer_incoming_v1"
  private const val CH_ONGOING = "dialer_ongoing_v1"
  private const val ID = 4401
  const val ACTION_DECLINE = "expo.modules.dialer.DECLINE"
  const val ACTION_HANGUP = "expo.modules.dialer.HANGUP"

  private var lastKey: String? = null
  private val nameCache = HashMap<String, String?>()

  fun createChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
    val incoming = NotificationChannel(CH_INCOMING, "Incoming calls", NotificationManager.IMPORTANCE_HIGH).apply {
      setSound(null, null) // Telecom plays the ringtone
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    val ongoing = NotificationChannel(CH_ONGOING, "Ongoing calls", NotificationManager.IMPORTANCE_LOW)
    nm.createNotificationChannels(listOf(incoming, ongoing))
  }

  fun canNotify(ctx: Context): Boolean = NotificationManagerCompat.from(ctx).areNotificationsEnabled()

  @SuppressLint("MissingPermission")
  fun update(ctx: Context) {
    val ringing = CallManager.ringingCall()
    val ongoing = CallManager.primaryCall()
    val nm = NotificationManagerCompat.from(ctx)
    try {
      if (ringing != null) {
        val key = "in:" + CallManager.idOf(ringing)
        if (key != lastKey) nm.notify(ID, incoming(ctx, ringing))
        lastKey = key
      } else if (ongoing != null) {
        val key = "on:" + CallManager.idOf(ongoing) + ":" + CallManager.stateOf(ongoing) + ":" + ongoing.details.connectTimeMillis
        if (key != lastKey) nm.notify(ID, ongoing(ctx, ongoing))
        lastKey = key
      } else {
        cancel(ctx)
      }
    } catch (_: SecurityException) {
    } catch (_: Exception) {
    }
  }

  fun cancel(ctx: Context) {
    lastKey = null
    try { NotificationManagerCompat.from(ctx).cancel(ID) } catch (_: Exception) {}
  }

  private fun flags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  private fun openApp(ctx: Context): PendingIntent? {
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

  private fun title(ctx: Context, call: Call): String {
    val number = call.details.handle?.schemeSpecificPart ?: ""
    return lookupName(ctx, number)
      ?: call.details.callerDisplayName?.takeIf { it.isNotBlank() }
      ?: number.ifEmpty { "Unknown" }
  }

  private fun incoming(ctx: Context, call: Call): Notification {
    val id = CallManager.idOf(call) ?: ""
    val answer = PendingIntent.getActivity(
      ctx, 3,
      Intent(ctx, AnswerActivity::class.java).putExtra("id", id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      flags()
    )
    val open = openApp(ctx)
    return NotificationCompat.Builder(ctx, CH_INCOMING)
      .setSmallIcon(android.R.drawable.sym_action_call)
      .setContentTitle(title(ctx, call))
      .setContentText("Incoming call")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setOnlyAlertOnce(true)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .addAction(0, "Decline", broadcast(ctx, ACTION_DECLINE, id, 4))
      .addAction(0, "Answer", answer)
      .build()
  }

  private fun ongoing(ctx: Context, call: Call): Notification {
    val id = CallManager.idOf(call) ?: ""
    val state = CallManager.stateOf(call)
    val text = when (state) {
      Call.STATE_HOLDING -> "On hold"
      Call.STATE_ACTIVE -> "Ongoing call"
      else -> "Calling…"
    }
    val b = NotificationCompat.Builder(ctx, CH_ONGOING)
      .setSmallIcon(android.R.drawable.sym_action_call)
      .setContentTitle(title(ctx, call))
      .setContentText(text)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(openApp(ctx))
      .addAction(0, "Hang up", broadcast(ctx, ACTION_HANGUP, id, 5))
    val connected = call.details.connectTimeMillis
    if (state == Call.STATE_ACTIVE && connected > 0) {
      b.setWhen(connected).setShowWhen(true).setUsesChronometer(true)
    }
    return b.build()
  }

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
