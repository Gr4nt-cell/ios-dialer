package expo.modules.dialer

import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.telecom.Call
import android.telecom.CallAudioState
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.Locale

/**
 * Call screening, done on the phone.
 *
 * Android doesn't let ordinary apps put audio straight into a call or read the caller's audio, so
 * screening works acoustically: the call is answered on speaker, the greeting and replies are
 * spoken with the phone's text-to-speech (the caller hears them through the microphone), and what
 * the caller says is written down by the phone's on-device speech recognition. A small on-device
 * classifier reads the transcript to flag likely spam and say what the call is about.
 *
 * Nothing leaves the phone: the on-device recogniser is used, and the online one only if the user
 * allowed it in Privacy. Transcripts are saved (if enabled) in the app's private folder.
 */
object CallScreener {
  private val main = Handler(Looper.getMainLooper())

  var listener: ((String) -> Unit)? = null

  private var callId: String? = null
  private var number: String = ""
  private var state = "idle" // idle | answering | greeting | listening | speaking | ended | error
  private var note: String? = null
  private var startedAt = 0L
  private val lines = ArrayList<JSONObject>() // {who: caller|assistant, text, at}
  private var partial = ""
  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var recognizer: SpeechRecognizer? = null
  private var listening = false
  private var onDevice = false
  private var pendingSpeech: String? = null

  /** Numbers the screening service chose to screen automatically (set just before the call rings). */
  private val autoNumbers = HashMap<String, Long>()

  fun markAuto(number: String) {
    autoNumbers[CallManager.digits(number)] = System.currentTimeMillis()
  }

  fun shouldAutoScreen(number: String): Boolean {
    val t = autoNumbers.remove(CallManager.digits(number)) ?: return false
    return System.currentTimeMillis() - t < 30_000
  }

  fun isScreening(id: String?): Boolean = id != null && id == callId && state != "idle" && state != "ended"

  // ---------- public actions ----------

  fun start(ctx: Context, id: String) {
    main.post {
      if (callId != null && callId != id) stopInternal(ctx, "ended")
      val call = CallManager.callById(id) ?: return@post
      callId = id
      number = call.details.handle?.schemeSpecificPart ?: ""
      lines.clear()
      partial = ""
      note = null
      startedAt = System.currentTimeMillis()
      setState("answering")
      Ringer.silence()
      initTts(ctx.applicationContext)
      if (CallManager.stateOf(call) == Call.STATE_RINGING) CallManager.answer(id)
      waitForActive(ctx.applicationContext, id, 0)
    }
  }

  fun say(ctx: Context, text: String) {
    main.post {
      if (callId == null) return@post
      speak(ctx.applicationContext, text)
    }
  }

  /** Take the call yourself: screening stops, speaker off. */
  fun pickUp(ctx: Context) {
    main.post {
      val id = callId ?: return@post
      stopListening()
      tts?.stop()
      CallManager.setRoute(CallAudioState.ROUTE_WIRED_OR_EARPIECE)
      CallManager.mute(false)
      finish(ctx.applicationContext, "picked up")
      callId = id // keep showing the transcript on the call screen
      setState("ended")
    }
  }

  fun hangUp(ctx: Context) {
    main.post {
      val id = callId ?: return@post
      CallManager.hangup(id)
      finish(ctx.applicationContext, "hung up")
    }
  }

  /** The call went away (caller hung up, or the user did). */
  fun onCallRemoved(ctx: Context, id: String?) {
    main.post { if (id != null && id == callId && state != "ended") finish(ctx.applicationContext, "caller hung up") }
  }

  fun snapshot(): String {
    val o = JSONObject()
    o.put("callId", callId ?: JSONObject.NULL)
    o.put("number", number)
    o.put("state", state)
    o.put("note", note ?: JSONObject.NULL)
    o.put("onDevice", onDevice)
    o.put("partial", partial)
    val arr = JSONArray()
    lines.forEach { arr.put(it) }
    o.put("lines", arr)
    val a = analyse()
    o.put("summary", a.first)
    o.put("spam", a.second)
    return o.toString()
  }

  fun clear() {
    main.post {
      if (state == "ended" || state == "idle" || state == "error") {
        callId = null
        lines.clear()
        partial = ""
        setState("idle")
      }
    }
  }

  // ---------- flow ----------

  private fun waitForActive(ctx: Context, id: String, tries: Int) {
    val call = CallManager.callById(id)
    if (call == null) {
      finish(ctx, "caller hung up")
      return
    }
    if (CallManager.stateOf(call) == Call.STATE_ACTIVE) {
      CallManager.setRoute(CallAudioState.ROUTE_SPEAKER)
      CallManager.mute(false)
      main.postDelayed({ greet(ctx) }, 700)
      return
    }
    if (tries > 40) {
      setState("error", "Couldn't answer the call")
      return
    }
    main.postDelayed({ waitForActive(ctx, id, tries + 1) }, 250)
  }

  private fun greet(ctx: Context) {
    val name = PrivacyPrefs.screenName(ctx).trim()
    val who = if (name.isNotEmpty()) name else "the person you're calling"
    val text = "Hi, $who is using a call screening service and will get a copy of this conversation. " +
      "Go ahead and say your name and why you're calling."
    setState("greeting")
    speak(ctx, text)
  }

  private fun speak(ctx: Context, text: String) {
    stopListening()
    add("assistant", text)
    val engine = tts
    if (engine == null || !ttsReady) {
      pendingSpeech = text
      initTts(ctx)
      return
    }
    setState(if (state == "greeting") "greeting" else "speaking")
    val params = Bundle()
    params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f)
    engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, "say_" + System.currentTimeMillis())
  }

  private fun initTts(ctx: Context) {
    if (tts != null) return
    tts = TextToSpeech(ctx) { status ->
      main.post {
        ttsReady = status == TextToSpeech.SUCCESS
        if (!ttsReady) {
          setState("error", "Text-to-speech isn't available on this phone")
          return@post
        }
        val engine = tts ?: return@post
        try { engine.language = Locale.getDefault() } catch (_: Exception) {}
        engine.setSpeechRate(0.95f)
        // the in-call stream: loud on speakerphone, so the caller hears it through the microphone
        engine.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build(),
        )
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) {}
          override fun onDone(utteranceId: String?) {
            main.postDelayed({ if (callId != null && state != "ended") startListening(ctx) }, 250)
          }
          @Deprecated("Deprecated in Java")
          override fun onError(utteranceId: String?) {
            main.post { if (callId != null && state != "ended") startListening(ctx) }
          }
        })
        pendingSpeech?.let {
          pendingSpeech = null
          lines.removeAt(lines.size - 1) // speak() adds it again
          speak(ctx, it)
        }
      }
    }
  }

  private fun startListening(ctx: Context) {
    if (listening || callId == null) return
    val r = recognizer ?: createRecognizer(ctx) ?: return
    recognizer = r
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
      putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
    }
    try {
      r.startListening(intent)
      listening = true
      setState("listening")
    } catch (e: Exception) {
      setState("error", "Couldn't start listening")
    }
  }

  private fun createRecognizer(ctx: Context): SpeechRecognizer? {
    val r: SpeechRecognizer? = try {
      if (Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)) {
        onDevice = true
        SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx)
      } else if (PrivacyPrefs.allowOnlineSpeech(ctx) && SpeechRecognizer.isRecognitionAvailable(ctx)) {
        onDevice = false
        SpeechRecognizer.createSpeechRecognizer(ctx)
      } else null
    } catch (_: Exception) { null }
    if (r == null) {
      setState(
        "error",
        "On-device speech recognition isn't available on this phone. You can still talk to the caller with the reply buttons, or allow online recognition in Privacy.",
      )
      return null
    }
    r.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) {}
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(rmsdB: Float) {}
      override fun onBufferReceived(buffer: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onEvent(eventType: Int, params: Bundle?) {}

      override fun onPartialResults(partialResults: Bundle?) {
        val t = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: return
        partial = t
        emit()
      }

      override fun onResults(results: Bundle?) {
        listening = false
        val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()
        partial = ""
        if (!t.isNullOrEmpty()) add("caller", t) else emit()
        if (callId != null && state == "listening") main.postDelayed({ startListening(ctx) }, 150)
      }

      override fun onError(error: Int) {
        listening = false
        partial = ""
        if (callId == null || state == "ended") return
        when (error) {
          SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> setState("error", "Microphone permission is needed to screen calls")
          SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ->
            setState("error", "Download your language for offline speech in the phone's settings to see what callers say.")
          else -> if (state == "listening") main.postDelayed({ startListening(ctx) }, 300)
        }
      }
    })
    return r
  }

  private fun stopListening() {
    listening = false
    try { recognizer?.cancel() } catch (_: Exception) {}
  }

  private fun finish(ctx: Context, why: String) {
    note = why
    stopListening()
    try { recognizer?.destroy() } catch (_: Exception) {}
    recognizer = null
    try { tts?.stop(); tts?.shutdown() } catch (_: Exception) {}
    tts = null
    ttsReady = false
    if (lines.any { it.optString("who") == "caller" }) saveTranscript(ctx)
    setState("ended")
  }

  private fun stopInternal(ctx: Context, s: String) {
    finish(ctx, s)
    callId = null
  }

  private fun saveTranscript(ctx: Context) {
    if (!PrivacyPrefs.keepTranscripts(ctx)) return
    try {
      val dir = File(ctx.filesDir, "screening").apply { if (!exists()) mkdirs() }
      val a = analyse()
      val o = JSONObject()
        .put("number", number)
        .put("name", CallNotifications.lookupName(ctx, number) ?: JSONObject.NULL)
        .put("at", startedAt)
        .put("summary", a.first)
        .put("spam", a.second)
        .put("lines", JSONArray().apply { lines.forEach { put(it) } })
      File(dir, "screen_${startedAt}.json").writeText(o.toString())
      PrivacyPrefs.cleanup(ctx)
    } catch (_: Exception) {}
  }

  // ---------- on-device "what is this call about" ----------

  private val spamWords = listOf(
    "warranty", "extended warranty", "you have won", "you've won", "prize", "lottery", "gift card", "free gift",
    "verify your account", "your account has been", "suspended", "social security", "irs", "tax refund",
    "loan", "pre-approved", "credit card offer", "lower your interest", "debt relief", "crypto", "bitcoin",
    "investment opportunity", "press one", "press 1", "this is an automated", "limited time", "act now",
    "survey", "insurance quote", "solar", "send money", "mobile money", "pin code", "otp", "one time password",
  )

  private val topics = listOf(
    "delivery" to listOf("delivery", "package", "parcel", "courier", "dispatch", "rider", "order"),
    "appointment" to listOf("appointment", "doctor", "clinic", "hospital", "booking", "reservation"),
    "urgent" to listOf("urgent", "emergency", "accident", "asap", "right away", "important"),
    "bank" to listOf("bank", "account", "transaction", "payment", "card"),
    "work" to listOf("meeting", "office", "interview", "job", "client", "project"),
    "family" to listOf("mum", "mom", "dad", "brother", "sister", "family", "son", "daughter"),
  )

  private fun analyse(): Pair<String, Double> {
    val said = lines.filter { it.optString("who") == "caller" }.joinToString(" ") { it.optString("text") }.lowercase()
    if (said.isBlank()) return "" to 0.0
    val hits = spamWords.count { said.contains(it) }
    var spam = (hits * 0.35).coerceAtMost(1.0)
    if (number.isBlank()) spam = (spam + 0.15).coerceAtMost(1.0)
    // first sentence the caller said, trimmed, as the gist
    val first = lines.firstOrNull { it.optString("who") == "caller" }?.optString("text").orEmpty()
    val gist = first.split(Regex("(?<=[.!?])\\s")).firstOrNull().orEmpty().take(120)
    val topic = topics.firstOrNull { (_, words) -> words.any { said.contains(it) } }?.first
    val summary = when {
      spam >= 0.6 -> "Likely spam" + if (gist.isNotEmpty()) " · \"$gist\"" else ""
      topic != null && gist.isNotEmpty() -> "${topic.replaceFirstChar { it.uppercase() }} · \"$gist\""
      gist.isNotEmpty() -> "\"$gist\""
      else -> ""
    }
    return summary to spam
  }

  // ---------- state / events ----------

  private fun add(who: String, text: String) {
    lines.add(JSONObject().put("who", who).put("text", text).put("at", System.currentTimeMillis()))
    emit()
  }

  private fun setState(s: String, n: String? = null) {
    state = s
    if (n != null) note = n
    emit()
  }

  private fun emit() {
    val json = snapshot()
    try { listener?.invoke(json) } catch (_: Exception) {}
  }

  /** Saved transcripts, newest first. */
  fun transcripts(ctx: Context): String {
    val arr = JSONArray()
    try {
      File(ctx.filesDir, "screening").listFiles()
        ?.sortedByDescending { it.lastModified() }
        ?.forEach { f -> try { arr.put(JSONObject(f.readText()).put("file", f.name)) } catch (_: Exception) {} }
    } catch (_: Exception) {}
    return arr.toString()
  }

  fun deleteTranscript(ctx: Context, file: String): Boolean = try {
    File(File(ctx.filesDir, "screening"), File(file).name).delete()
  } catch (_: Exception) { false }
}
