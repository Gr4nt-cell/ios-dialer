package expo.modules.dialer

import android.app.Application
import android.app.role.RoleManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.BlockedNumberContract
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.TelephonyManager
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

private const val REQ_ROLE = 7311

class DialerModule : Module() {
  private var rolePromise: Promise? = null

  private val ctx: Context
    get() = appContext.reactContext ?: throw CodedException("Android context unavailable")

  private fun telecom(): TelecomManager = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

  private fun isDefault(): Boolean = try {
    telecom().defaultDialerPackage == ctx.packageName
  } catch (_: Exception) { false }

  override fun definition() = ModuleDefinition {
    Name("Dialer")

    Events("onCallsChanged")

    OnCreate {
      (appContext.reactContext?.applicationContext as? Application)?.let { CallManager.hook(it) }
      appContext.currentActivity?.let { CallManager.setActivity(it) }
      CallManager.listener = { json ->
        try { sendEvent("onCallsChanged", mapOf("json" to json)) } catch (_: Exception) {}
      }
      CallManager.emit()
    }

    OnDestroy {
      CallManager.listener = null
    }

    // ---------- default phone app ----------

    Function("isDefaultDialer") { -> isDefault() }

    AsyncFunction("requestDefaultDialer") { promise: Promise ->
      if (isDefault()) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val intent: Intent = if (Build.VERSION.SDK_INT >= 29) {
        val rm = ctx.getSystemService(RoleManager::class.java)
        if (rm == null || !rm.isRoleAvailable(RoleManager.ROLE_DIALER)) {
          promise.resolve(false)
          return@AsyncFunction
        }
        rm.createRequestRoleIntent(RoleManager.ROLE_DIALER)
      } else {
        Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
          .putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, ctx.packageName)
      }
      rolePromise?.resolve(isDefault())
      rolePromise = promise
      try {
        activity.startActivityForResult(intent, REQ_ROLE)
      } catch (e: Exception) {
        rolePromise = null
        promise.resolve(false)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode == REQ_ROLE) {
        rolePromise?.resolve(isDefault())
        rolePromise = null
      }
    }

    Function("openDefaultAppsSettings") { ->
      try {
        ctx.startActivity(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (_: Exception) { false }
    }

    // ---------- placing calls ----------

    AsyncFunction("placeCall") { number: String, accountKey: String? ->
      val uri = if (number.startsWith("voicemail:")) Uri.fromParts("voicemail", "", null) else Uri.fromParts("tel", number, null)
      val extras = Bundle()
      accountKey?.let { CallManager.accountHandle(it) }?.let {
        extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, it)
      }
      telecom().placeCall(uri, extras)
      true
    }

    Function("getPhoneAccounts") { ->
      val arr = JSONArray()
      var defaultKey: String? = null
      try {
        val tm = telecom()
        tm.callCapablePhoneAccounts.forEach { arr.put(CallManager.accountJson(ctx, it)) }
        tm.getDefaultOutgoingPhoneAccount("tel")?.let { defaultKey = CallManager.accountKey(it) }
      } catch (_: Exception) {}
      JSONObject().put("accounts", arr).put("defaultKey", defaultKey ?: JSONObject.NULL).toString()
    }

    // ---------- in-call control ----------

    Function("getState") { -> CallManager.lastSnapshot }
    Function("answer") { id: String -> CallManager.answer(id) }
    Function("reject") { id: String, message: String? -> CallManager.reject(id, message) }
    Function("hangup") { id: String -> CallManager.hangup(id) }
    Function("hold") { id: String, on: Boolean -> CallManager.hold(id, on) }
    Function("holdAndAnswer") { id: String -> CallManager.holdAndAnswer(id) }
    Function("endAndAnswer") { id: String -> CallManager.endAndAnswer(id) }
    Function("merge") { id: String -> CallManager.merge(id) }
    Function("swap") { -> CallManager.swap() }
    Function("mute") { on: Boolean -> CallManager.mute(on) }
    Function("setAudioRoute") { route: Int -> CallManager.setRoute(route) }
    Function("dtmf") { id: String, digit: String -> CallManager.dtmf(id, digit) }
    Function("postDialContinue") { id: String, proceed: Boolean -> CallManager.postDialContinue(id, proceed) }
    Function("selectAccount") { id: String, key: String -> CallManager.selectAccount(id, key) }
    Function("silenceRinger") { ->
      try { telecom().silenceRinger(); true } catch (_: Exception) { false }
    }

    // ---------- system block list (works while this app is the default phone app) ----------

    Function("canBlockNumbers") { ->
      try { isDefault() && BlockedNumberContract.canCurrentUserBlockNumbers(ctx) } catch (_: Exception) { false }
    }

    Function("blockNumber") { number: String ->
      try {
        val values = ContentValues()
        values.put(BlockedNumberContract.BlockedNumbers.COLUMN_ORIGINAL_NUMBER, number)
        ctx.contentResolver.insert(BlockedNumberContract.BlockedNumbers.CONTENT_URI, values)
        true
      } catch (_: Exception) { false }
    }

    Function("unblockNumber") { number: String ->
      try { BlockedNumberContract.unblock(ctx, number) > 0 } catch (_: Exception) { false }
    }

    // ---------- contacts: photo, WhatsApp ----------

    // idKind "raw": the id is a raw contact id (what addContactAsync returns)
    AsyncFunction("setContactPhoto") { id: String, uri: String?, idKind: String? ->
      val contactId = if (idKind == "raw") ContactTools.contactIdForRaw(ctx, id.toLong()) else id.toLongOrNull()
      if (contactId == null) false else ContactTools.setContactPhoto(ctx, contactId, uri)
    }

    Function("hasWhatsApp") { -> ContactTools.whatsAppPackage(ctx) != null }

    Function("openWhatsApp") { contactId: String?, number: String, kind: String ->
      ContactTools.openWhatsApp(ctx, contactId?.toLongOrNull(), number, kind)
    }

    Function("toE164") { number: String -> ContactTools.toE164Digits(ctx, number) }

    // ---------- call screen depth: cut the person out of their photo ----------

    AsyncFunction("prepareDepth") { uri: String, promise: Promise ->
      val context = ctx
      Thread {
        var settled = false
        fun done(value: Any?) {
          if (settled) return
          settled = true
          promise.resolve(value)
        }
        try {
          val bytes = ContactTools.readBytes(context, uri)
          if (bytes == null) {
            done(null)
            return@Thread
          }
          val key = ContactTools.md5(bytes)
          val base = ContactTools.cacheFile(context, "$key-base.jpg")
          val fg = ContactTools.cacheFile(context, "$key-fg.png")
          val none = ContactTools.cacheFile(context, "$key-none")
          val result = { mapOf("base" to Uri.fromFile(base).toString(), "foreground" to Uri.fromFile(fg).toString()) }
          if (base.exists() && fg.exists()) {
            done(result())
            return@Thread
          }
          if (none.exists()) {
            done(null)
            return@Thread
          }
          val bmp = ContactTools.decode(bytes, 1280)
          if (bmp == null) {
            done(null)
            return@Thread
          }
          ContactTools.writeJpeg(bmp, base)
          val segmenter = SubjectSegmentation.getClient(
            SubjectSegmenterOptions.Builder().enableForegroundBitmap().build(),
          )
          segmenter.process(InputImage.fromBitmap(bmp, 0))
            .addOnSuccessListener { r ->
              val cut = r.foregroundBitmap
              if (cut == null) {
                try { none.createNewFile() } catch (_: Exception) {}
                done(null)
              } else {
                Thread {
                  try {
                    ContactTools.writePng(cut, fg)
                    done(result())
                  } catch (_: Throwable) {
                    done(null)
                  }
                }.start()
              }
              segmenter.close()
            }
            .addOnFailureListener {
              // usually the on-device model is still downloading; try again next call
              done(null)
              segmenter.close()
            }
        } catch (_: Throwable) {
          done(null)
        }
      }.start()
    }

    // ---------- call recording ----------

    Function("startRecording") { number: String -> RecordingService.start(ctx, number) }
    Function("stopRecording") { -> RecordingService.stop(ctx); true }
    Function("recordingError") { -> RecordingService.lastError }
    Function("listRecordings") { -> RecordingService.list(ctx) }
    Function("deleteRecording") { name: String -> RecordingService.delete(ctx, name) }

    // ---------- USSD & codes ----------

    AsyncFunction("sendUssd") { code: String, accountKey: String?, promise: Promise ->
      if (Build.VERSION.SDK_INT < 26) {
        promise.resolve(mapOf("ok" to false, "code" to -100))
        return@AsyncFunction
      }
      var tm = ctx.getSystemService(TelephonyManager::class.java)
      if (tm == null) {
        promise.resolve(mapOf("ok" to false, "code" to -101))
        return@AsyncFunction
      }
      accountKey?.let { CallManager.accountHandle(it) }?.let { handle ->
        tm?.createForPhoneAccountHandle(handle)?.let { tm = it }
      }
      var done = false
      try {
        tm!!.sendUssdRequest(code, object : TelephonyManager.UssdResponseCallback() {
          override fun onReceiveUssdResponse(telephonyManager: TelephonyManager, request: String, response: CharSequence) {
            if (done) return
            done = true
            promise.resolve(mapOf("ok" to true, "message" to response.toString()))
          }

          override fun onReceiveUssdResponseFailed(telephonyManager: TelephonyManager, request: String, failureCode: Int) {
            if (done) return
            done = true
            promise.resolve(mapOf("ok" to false, "code" to failureCode))
          }
        }, Handler(Looper.getMainLooper()))
      } catch (e: SecurityException) {
        done = true
        promise.reject(CodedException("Phone permission is needed to run USSD codes", e))
      }
    }

    // *#*#code#*#* "secret" codes — only the default phone app may send these.
    Function("sendSpecialCode") { code: String ->
      if (Build.VERSION.SDK_INT >= 26) {
        try {
          ctx.getSystemService(TelephonyManager::class.java)?.sendDialerSpecialCode(code.trim('*', '#'))
          true
        } catch (_: Exception) { false }
      } else {
        false
      }
    }
  }
}
