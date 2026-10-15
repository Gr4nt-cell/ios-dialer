package expo.modules.dialer

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telecom.Call
import android.text.TextUtils
import android.util.TypedValue
import android.view.Display
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * "Dynamic Island" for calls: while a call is live and the app is in the background, a black
 * pill sits around the selfie camera with the call timer. Tap it to expand into a card with
 * mute / speaker / end (or decline / answer while ringing); tap the name to open the call screen.
 *
 * The same call card is also drawn on any secondary built-in screen the phone exposes to apps
 * (for example a rear / cover display), so calls can be answered and controlled from there.
 * Both need the "Display over other apps" permission.
 */
object IslandOverlay {
  private const val PREFS = "dialer_overlay"
  private val main = Handler(Looper.getMainLooper())

  private var island: FrameLayout? = null
  private var islandWm: WindowManager? = null
  private var islandViaService = false

  // accessibility service that hosts the island above the status bar (null when not enabled)
  private var service: java.lang.ref.WeakReference<IslandAccessibilityService>? = null
  private fun svc(): IslandAccessibilityService? = service?.get()

  /** Set from JS: true while the in-app call screen is showing (no island needed then). */
  @Volatile var callScreenShown = false

  // geometry of the current island (px)
  private var pillHeightPx = 0
  private var cameraGapPx = 0
  private var cameraClearPx = 0

  fun attachService(s: IslandAccessibilityService) {
    service = java.lang.ref.WeakReference(s)
    main.post { hideIsland(); refresh() }
  }

  fun detachService(s: IslandAccessibilityService) {
    if (svc() !== s) return
    main.post {
      if (islandViaService) hideIsland()
      service = null
      refresh()
    }
  }

  fun serviceOn(): Boolean = svc() != null
  private var expanded = false
  private var lastInteraction = 0L

  private val rear = HashMap<Int, Pair<WindowManager, FrameLayout>>()

  private val ticker = object : Runnable {
    override fun run() {
      render()
      main.postDelayed(this, 1000)
    }
  }

  // ---------- preferences / permission ----------

  fun islandEnabled(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getBoolean("island", true)
  fun rearEnabled(ctx: Context) = ctx.getSharedPreferences(PREFS, 0).getBoolean("rear", true)

  fun setPrefs(ctx: Context, island: Boolean, rear: Boolean) {
    ctx.getSharedPreferences(PREFS, 0).edit().putBoolean("island", island).putBoolean("rear", rear).apply()
    refresh()
  }

  fun canDraw(ctx: Context) = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(ctx)

  // ---------- state ----------

  fun refresh() {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      main.post { refresh() }
      return
    }
    val ctx = CallManager.appContext ?: return
    val call = CallManager.ringingCall() ?: CallManager.primaryCall()
    val allowed = call != null && canDraw(ctx)

    val viaService = svc() != null
    val wantIsland = allowedIsland(ctx, call != null, viaService)
    if (wantIsland) {
      if (island != null && islandViaService != viaService) hideIsland()
      showIsland(ctx)
    } else hideIsland()
    if (allowed && rearEnabled(ctx)) showRear(ctx) else hideRear()

    if (island != null || rear.isNotEmpty()) {
      main.removeCallbacks(ticker)
      main.post(ticker)
    } else {
      main.removeCallbacks(ticker)
    }
  }

  private fun allowedIsland(ctx: Context, hasCall: Boolean, viaService: Boolean): Boolean {
    if (!hasCall || !islandEnabled(ctx)) return false
    return if (viaService) {
      // above everything, including this app: hide only while the call screen itself is open
      !(CallManager.isAppVisible() && callScreenShown)
    } else {
      // fallback window can't reach the camera area; only use it while the app is in the background
      canDraw(ctx) && !CallManager.isAppVisible()
    }
  }

  fun hideAll() {
    main.post {
      hideIsland()
      hideRear()
      main.removeCallbacks(ticker)
    }
  }

  private fun dp(ctx: Context, v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics)
  private fun dpi(ctx: Context, v: Float) = dp(ctx, v).toInt()

  private fun overlayType() =
    if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

  // ---------- island ----------

  @SuppressLint("ClickableViewAccessibility")
  private fun showIsland(ctx: Context) {
    if (island != null) return
    val host: Context = svc() ?: ctx
    val viaService = host is IslandAccessibilityService
    val wm = host.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val root = FrameLayout(host)
    val type = if (viaService) WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY else overlayType()
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.WRAP_CONTENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
      PixelFormat.TRANSLUCENT,
    )
    params.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
    if (Build.VERSION.SDK_INT >= 28) {
      params.layoutInDisplayCutoutMode = if (Build.VERSION.SDK_INT >= 30) {
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
      } else {
        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }

    // where the selfie camera is
    var statusBar = statusBarHeight(host)
    var cut: android.graphics.Rect? = null
    var screenW = host.resources.displayMetrics.widthPixels
    if (Build.VERSION.SDK_INT >= 30) {
      try {
        val metrics = wm.currentWindowMetrics
        screenW = metrics.bounds.width()
        cut = metrics.windowInsets.displayCutout?.boundingRects?.firstOrNull { it.top < dp(host, 80f) }
        val top = metrics.windowInsets.getInsetsIgnoringVisibility(android.view.WindowInsets.Type.statusBars()).top
        if (top > 0) statusBar = top
      } catch (_: Exception) {}
    }

    val camera = cut
    val minH = dpi(host, 30f)
    var x = 0
    val y: Int
    if (viaService) {
      // around the camera, like the iPhone's island
      if (camera != null && camera.height() > 0) {
        pillHeightPx = maxOf(minH, camera.height() + dpi(host, 10f))
        y = maxOf(0, camera.centerY() - pillHeightPx / 2)
        x = camera.centerX() - screenW / 2
        cameraGapPx = camera.width() + dpi(host, 14f)
        cameraClearPx = maxOf(0, camera.bottom - y) + dpi(host, 6f)
      } else {
        pillHeightPx = minH
        y = maxOf(0, (statusBar - minH) / 2)
        cameraGapPx = dpi(host, 10f)
        cameraClearPx = 0
      }
    } else {
      // fallback: just below the status bar, where taps still reach it
      pillHeightPx = minH
      y = statusBar + dpi(host, 4f)
      if (camera != null) x = camera.centerX() - screenW / 2
      cameraGapPx = dpi(host, 10f)
      cameraClearPx = 0
    }
    params.x = x
    params.y = y

    root.setOnTouchListener { _, e ->
      if (e.action == MotionEvent.ACTION_OUTSIDE && expanded && CallManager.ringingCall() == null) {
        expanded = false
        lastSig = null
        render()
      }
      false
    }
    try {
      wm.addView(root, params)
      island = root
      islandWm = wm
      islandViaService = viaService
      lastSig = null
      expanded = CallManager.ringingCall() != null
      render()
    } catch (_: Exception) {
      island = null
    }
  }

  private fun statusBarHeight(ctx: Context): Int {
    val id = ctx.resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (id > 0) ctx.resources.getDimensionPixelSize(id) else dpi(ctx, 32f)
  }

  /** Opens the call screen. The island stays up until the app is on screen: hiding it first
   *  would take away the visible window Android needs to let an app open from the background. */
  private fun openCallScreen() {
    val ctx = CallManager.appContext ?: return
    expanded = false
    lastSig = null
    CallManager.launchUi(ctx)
    CallManager.emit() // lets the app show the call screen if it's already open
    main.postDelayed({ refresh() }, 600)
  }

  private fun hideIsland() {
    val v = island ?: return
    try { islandWm?.removeView(v) } catch (_: Exception) {}
    island = null
    islandWm = null
    islandViaService = false
    expanded = false
    lastSig = null
  }

  // ---------- rear / cover screens ----------

  private val skipNames = listOf("hdmi", "wifi", "wi-fi", "wireless", "virtual", "cast", "overlay", "mirror", "record", "projection")

  private fun rearDisplays(ctx: Context): List<Display> {
    val dm = ctx.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
    return dm.displays.filter { d ->
      d.displayId != Display.DEFAULT_DISPLAY &&
        (d.flags and Display.FLAG_PRIVATE) == 0 &&
        skipNames.none { d.name.lowercase().contains(it) }
    }
  }

  private fun showRear(ctx: Context) {
    val displays = try { rearDisplays(ctx) } catch (_: Exception) { emptyList() }
    val ids = displays.map { it.displayId }.toSet()
    // remove screens that went away
    rear.keys.filter { it !in ids }.forEach { id ->
      rear.remove(id)?.let { (wm, v) -> try { wm.removeView(v) } catch (_: Exception) {} }
    }
    for (d in displays) {
      if (rear.containsKey(d.displayId)) continue
      try {
        val dctx = ctx.createDisplayContext(d).let {
          if (Build.VERSION.SDK_INT >= 30) it.createWindowContext(overlayType(), null) else it
        }
        val wm = dctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val root = FrameLayout(dctx)
        root.setBackgroundColor(Color.BLACK)
        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.MATCH_PARENT,
          WindowManager.LayoutParams.MATCH_PARENT,
          overlayType(),
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
          PixelFormat.OPAQUE,
        )
        wm.addView(root, params)
        rear[d.displayId] = wm to root
        lastSig = null
      } catch (_: Exception) {
        // this screen doesn't take windows from apps
      }
    }
    render()
  }

  private fun hideRear() {
    rear.values.forEach { (wm, v) -> try { wm.removeView(v) } catch (_: Exception) {} }
    rear.clear()
  }

  // ---------- drawing ----------

  private data class Info(val name: String, val status: String, val ringing: Boolean, val active: Boolean, val muted: Boolean, val speaker: Boolean)

  private fun info(ctx: Context): Info? {
    val ringing = CallManager.ringingCall()
    val call = ringing ?: CallManager.primaryCall() ?: return null
    val state = CallManager.stateOf(call)
    val status = when {
      ringing != null -> "Incoming call"
      state == Call.STATE_HOLDING -> "On hold"
      state == Call.STATE_ACTIVE -> clock(call.details.connectTimeMillis)
      else -> "Calling…"
    }
    return Info(CallNotifications.title(ctx, call), status, ringing != null, state == Call.STATE_ACTIVE, CallManager.isMuted(), CallManager.isSpeaker())
  }

  private fun clock(start: Long): String {
    if (start <= 0) return "0:00"
    val s = maxOf(0L, (System.currentTimeMillis() - start) / 1000)
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, sec) else String.format("%d:%02d", m, sec)
  }

  private fun initials(name: String): String {
    val parts = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() && it[0].isLetter() }
    return parts.take(2).joinToString("") { it.first().uppercase() }
  }

  // status labels updated in place every second, so taps aren't lost to rebuilds
  private val statusLabels = ArrayList<TextView>()
  private var lastSig: String? = null

  private fun render() {
    val ctx = CallManager.appContext ?: return
    val i = info(ctx)
    if (i == null) {
      hideIsland()
      hideRear()
      return
    }
    if (expanded && !i.ringing && System.currentTimeMillis() - lastInteraction > 8000) expanded = false
    val sig = listOf(i.name, i.ringing, i.active, i.muted, i.speaker, expanded, island != null, rear.keys.sorted(), i.status.takeIf { !i.active }).joinToString("|")
    if (sig == lastSig) {
      statusLabels.forEach { it.text = i.status }
      return
    }
    lastSig = sig
    statusLabels.clear()
    island?.let { root ->
      root.removeAllViews()
      root.addView(if (expanded || i.ringing) card(root.context, i, compact = true) else pill(root.context, i))
    }
    rear.values.forEach { (_, root) ->
      root.removeAllViews()
      root.addView(
        card(root.context, i, compact = false),
        FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
      )
    }
  }

  private fun rounded(color: Int, radius: Float) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radius
  }

  private fun text(ctx: Context, s: String, sizeSp: Float, color: Int, bold: Boolean = false) = TextView(ctx).apply {
    text = s
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(color)
    if (bold) typeface = Typeface.DEFAULT_BOLD
    maxLines = 1
    ellipsize = TextUtils.TruncateAt.END
  }

  /** Collapsed pill: timer on the left, caller on the right, room for the camera in between. */
  private fun pill(ctx: Context, i: Info): View {
    val green = Color.parseColor("#30D158")
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      val h = if (pillHeightPx > 0) pillHeightPx else dpi(ctx, 30f)
      background = rounded(Color.BLACK, h / 2f)
      setPadding(dpi(ctx, 12f), 0, dpi(ctx, 12f), 0)
      layoutParams = FrameLayout.LayoutParams(dpi(ctx, 120f) + cameraGapPx, h)
    }
    val icon = ImageView(ctx).apply {
      setImageResource(android.R.drawable.sym_action_call)
      imageTintList = ColorStateList.valueOf(green)
    }
    row.addView(icon, LinearLayout.LayoutParams(dpi(ctx, 16f), dpi(ctx, 16f)))
    row.addView(text(ctx, i.status, 13f, green, bold = true).apply { setPadding(dpi(ctx, 5f), 0, 0, 0); statusLabels.add(this) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    row.addView(View(ctx), LinearLayout.LayoutParams(if (cameraGapPx > 0) cameraGapPx else dpi(ctx, 10f), 1)) // camera
    row.addView(
      text(ctx, i.name, 13f, Color.WHITE, bold = true).apply { gravity = Gravity.END },
      LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f),
    )
    row.setOnClickListener {
      expanded = true
      lastSig = null
      lastInteraction = System.currentTimeMillis()
      render()
    }
    row.setOnLongClickListener {
      openCallScreen()
      true
    }
    return row
  }

  /** Expanded card (island) or full call panel (rear screen). */
  private fun card(ctx: Context, i: Info, compact: Boolean): View {
    val metrics = ctx.resources.displayMetrics
    val screenW = metrics.widthPixels
    val scale = if (compact) 1f else (minOf(metrics.widthPixels, metrics.heightPixels) / dp(ctx, 360f)).coerceIn(0.55f, 1.2f)
    fun s(v: Float) = dpi(ctx, v * scale)

    val col = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      gravity = if (compact) Gravity.NO_GRAVITY else Gravity.CENTER
      if (compact) background = rounded(Color.BLACK, dp(ctx, 26f))
      setPadding(
        s(if (compact) 14f else 18f),
        if (compact) maxOf(s(12f), cameraClearPx) else s(16f),
        s(if (compact) 14f else 18f),
        s(if (compact) 12f else 16f),
      )
      layoutParams = if (compact) {
        FrameLayout.LayoutParams(minOf(screenW - dpi(ctx, 24f), dpi(ctx, 360f)), ViewGroup.LayoutParams.WRAP_CONTENT)
      } else {
        FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
      }
    }

    // header: avatar + name + status (tap to open the call screen)
    val header = LinearLayout(ctx).apply {
      orientation = if (compact) LinearLayout.HORIZONTAL else LinearLayout.VERTICAL
      gravity = Gravity.CENTER
    }
    val avatar = TextView(ctx).apply {
      text = initials(i.name).ifEmpty { "•" }
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      setTextSize(TypedValue.COMPLEX_UNIT_PX, s(18f).toFloat())
      typeface = Typeface.DEFAULT_BOLD
      background = rounded(Color.parseColor("#3A3A3C"), s(24f).toFloat())
    }
    header.addView(avatar, LinearLayout.LayoutParams(s(if (compact) 38f else 60f), s(if (compact) 38f else 60f)))
    val names = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      gravity = if (compact) Gravity.START else Gravity.CENTER_HORIZONTAL
      setPadding(if (compact) s(12f) else 0, if (compact) 0 else s(8f), 0, 0)
    }
    names.addView(text(ctx, i.name, if (compact) 17f else 20f * scale, Color.WHITE, bold = true).apply { if (!compact) gravity = Gravity.CENTER })
    names.addView(text(ctx, i.status, if (compact) 13f else 14f * scale, Color.parseColor(if (i.ringing) "#30D158" else "#A1A1A6")).apply { if (!compact) gravity = Gravity.CENTER; statusLabels.add(this) })
    header.addView(names, LinearLayout.LayoutParams(if (compact) 0 else ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, if (compact) 1f else 0f))
    header.setOnClickListener {
      if (compact) openCallScreen() else CallManager.appContext?.let { CallManager.launchUi(it) }
    }
    col.addView(header)

    // buttons
    val buttons = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      setPadding(0, s(if (compact) 10f else 14f), 0, 0)
    }
    fun button(label: String, iconRes: Int, bg: Int, rotate: Float = 0f, onTap: () -> Unit) {
      val box = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
      }
      val size = s(if (compact) 42f else 58f)
      val img = ImageView(ctx).apply {
        setImageResource(iconRes)
        imageTintList = ColorStateList.valueOf(Color.WHITE)
        background = rounded(bg, size / 2f)
        val pad = (size * 0.26f).toInt()
        setPadding(pad, pad, pad, pad)
        rotation = rotate
      }
      box.addView(img, LinearLayout.LayoutParams(size, size))
      box.addView(text(ctx, label, if (compact) 11f else 12f * scale, Color.parseColor("#D1D1D6")).apply { setPadding(0, s(4f), 0, 0) })
      box.setOnClickListener {
        lastInteraction = System.currentTimeMillis()
        onTap()
        main.postDelayed({ render() }, 300)
      }
      buttons.addView(box, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    }
    val red = Color.parseColor("#FF3B30")
    val green = Color.parseColor("#30D158")
    val gray = Color.parseColor("#3A3A3C")
    val ringingId = CallManager.ringingCall()?.let { CallManager.idOf(it) }
    val primaryId = CallManager.primaryCall()?.let { CallManager.idOf(it) }
    if (i.ringing && ringingId != null) {
      button("Decline", android.R.drawable.sym_action_call, red, 135f) { CallManager.reject(ringingId, null) }
      button("Accept", android.R.drawable.sym_action_call, green) {
        CallManager.answer(ringingId)
        expanded = false
      }
    } else if (primaryId != null) {
      button(if (i.muted) "Unmute" else "Mute", android.R.drawable.ic_btn_speak_now, if (i.muted) Color.parseColor("#636366") else gray) { CallManager.toggleMute() }
      button(if (i.speaker) "Speaker on" else "Speaker", android.R.drawable.ic_lock_silent_mode_off, if (i.speaker) Color.parseColor("#0A84FF") else gray) { CallManager.toggleSpeaker() }
      button("End", android.R.drawable.sym_action_call, red, 135f) { CallManager.hangup(primaryId) }
    }
    col.addView(buttons)
    return col
  }
}
