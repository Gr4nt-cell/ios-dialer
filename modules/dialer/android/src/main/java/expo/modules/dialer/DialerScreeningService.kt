package expo.modules.dialer

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.ContactsContract
import android.telecom.Call
import android.telecom.CallScreeningService
import androidx.core.content.ContextCompat

/**
 * Android asks the default phone app about each incoming call before it rings. Calls from people
 * in your contacts always ring; for unknown and hidden numbers this follows your choice in
 * Settings › Call Screening: ring, ring silently, screen automatically, or decline.
 * Everything is decided on the phone from your own contacts.
 */
class DialerScreeningService : CallScreeningService() {

  override fun onScreenCall(details: Call.Details) {
    val incoming = Build.VERSION.SDK_INT < 29 || details.callDirection == Call.Details.DIRECTION_INCOMING
    if (!incoming) {
      respondToCall(details, CallResponse.Builder().build())
      return
    }
    val number = details.handle?.schemeSpecificPart.orEmpty()
    val hidden = number.isBlank()
    val rule = when {
      hidden -> PrivacyPrefs.hiddenCallers(this)
      isContact(number) -> "ring"
      else -> PrivacyPrefs.unknownCallers(this)
    }
    val r = CallResponse.Builder()
    when (rule) {
      "decline" -> r.setDisallowCall(true).setRejectCall(true).setSkipCallLog(false).setSkipNotification(false)
      "silence" -> if (Build.VERSION.SDK_INT >= 29) r.setSilenceCall(true)
      "screen" -> {
        // rings silently and the app answers it to screen it
        if (Build.VERSION.SDK_INT >= 29) r.setSilenceCall(true)
        CallScreener.markAuto(number)
      }
    }
    try { respondToCall(details, r.build()) } catch (_: Exception) {}
  }

  private fun isContact(number: String): Boolean {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) return true
    return try {
      contentResolver.query(
        Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number)),
        arrayOf(ContactsContract.PhoneLookup._ID),
        null, null, null,
      )?.use { it.moveToFirst() } ?: false
    } catch (_: Exception) { true }
  }
}
