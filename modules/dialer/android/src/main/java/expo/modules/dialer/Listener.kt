package expo.modules.dialer

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

/**
 * Turns speech into text for voice control.
 *
 * Uses the phone's own recogniser. `EXTRA_PREFER_OFFLINE` asks it to stay on
 * the device where the language pack is installed — most phones have one, and
 * where it is missing the recogniser falls back to its online service rather
 * than failing, which is why the result says whether it came back offline.
 */
object Listener {
  private var recognizer: SpeechRecognizer? = null
  private var busy = false
  private val main = Handler(Looper.getMainLooper())

  fun available(ctx: Context): Boolean = SpeechRecognizer.isRecognitionAvailable(ctx)

  /** Listens for one phrase. `done` is called with the transcript, or null. */
  fun listen(ctx: Context, done: (String?, String?) -> Unit) {
    if (!available(ctx)) {
      done(null, "No speech recogniser on this phone")
      return
    }
    if (busy) {
      done(null, "Already listening")
      return
    }
    busy = true

    main.post {
      try {
        stopInternal()
        val sr = SpeechRecognizer.createSpeechRecognizer(ctx)
        recognizer = sr
        var answered = false
        val finish = { text: String?, err: String? ->
          if (!answered) {
            answered = true
            busy = false
            done(text, err)
          }
        }

        sr.setRecognitionListener(object : RecognitionListener {
          override fun onReadyForSpeech(params: Bundle?) {}
          override fun onBeginningOfSpeech() {}
          override fun onRmsChanged(rmsdB: Float) {}
          override fun onBufferReceived(buffer: ByteArray?) {}
          override fun onEndOfSpeech() {}
          override fun onPartialResults(partialResults: Bundle?) {}
          override fun onEvent(eventType: Int, params: Bundle?) {}

          override fun onError(error: Int) {
            finish(
              null,
              when (error) {
                SpeechRecognizer.ERROR_NO_MATCH -> "Didn't catch that"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Heard nothing"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone permission is needed"
                SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                  "The recogniser needed the network. Install an offline language pack in your phone's voice settings."
                SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ->
                  "That language isn't installed for speech"
                else -> "Speech recognition failed"
              },
            )
            stopInternal()
          }

          override fun onResults(results: Bundle?) {
            val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            finish(list?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }, null)
            stopInternal()
          }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
          putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
          putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
          putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
          putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
          if (android.os.Build.VERSION.SDK_INT >= 23) putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
          putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1200L)
        }
        sr.startListening(intent)

        // the recogniser can sit silent forever; don't let the UI wait with it
        main.postDelayed({
          if (busy) {
            finish(null, "Heard nothing")
            stopInternal()
          }
        }, 12000)
      } catch (e: Exception) {
        busy = false
        done(null, e.message ?: "Speech recognition failed")
      }
    }
  }

  fun stop() {
    main.post { stopInternal() }
    busy = false
  }

  private fun stopInternal() {
    try { recognizer?.cancel() } catch (_: Exception) {}
    try { recognizer?.destroy() } catch (_: Exception) {}
    recognizer = null
  }
}
