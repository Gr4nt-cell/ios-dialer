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
  private var cameraTopPx = 0

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
    val minH = dpi(host, 22f)
    var x = 0
    val y: Int
    if (viaService) {
      // around the camera, like the iPhone's island
      if (camera != null && camera.height() > 0) {
        // leave a strip of screen above the island; stay centred on the camera
        val gapTop = dpi(host, 5f)
        val room = 2 * (camera.centerY() - gapTop)
        pillHeightPx = maxOf(camera.height() + dpi(host, 2f), minOf(maxOf(minH, camera.height() + dpi(host, 4f)), room))
        y = maxOf(gapTop, camera.centerY() - pillHeightPx / 2)
        x = camera.centerX() - screenW / 2
        cameraGapPx = camera.width() + dpi(host, 6f)
        cameraClearPx = maxOf(0, camera.bottom - y) + dpi(host, 4f)
        cameraTopPx = maxOf(0, camera.top - y)
      } else {
        pillHeightPx = minH
        y = maxOf(dpi(host, 5f), (statusBar - minH) / 2)
        cameraGapPx = dpi(host, 10f)
        cameraClearPx = 0
        cameraTopPx = 0
      }
    } else {
      // fallback: just below the status bar, where taps still reach it
      pillHeightPx = minH
      y = statusBar + dpi(host, 4f)
      if (camera != null) x = camera.centerX() - screenW / 2
      cameraGapPx = dpi(host, 10f)
      cameraClearPx = 0
      cameraTopPx = 0
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

  private data class Info(
    val name: String,
    val status: String,
    val ringing: Boolean,
    val active: Boolean,
    val muted: Boolean,
    val speaker: Boolean,
    val short: String, // small pill: call duration
    val line: String, // expanded: "Incoming call" / "2:14" / "On hold" / "Calling…"
    val sim: String?, // "SIM 2" when the phone has more than one
  )

  private fun info(ctx: Context): Info? {
    val ringing = CallManager.ringingCall()
    val call = ringing ?: CallManager.primaryCall() ?: return null
    val state = CallManager.stateOf(call)
    val sim = simLabel(ctx, call)
    val via = if (sim != null) " via $sim" else ""
    val status = when {
      ringing != null -> "Incoming call$via"
      state == Call.STATE_HOLDING -> "On hold"
      state == Call.STATE_ACTIVE -> clock(call.details.connectTimeMillis) + via
      else -> "Calling$via…"
    }
    val short = when {
      state == Call.STATE_ACTIVE -> clock(call.details.connectTimeMillis)
      state == Call.STATE_HOLDING -> "Hold"
      else -> "•••"
    }
    val line = when {
      ringing != null -> "Incoming call"
      state == Call.STATE_HOLDING -> "On hold"
      state == Call.STATE_ACTIVE -> clock(call.details.connectTimeMillis)
      else -> "Calling…"
    }
    return Info(CallNotifications.title(ctx, call), status, ringing != null, state == Call.STATE_ACTIVE, CallManager.isMuted(), CallManager.isSpeaker(), short, line, sim)
  }

  private fun simLabel(ctx: Context, call: Call): String? = try {
    val handle = call.details.accountHandle
    val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as android.telecom.TelecomManager
    @SuppressLint("MissingPermission")
    val all = tm.callCapablePhoneAccounts
    val idx = if (handle == null) -1 else all.indexOfFirst { it == handle }
    if (all.size > 1 && idx >= 0) "SIM${idx + 1}" else null
  } catch (_: Exception) { null }



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
  private val pillLabels = ArrayList<TextView>()
  private val lineLabels = ArrayList<TextView>()
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
      pillLabels.forEach { it.text = i.short }
      lineLabels.forEach { it.text = i.line }
      return
    }
    lastSig = sig
    statusLabels.clear()
    pillLabels.clear()
    lineLabels.clear()
    island?.let { root ->
      root.removeAllViews()
      root.addView(if (expanded || i.ringing) islandCard(root.context, i) else pill(root.context, i))
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

  /** Collapsed pill: call duration on the left, a moving sound wave on the right, the camera in between. */
  private fun pill(ctx: Context, i: Info): View {
    val green = Color.parseColor("#30D158")
    val h = if (pillHeightPx > 0) pillHeightPx else dpi(ctx, 22f)
    val side = dpi(ctx, 36f)
    val row = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      background = rounded(Color.BLACK, h / 2f)
      setPadding(dpi(ctx, 9f), 0, dpi(ctx, 9f), 0)
      layoutParams = FrameLayout.LayoutParams(side * 2 + dpi(ctx, 18f) + cameraGapPx, h)
    }
    row.addView(
      text(ctx, i.short, 11f, green, bold = true).apply { pillLabels.add(this) },
      LinearLayout.LayoutParams(side, ViewGroup.LayoutParams.WRAP_CONTENT),
    )
    row.addView(View(ctx), LinearLayout.LayoutParams(if (cameraGapPx > 0) cameraGapPx else dpi(ctx, 8f), 1)) // camera
    val waveBox = FrameLayout(ctx)
    waveBox.addView(
      WaveView(ctx, green, active = i.active && !i.muted),
      FrameLayout.LayoutParams(dpi(ctx, 18f), dpi(ctx, 11f), Gravity.END or Gravity.CENTER_VERTICAL),
    )
    row.addView(waveBox, LinearLayout.LayoutParams(side, ViewGroup.LayoutParams.MATCH_PARENT))
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

  /** Little animated level bars, like the iPhone's call island. */
  private class WaveView(ctx: Context, private val color: Int, private val active: Boolean) : View(ctx) {
    private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    private val bars = 5
    private val phase = floatArrayOf(0f, 1.7f, 0.6f, 2.4f, 1.1f)
    override fun onDraw(c: android.graphics.Canvas) {
      super.onDraw(c)
      val t = System.currentTimeMillis() / 1000.0
      val gap = width / (bars * 2f - 1f)
      for (k in 0 until bars) {
        val level = if (active) (0.35 + 0.65 * Math.abs(Math.sin(t * (2.2 + k * 0.45) + phase[k]))).toFloat() else 0.22f
        val bh = maxOf(gap, height * level)
        val x = k * gap * 2f
        val top = (height - bh) / 2f
        c.drawRoundRect(x, top, x + gap, top + bh, gap / 2f, gap / 2f, paint)
      }
      if (active && isAttachedToWindow) postInvalidateDelayed(70)
    }
  }

  /**
   * Expanded island (user's sketch): a black card with the selfie camera inside its top centre;
   * name, duration and SIM stacked on the left, three round buttons on the right below the camera.
   */
  private fun islandCard(ctx: Context, i: Info): View {
    val metrics = ctx.resources.displayMetrics
    val red = Color.parseColor("#FF3B30")
    val green = Color.parseColor("#30D158")
    val gray = Color.parseColor("#3A3A3C")
    val dim = Color.parseColor("#A1A1A6")
    val topPad = maxOf(dpi(ctx, 12f), cameraTopPx)
    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      background = rounded(Color.BLACK, dp(ctx, 32f))
      setPadding(dpi(ctx, 24f), topPad, dpi(ctx, 20f), dpi(ctx, 16f))
      layoutParams = FrameLayout.LayoutParams(minOf(metrics.widthPixels - dpi(ctx, 40f), dpi(ctx, 380f)), ViewGroup.LayoutParams.WRAP_CONTENT)
    }

    // left: name / duration / sim (tap to open the call screen)
    val info = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
    info.addView(text(ctx, i.name, 18f, Color.WHITE, bold = true))
    info.addView(
      text(ctx, i.line, 14f, if (i.ringing) green else dim).apply {
        setPadding(0, dpi(ctx, 3f), 0, 0)
        lineLabels.add(this)
      },
    )
    if (i.sim != null) info.addView(text(ctx, i.sim, 13f, dim).apply { setPadding(0, dpi(ctx, 2f), 0, 0) })
    info.setOnClickListener { openCallScreen() }
    card.addView(info, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))

    // right: three round buttons, below the camera
    val buttons = LinearLayout(ctx).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(0, maxOf(0, cameraClearPx - topPad + dpi(ctx, 4f)), 0, 0)
    }
    fun button(iconRes: Int, bg: Int, rotate: Float = 0f, onTap: () -> Unit) {
      val size = dpi(ctx, 46f)
      val img = ImageView(ctx).apply {
        setImageResource(iconRes)
        imageTintList = ColorStateList.valueOf(Color.WHITE)
        background = rounded(bg, size / 2f)
        val pad = (size * 0.27f).toInt()
        setPadding(pad, pad, pad, pad)
        rotation = rotate
        setOnClickListener {
          lastInteraction = System.currentTimeMillis()
          onTap()
          main.postDelayed({ render() }, 300)
        }
      }
      buttons.addView(img, LinearLayout.LayoutParams(size, size).apply { marginStart = dpi(ctx, 10f) })
    }
    val ringingId = CallManager.ringingCall()?.let { CallManager.idOf(it) }
    val primaryId = CallManager.primaryCall()?.let { CallManager.idOf(it) }
    if (i.ringing && ringingId != null) {
      button(android.R.drawable.ic_lock_silent_mode, gray) { Ringer.silence() } // silence ringtone
      button(android.R.drawable.sym_action_call, red, 135f) { CallManager.reject(ringingId, null) }
      button(android.R.drawable.sym_action_call, green) {
        CallManager.answer(ringingId)
        expanded = false
      }
    } else if (primaryId != null) {
      button(android.R.drawable.ic_btn_speak_now, if (i.muted) Color.parseColor("#8E8E93") else gray) { CallManager.toggleMute() }
      button(android.R.drawable.ic_lock_silent_mode_off, if (i.speaker) Color.parseColor("#0A84FF") else gray) { CallManager.toggleSpeaker() }
      button(android.R.drawable.sym_action_call, red, 135f) { CallManager.hangup(primaryId) }
    }
    card.addView(buttons, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    return card
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
