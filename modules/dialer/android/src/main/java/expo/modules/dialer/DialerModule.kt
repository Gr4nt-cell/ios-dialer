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
private const val REQ_RINGTONE = 7312
private const val EXTRA_HANDLED = "expo.modules.dialer.DIAL_HANDLED"

class DialerModule : Module() {
  private var rolePromise: Promise? = null
  private var ringtonePromise: Promise? = null

  private val ctx: Context
    get() = appContext.reactContext ?: throw CodedException("Android context unavailable")

  private fun telecom(): TelecomManager = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager

  private fun isDefault(): Boolean = try {
    telecom().defaultDialerPackage == ctx.packageName
  } catch (_: Exception) { false }

  // the number a DIAL / VIEW tel: / CALL_BUTTON intent carries; "" opens an empty keypad,
  // null means the intent isn't a request to dial
  private fun dialNumber(intent: Intent): String? {
    val action = intent.action ?: return null
    if (action != Intent.ACTION_DIAL && action != Intent.ACTION_VIEW && action != Intent.ACTION_CALL_BUTTON) return null
    val data = intent.data
    if (data == null) return if (action == Intent.ACTION_VIEW) null else ""
    if (!"tel".equals(data.scheme, ignoreCase = true)) return null
    return (data.schemeSpecificPart ?: "").removePrefix("//").trim()
  }

  override fun definition() = ModuleDefinition {
    Name("Dialer")

    Events("onCallsChanged", "onDialIntent")

    // ---------- opened to dial a number (tel: links and "call" buttons in other apps) ----------
    // React Native's Linking only sees VIEW links; most apps send DIAL, so the module reads the
    // intent itself, both when the app starts and when it's already open.
    Function("takeLaunchNumber") { ->
      val intent = appContext.currentActivity?.intent ?: return@Function null
      if (intent.getBooleanExtra(EXTRA_HANDLED, false)) return@Function null
      val number = dialNumber(intent) ?: return@Function null
      intent.putExtra(EXTRA_HANDLED, true)
      number
    }

    OnNewIntent { intent ->
      val number = dialNumber(intent) ?: return@OnNewIntent
      intent.putExtra(EXTRA_HANDLED, true)
      appContext.currentActivity?.intent = intent
      try { sendEvent("onDialIntent", mapOf("number" to number)) } catch (_: Exception) {}
    }

    OnCreate {
      (appContext.reactContext?.applicationContext as? Application)?.let { CallManager.hook(it) }
      appContext.currentActivity?.let {
        CallManager.setActivity(it)
        // the module loads after the main screen has started, so record that it's on screen
        if (it.hasWindowFocus() || it.window?.decorView?.isShown == true) CallManager.markVisible(it, true)
      }
      try { PrivacyPrefs.cleanup(ctx) } catch (_: Exception) {}
      CallManager.listener = { json ->
        try { sendEvent("onCallsChanged", mapOf("json" to json)) } catch (_: Exception) {}
      }
      CallManager.emit()
    }

    OnDestroy {
      CallManager.listener = null
    }

    OnActivityEntersForeground {
      appContext.currentActivity?.let { CallManager.markVisible(it, true) }
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
      if (payload.requestCode == REQ_RINGTONE) {
        val p = ringtonePromise
        ringtonePromise = null
        if (payload.resultCode == android.app.Activity.RESULT_OK) {
          @Suppress("DEPRECATION")
          val uri = payload.data?.getParcelableExtra<Uri>(android.media.RingtoneManager.EXTRA_RINGTONE_PICKED_URI)
          Ringer.setAppRingtone(ctx, uri?.toString())
        }
        p?.resolve(Ringer.appRingtoneInfo(ctx))
      }
    }

    // ---------- ringtone (choose / test), for phones whose own ringtone won't play ----------

    AsyncFunction("pickRingtone") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(Ringer.appRingtoneInfo(ctx))
        return@AsyncFunction
      }
      val current = Ringer.appRingtoneUri(ctx)
      val intent = Intent(android.media.RingtoneManager.ACTION_RINGTONE_PICKER)
        .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_TYPE, android.media.RingtoneManager.TYPE_RINGTONE)
        .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true)
        .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false)
        .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_DEFAULT_URI, Settings.System.DEFAULT_RINGTONE_URI)
        .putExtra(android.media.RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, current ?: Settings.System.DEFAULT_RINGTONE_URI)
      ringtonePromise = promise
      try {
        activity.startActivityForResult(intent, REQ_RINGTONE)
      } catch (_: Exception) {
        ringtonePromise = null
        promise.resolve(Ringer.appRingtoneInfo(ctx))
      }
    }

    Function("getAppRingtone") { -> Ringer.appRingtoneInfo(ctx) }
    Function("resetAppRingtone") { -> Ringer.setAppRingtone(ctx, null); Ringer.appRingtoneInfo(ctx) }
    Function("testRingtone") { -> Ringer.preview(ctx) }
    Function("stopTestRingtone") { -> Ringer.stopPreview() }

    // Android 14+: incoming calls can only wake the screen full-screen when this is allowed
    Function("canFullScreen") { ->
      if (Build.VERSION.SDK_INT >= 34) {
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).canUseFullScreenIntent()
      } else true
    }

    Function("openFullScreenSettings") { ->
      try {
        if (Build.VERSION.SDK_INT >= 34) {
          ctx.startActivity(
            Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + ctx.packageName))
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
          )
        }
        true
      } catch (_: Exception) { false }
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
      Ringer.silence()
      try { telecom().silenceRinger() } catch (_: Exception) {}
      true
    }

    // ---------- Dynamic Island & rear screen ----------

    Function("canDrawOverlays") { -> IslandOverlay.canDraw(ctx) }

    Function("openOverlaySettings") { ->
      try {
        ctx.startActivity(
          Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
      } catch (_: Exception) { false }
    }

    Function("getOverlayPrefs") { ->
      mapOf("island" to IslandOverlay.islandEnabled(ctx), "rear" to IslandOverlay.rearEnabled(ctx))
    }

    Function("setOverlayPrefs") { island: Boolean, rear: Boolean -> IslandOverlay.setPrefs(ctx, island, rear) }

    // the island around the camera runs inside an accessibility service (only those windows can
    // be drawn over the status bar and still be tapped)
    Function("islandServiceEnabled") { ->
      IslandOverlay.serviceOn() || IslandAccessibilityService.isEnabled(ctx)
    }

    Function("openAccessibilitySettings") { ->
      try {
        ctx.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (_: Exception) { false }
    }

    // sideloaded apps on Android 13+ must have "restricted settings" allowed before
    // their accessibility service can be switched on: that's on the app's info page
    Function("openAppInfo") { ->
      try {
        ctx.startActivity(
          Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.packageName))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
      } catch (_: Exception) { false }
    }

    // Soft tick for the tab bar, at a fraction of the normal strength (0..1).
    Function("softTick") { strength: Double ->
      try {
        val v: android.os.Vibrator? = if (android.os.Build.VERSION.SDK_INT >= 31) {
          (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? android.os.VibratorManager)?.defaultVibrator
        } else {
          @Suppress("DEPRECATION")
          ctx.getSystemService(Context.VIBRATOR_SERVICE) as? android.os.Vibrator
        }
        if (v != null && v.hasVibrator()) {
          val s = strength.coerceIn(0.05, 1.0).toFloat()
          if (android.os.Build.VERSION.SDK_INT >= 30 &&
            v.areAllPrimitivesSupported(android.os.VibrationEffect.Composition.PRIMITIVE_TICK)
          ) {
            v.vibrate(
              android.os.VibrationEffect.startComposition()
                .addPrimitive(android.os.VibrationEffect.Composition.PRIMITIVE_TICK, s)
                .compose(),
            )
          } else if (android.os.Build.VERSION.SDK_INT >= 26) {
            val amp = (255 * s * 0.6f).toInt().coerceIn(1, 255)
            v.vibrate(android.os.VibrationEffect.createOneShot(8, amp))
          }
        }
      } catch (_: Exception) {}
      true
    }

    // Sample portrait (AI-generated, not a real person) for the depth preview in Settings,
    // copied out of the app's assets so the depth cut-out can read it like any photo.
    Function("previewPhotoUri") { ->
      try {
        val out = java.io.File(ctx.cacheDir, "preview_woman.jpg")
        if (!out.exists() || out.length() == 0L) {
          ctx.assets.open("preview_woman.jpg").use { input -> out.outputStream().use { input.copyTo(it) } }
        }
        android.net.Uri.fromFile(out).toString()
      } catch (_: Exception) { null }
    }

    // ---------- privacy ----------

    Function("getPrivacy") { -> PrivacyPrefs.all(ctx) }
    Function("setPrivacyBool") { key: String, value: Boolean -> PrivacyPrefs.set(ctx, key, value) }
    Function("setPrivacyString") { key: String, value: String -> PrivacyPrefs.set(ctx, key, value) }
    Function("setPrivacyInt") { key: String, value: Int -> PrivacyPrefs.set(ctx, key, value) }
    Function("deleteAllPrivateData") { -> PrivacyPrefs.deleteEverything(ctx) }

    Function("getIslandSize") { ->
      val z = IslandOverlay.size(ctx)
      mapOf("height" to z.height, "width" to z.width, "dx" to z.dx, "dy" to z.dy)
    }

    Function("setIslandSize") { height: Int, width: Int, dx: Int, dy: Int ->
      IslandOverlay.setSize(ctx, height, width, dx, dy)
    }

    Function("previewIsland") { -> IslandOverlay.preview(6) }

    Function("setCallScreenShown") { shown: Boolean ->
      IslandOverlay.callScreenShown = shown
      IslandOverlay.refresh()
    }

    // true once after the app was opened from the island / call notification
    Function("consumeShowCall") { ->
      val v = CallManager.showCallRequested
      CallManager.showCallRequested = false
      v
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

    // Saving goes through the content provider rather than expo-contacts, whose
    // Android write path fails on both insert and update for some accounts.
    AsyncFunction("saveContact") { contact: Map<String, Any?> ->
      val id = (contact["id"] as? String)?.toLongOrNull()
      @Suppress("UNCHECKED_CAST")
      val phones = (contact["phoneNumbers"] as? List<Map<String, Any?>>) ?: emptyList()
      @Suppress("UNCHECKED_CAST")
      val emails = (contact["emails"] as? List<Map<String, Any?>>) ?: emptyList()
      ContactTools.saveContact(
        ctx,
        id,
        contact["firstName"] as? String,
        contact["lastName"] as? String,
        contact["company"] as? String,
        phones,
        emails,
      ).toString()
    }

    AsyncFunction("addNumberToContact") { contactId: String, label: String?, number: String ->
      val id = contactId.toLongOrNull()
      if (id == null) false else ContactTools.addNumber(ctx, id, label, number)
    }

    // ---------- voice control ----------
    Function("canListen") { -> Listener.available(ctx) }

    AsyncFunction("listen") { promise: Promise ->
      Listener.listen(ctx) { text, error ->
        if (text != null) promise.resolve(text) else promise.reject("voice", error ?: "Speech recognition failed", null)
      }
    }

    Function("stopListening") { -> Listener.stop() }

    // ---------- caller announcement ----------
    Function("getAnnouncePrefs") { ->
      mapOf(
        "on" to Announcer.enabled(ctx),
        "repeat" to Announcer.repeats(ctx),
        "unknown" to Announcer.announcesUnknown(ctx),
      )
    }

    Function("setAnnouncePrefs") { on: Boolean, repeat: Int, unknown: Boolean ->
      Announcer.setPrefs(ctx, on, repeat, unknown)
    }

    Function("previewAnnounce") { line: String -> Announcer.preview(ctx, line) }

    Function("getAnnounceVoices") { -> Announcer.voices(ctx) }
    Function("getAnnounceVoice") { -> Announcer.chosenVoice(ctx) }
    Function("setAnnounceVoice") { name: String? -> Announcer.setVoice(ctx, name) }

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
