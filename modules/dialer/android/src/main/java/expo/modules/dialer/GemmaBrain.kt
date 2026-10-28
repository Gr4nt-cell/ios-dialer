package expo.modules.dialer

import android.content.Context
import android.util.Log
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInference.LlmInferenceOptions
import java.io.File
import java.util.concurrent.Executors

/**
 * FunctionGemma: turns a spoken phrase into a structured command, on the phone.
 *
 * The model is Gemma 3 270M fine-tuned for function calling. It does the same
 * job as the grammar in src/voice.js — words in, a call out — but copes with
 * phrasings the rules never anticipated ("get hold of Ella", "I need Mercy on
 * her work line").
 *
 * It is never the only answer. The model is asked for strict JSON; anything
 * that doesn't parse, names an unknown action, or arrives slowly is dropped
 * and the rules decide instead. On a dialler a confident wrong answer places
 * a call to the wrong person, so the floor matters more than the ceiling.
 *
 * The weights are ~200MB and are downloaded on request, like the voices.
 */
object GemmaBrain {
  private const val TAG = "GemmaBrain"
  private const val MODEL = "functiongemma.task"

  private val worker = Executors.newSingleThreadExecutor()
  @Volatile private var engine: LlmInference? = null
  @Volatile private var loading = false

  fun modelFile(ctx: Context): File = File(File(ctx.filesDir, "brain").apply { mkdirs() }, MODEL)

  /** True once the weights are on the phone. */
  fun installed(ctx: Context): Boolean = modelFile(ctx).length() > 50_000_000

  fun status(ctx: Context): Map<String, Any?> = mapOf(
    "installed" to installed(ctx),
    "loaded" to (engine != null),
    "loading" to loading,
    "bytes" to modelFile(ctx).length(),
  )

  fun release() {
    try { engine?.close() } catch (_: Throwable) {}
    engine = null
  }

  private fun ensure(ctx: Context): LlmInference? {
    engine?.let { return it }
    if (!installed(ctx)) return null
    if (loading) return null
    loading = true
    return try {
      val options = LlmInferenceOptions.builder()
        .setModelPath(modelFile(ctx).absolutePath)
        .setMaxTokens(512)
        .build()
      LlmInference.createFromOptions(ctx.applicationContext, options).also { engine = it }
    } catch (e: Throwable) {
      Log.w(TAG, "could not load the model: ${e.message}")
      null
    } finally {
      loading = false
    }
  }

  /**
   * The prompt. The action list is handed in by the caller, so the model is
   * only ever offered things the app can actually do — a function it cannot
   * invent is a function it cannot get wrong.
   */
  private fun prompt(phrase: String, names: List<String>): String {
    val contacts = names.take(40).joinToString(", ")
    return """
      You convert a phone command into one JSON object and nothing else.
      Allowed actions:
        {"action":"call","name":"<contact>","label":"<mobile|home|work|null>"}
        {"action":"dial","number":"<digits>"}
        {"action":"redial"}
        {"action":"tab","tab":"<calls|contacts|keypad|search>"}
        {"action":"search","query":"<text>"}
        {"action":"unknown"}
      Use a name only if it appears in this list: $contacts
      If the phrase does not clearly match one action, answer {"action":"unknown"}.
      Phrase: "$phrase"
      JSON:
    """.trimIndent()
  }

  /**
   * Runs the model and hands back its raw JSON, or null. Off the main thread;
   * `done` is called on the worker.
   */
  fun understand(ctx: Context, phrase: String, names: List<String>, done: (String?) -> Unit) {
    worker.execute {
      val llm = ensure(ctx)
      if (llm == null) {
        done(null)
        return@execute
      }
      try {
        val raw = llm.generateResponse(prompt(phrase, names))
        // models like to wrap JSON in prose or fences; take the first object
        val start = raw.indexOf('{')
        val end = raw.lastIndexOf('}')
        done(if (start >= 0 && end > start) raw.substring(start, end + 1) else null)
      } catch (e: Throwable) {
        Log.w(TAG, "inference failed: ${e.message}")
        done(null)
      }
    }
  }
}
