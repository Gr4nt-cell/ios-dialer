package expo.modules.dialer

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.telecom.Call
import android.telecom.CallAudioState
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telecom.VideoProfile
import android.view.WindowManager
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

/**
 * Single source of truth for calls handed to us by Telecom.
 * All Call objects are touched on the main thread only.
 */
object CallManager {
  @Volatile var service: DialerInCallService? = null
  @Volatile var lastSnapshot: String = "{\"calls\":[],\"audio\":null}"
  var listener: ((String) -> Unit)? = null
  var appContext: Context? = null

  private val calls = LinkedHashMap<String, Call>()
  private val ids = HashMap<Call, String>()
  private val incomingIds = HashSet<String>()
  private val postDial = HashMap<String, String>()
  private val accountHandles = HashMap<String, PhoneAccountHandle>()
  private var counter = 0
  private val main = Handler(Looper.getMainLooper())
  private var hooked = false
  private var activityRef: WeakReference<Activity>? = null
  private var proximity: PowerManager.WakeLock? = null

  private val callback = object : Call.Callback() {
    override fun onStateChanged(call: Call, state: Int) = emit()
    override fun onDetailsChanged(call: Call, details: Call.Details) = emit()
    override fun onPostDialWait(call: Call, remainingPostDialSequence: String) {
      ids[call]?.let { postDial[it] = remainingPostDialSequence }
      emit()
    }
    override fun onConferenceableCallsChanged(call: Call, conferenceableCalls: List<Call>) = emit()
    override fun onChildrenChanged(call: Call, children: List<Call>) = emit()
    override fun onParentChanged(call: Call, parent: Call?) = emit()
  }

  // ---------- registry ----------

  fun add(call: Call) {
    val id = "c" + (++counter)
    calls[id] = call
    ids[call] = id
    if (stateOf(call) == Call.STATE_RINGING || isIncoming(call)) incomingIds.add(id)
    call.registerCallback(callback)
    emit()
  }

  fun remove(call: Call) {
    try { call.unregisterCallback(callback) } catch (_: Exception) {}
    val id = ids.remove(call)
    if (id != null) {
      calls.remove(id)
      postDial.remove(id)
      incomingIds.remove(id)
    }
    emit()
  }

  fun idOf(call: Call): String? = ids[call]

  private fun isIncoming(call: Call): Boolean =
    Build.VERSION.SDK_INT >= 29 && call.details.callDirection == Call.Details.DIRECTION_INCOMING

  @Suppress("DEPRECATION")
  fun stateOf(call: Call): Int = if (Build.VERSION.SDK_INT >= 31) call.details.state else call.state

  private fun stateName(s: Int): String = when (s) {
    Call.STATE_NEW -> "new"
    Call.STATE_DIALING -> "dialing"
    Call.STATE_RINGING -> "ringing"
    Call.STATE_HOLDING -> "holding"
    Call.STATE_ACTIVE -> "active"
    Call.STATE_DISCONNECTED -> "disconnected"
    Call.STATE_SELECT_PHONE_ACCOUNT -> "select_account"
    Call.STATE_CONNECTING -> "connecting"
    Call.STATE_DISCONNECTING -> "disconnecting"
    11 -> "pulling"
    12 -> "audio_processing"
    13 -> "simulated_ringing"
    else -> "unknown"
  }

  fun topLevelCalls(): List<Call> = calls.values.filter { it.parent == null }

  fun hasLiveCalls(): Boolean = calls.values.any { stateOf(it) != Call.STATE_DISCONNECTED }

  fun ringingCall(): Call? = topLevelCalls().firstOrNull { stateOf(it) == Call.STATE_RINGING }

  fun primaryCall(): Call? {
    val top = topLevelCalls()
    return top.firstOrNull { stateOf(it) == Call.STATE_ACTIVE }
      ?: top.firstOrNull {
        val s = stateOf(it)
        s == Call.STATE_DIALING || s == Call.STATE_CONNECTING || s == Call.STATE_SELECT_PHONE_ACCOUNT || s == Call.STATE_NEW
      }
      ?: top.firstOrNull { stateOf(it) == Call.STATE_HOLDING }
  }

  // ---------- phone accounts (SIMs) ----------

  fun accountKey(h: PhoneAccountHandle): String {
    val key = h.componentName.flattenToString() + "|" + h.id
    accountHandles[key] = h
    return key
  }

  fun accountHandle(key: String): PhoneAccountHandle? = accountHandles[key]

  fun accountJson(ctx: Context, h: PhoneAccountHandle): JSONObject {
    val o = JSONObject()
    o.put("key", accountKey(h))
    try {
      val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
      val acc = tm.getPhoneAccount(h)
      o.put("label", acc?.label?.toString() ?: "SIM")
      o.put("number", acc?.address?.schemeSpecificPart ?: "")
    } catch (_: Exception) {
      o.put("label", "SIM")
      o.put("number", "")
    }
    return o
  }

  @Suppress("DEPRECATION")
  private fun selectableAccounts(call: Call): JSONArray {
    val arr = JSONArray()
    val ctx = appContext ?: return arr
    var handles: List<PhoneAccountHandle>? = try {
      call.details.intentExtras?.getParcelableArrayList<PhoneAccountHandle>(Call.AVAILABLE_PHONE_ACCOUNTS)
    } catch (_: Exception) { null }
    if (handles.isNullOrEmpty()) {
      handles = try {
        (ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager).callCapablePhoneAccounts
      } catch (_: Exception) { emptyList() }
    }
    handles?.forEach { arr.put(accountJson(ctx, it)) }
    return arr
  }

  // ---------- snapshot sent to JS ----------

  private fun buildSnapshot(): String {
    val arr = JSONArray()
    for ((id, call) in calls) {
      val d = call.details
      val state = stateOf(call)
      val o = JSONObject()
      o.put("id", id)
      o.put("state", stateName(state))
      o.put("number", d.handle?.schemeSpecificPart ?: "")
      o.put("name", d.callerDisplayName ?: JSONObject.NULL)
      o.put("connectTime", d.connectTimeMillis)
      o.put("incoming", incomingIds.contains(id))
      o.put("canHold", d.can(Call.Details.CAPABILITY_HOLD))
      o.put("canMerge", d.can(Call.Details.CAPABILITY_MERGE_CONFERENCE) || call.conferenceableCalls.isNotEmpty())
      o.put("canSwap", d.can(Call.Details.CAPABILITY_SWAP_CONFERENCE))
      o.put("isConference", d.hasProperty(Call.Details.PROPERTY_CONFERENCE))
      o.put("childCount", call.children.size)
      o.put("parentId", call.parent?.let { ids[it] } ?: JSONObject.NULL)
      o.put("postDialWait", postDial[id] ?: JSONObject.NULL)
      o.put("disconnectLabel", d.disconnectCause?.label?.toString() ?: JSONObject.NULL)
      if (state == Call.STATE_SELECT_PHONE_ACCOUNT) o.put("accounts", selectableAccounts(call))
      arr.put(o)
    }
    val root = JSONObject()
    root.put("calls", arr)
    root.put("recording", RecordingService.stateJson())
    val audio = service?.callAudioState
    if (audio != null) {
      root.put(
        "audio",
        JSONObject()
          .put("muted", audio.isMuted)
          .put("route", audio.route)
          .put("supported", audio.supportedRouteMask)
      )
    } else {
      root.put("audio", JSONObject.NULL)
    }
    return root.toString()
  }

  fun emit() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      main.post { emit() }
      return
    }
    lastSnapshot = try { buildSnapshot() } catch (_: Exception) { lastSnapshot }
    try { listener?.invoke(lastSnapshot) } catch (_: Exception) {}
    service?.let { CallNotifications.update(it) }
    activityRef?.get()?.let { applyFlags(it) }
    updateProximity()
  }

  // ---------- call actions (from JS / notifications) ----------

  private fun withCall(id: String, block: (Call) -> Unit) {
    main.post {
      val call = calls[id] ?: return@post
      try { block(call) } catch (_: Exception) {}
    }
  }

  fun answer(id: String) = withCall(id) { it.answer(VideoProfile.STATE_AUDIO_ONLY) }

  fun reject(id: String, message: String?) = withCall(id) {
    if (message.isNullOrEmpty()) it.reject(false, null) else it.reject(true, message)
  }

  fun hangup(id: String) = withCall(id) {
    if (stateOf(it) == Call.STATE_RINGING) it.reject(false, null) else it.disconnect()
  }

  fun hold(id: String, on: Boolean) = withCall(id) { if (on) it.hold() else it.unhold() }

  fun holdAndAnswer(id: String) = withCall(id) { ringing ->
    topLevelCalls().filter { c -> c != ringing && stateOf(c) == Call.STATE_ACTIVE }.forEach { c -> c.hold() }
    ringing.answer(VideoProfile.STATE_AUDIO_ONLY)
  }

  fun endAndAnswer(id: String) = withCall(id) { ringing ->
    topLevelCalls().filter { c -> c != ringing && stateOf(c) != Call.STATE_RINGING }.forEach { c -> c.disconnect() }
    ringing.answer(VideoProfile.STATE_AUDIO_ONLY)
  }

  fun merge(id: String) = withCall(id) {
    val other = it.conferenceableCalls.firstOrNull()
    if (other != null) it.conference(other) else it.mergeConference()
  }

  fun swap() {
    main.post {
      try {
        val top = topLevelCalls()
        val active = top.firstOrNull { stateOf(it) == Call.STATE_ACTIVE }
        val held = top.firstOrNull { stateOf(it) == Call.STATE_HOLDING }
        if (active != null && active.details.can(Call.Details.CAPABILITY_SWAP_CONFERENCE)) active.swapConference()
        else held?.unhold()
      } catch (_: Exception) {}
    }
  }

  fun mute(on: Boolean) {
    main.post { service?.setMuted(on) }
  }

  @Suppress("DEPRECATION")
  fun setRoute(route: Int) {
    main.post { service?.setAudioRoute(route) }
  }

  fun dtmf(id: String, digit: String) = withCall(id) { call ->
    if (digit.isEmpty()) return@withCall
    call.playDtmfTone(digit[0])
    main.postDelayed({ try { call.stopDtmfTone() } catch (_: Exception) {} }, 160)
  }

  fun postDialContinue(id: String, proceed: Boolean) = withCall(id) {
    postDial.remove(id)
    it.postDialContinue(proceed)
    emit()
  }

  fun selectAccount(id: String, key: String) = withCall(id) {
    val handle = accountHandles[key] ?: return@withCall
    it.phoneAccountSelected(handle, false)
  }

  // ---------- activity: show over lock screen while a call is live ----------

  fun hook(app: Application) {
    appContext = app.applicationContext
    if (hooked) return
    hooked = true
    app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) { track(activity) }
      override fun onActivityStarted(activity: Activity) {}
      override fun onActivityResumed(activity: Activity) { track(activity) }
      override fun onActivityPaused(activity: Activity) {}
      override fun onActivityStopped(activity: Activity) {}
      override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
      override fun onActivityDestroyed(activity: Activity) {}
    })
  }

  private fun track(activity: Activity) {
    if (activity is AnswerActivity) return
    activityRef = WeakReference(activity)
    applyFlags(activity)
  }

  fun setActivity(activity: Activity) {
    main.post { track(activity) }
  }

  @Suppress("DEPRECATION")
  private fun applyFlags(activity: Activity) {
    val show = hasLiveCalls()
    try {
      if (Build.VERSION.SDK_INT >= 27) {
        activity.setShowWhenLocked(show)
        activity.setTurnScreenOn(show)
      } else {
        val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        if (show) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
      }
    } catch (_: Exception) {}
  }

  fun launchUi(ctx: Context) {
    val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    intent.putExtra("dialer_show_call", true)
    try { ctx.startActivity(intent) } catch (_: Exception) {}
  }

  // ---------- proximity: screen off when the phone is at your ear ----------

  private fun updateProximity() {
    val ctx = appContext ?: return
    val audio = service?.callAudioState
    val talking = topLevelCalls().any {
      val s = stateOf(it)
      s == Call.STATE_ACTIVE || s == Call.STATE_DIALING || s == Call.STATE_CONNECTING
    }
    val need = talking && audio != null && audio.route == CallAudioState.ROUTE_EARPIECE
    try {
      if (need) {
        if (proximity == null) {
          val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
          if (pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
            proximity = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "dialer:proximity")
          }
        }
        proximity?.let { if (!it.isHeld) it.acquire(4 * 60 * 60 * 1000L) }
      } else {
        proximity?.let { if (it.isHeld) it.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY) }
      }
    } catch (_: Exception) {}
  }
}
