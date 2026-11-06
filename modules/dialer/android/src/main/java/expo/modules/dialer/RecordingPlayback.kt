package expo.modules.dialer

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File

/** One app-private M4A/MP3 player. All MediaPlayer access stays on the main looper. */
object RecordingPlayback {
  private val main = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var audio: AudioManager? = null
  private var focus: AudioFocusRequest? = null
  private var name: String? = null
  private var ready = false
  private var error: String? = null
  @Volatile private var snapshot = "{}"
  private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
  private val listener = AudioManager.OnAudioFocusChangeListener { change -> main.post {
    if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
      try { if (ready) player?.pause() } catch (_: Exception) {}
      publish()
    }
  } }

  fun state(): String = snapshot

  fun play(ctx: Context, fileName: String): Boolean {
    if (File(fileName).name != fileName || fileName.substringAfterLast('.', "").lowercase() !in setOf("m4a", "mp3")) return false
    val file = File(RecordingService.dir(ctx), fileName)
    if (!file.isFile || file.length() == 0L) return false
    main.post {
      stopNow()
      name = fileName
      if (CallManager.hasLiveCalls()) { fail("End the call before playing a saved recording."); return@post }
      try {
        audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (audio!!.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) {
          fail("Media volume is muted. Turn it up, then tap Play again."); return@post
        }
        // Telecom may have left the process in a communication route after hangup.
        try {
          audio!!.mode = AudioManager.MODE_NORMAL
          if (Build.VERSION.SDK_INT >= 31) audio!!.clearCommunicationDevice()
        } catch (_: Exception) { /* Media attributes still select the media output. */ }
        if (!requestFocus()) { fail("Audio is busy. Try playing the recording again."); return@post }
        val mp = MediaPlayer()
        player = mp
        mp.setAudioAttributes(attributes)
        mp.setVolume(1f, 1f)
        mp.setDataSource(file.absolutePath)
        mp.setOnPreparedListener {
          if (player !== it) return@setOnPreparedListener
          if (CallManager.hasLiveCalls()) { stopNow(); return@setOnPreparedListener }
          try { ready = true; it.start(); publish() }
          catch (_: Exception) { fail("The recording could not start playing.") }
        }
        mp.setOnCompletionListener {
          if (player === it) {
            try { it.seekTo(0); publish(finished = true); abandonFocus() }
            catch (_: Exception) { fail("The recording could not finish playing.") }
          }
        }
        mp.setOnErrorListener { failed, _, _ ->
          if (player === failed) fail("This recording could not be decoded. It may be incomplete or damaged.")
          true
        }
        publish()
        mp.prepareAsync()
        main.postDelayed({ if (player === mp && !ready) fail("The recording took too long to open.") }, 10000)
        tick(mp)
      } catch (_: Exception) { fail("The saved recording could not be opened.") }
    }
    return true
  }

  fun pause() { main.post { try { if (ready) player?.pause() } catch (_: Exception) {}; publish(); abandonFocus() } }
  fun resume() { main.post {
    if (CallManager.hasLiveCalls()) { fail("End the call before playing a saved recording."); return@post }
    try {
      if (ready) {
        if (requestFocus()) player?.start() else { fail("Audio is busy. Try playing the recording again."); return@post }
      }
    } catch (_: Exception) { fail("The recording could not resume.") }
    publish()
  } }
  fun stop() { main.post { stopNow() } }

  private fun requestFocus(): Boolean {
    val am = audio ?: return false
    return if (Build.VERSION.SDK_INT >= 26) {
      val req = focus ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(attributes).setOnAudioFocusChangeListener(listener, main).build().also { focus = it }
      am.requestAudioFocus(req) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    } else {
      @Suppress("DEPRECATION")
      am.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }
  }
  private fun abandonFocus() {
    try {
      if (Build.VERSION.SDK_INT >= 26) focus?.let { audio?.abandonAudioFocusRequest(it) }
      else { @Suppress("DEPRECATION") audio?.abandonAudioFocus(listener) }
    } catch (_: Exception) {}
    focus = null
  }
  private fun tick(mp: MediaPlayer) {
    main.postDelayed({
      if (player !== mp) return@postDelayed
      if (CallManager.hasLiveCalls()) { stopNow(); return@postDelayed }
      publish()
      tick(mp)
    }, 250)
  }
  private fun publish(finished: Boolean = false) {
    val mp = player
    snapshot = JSONObject().put("name", name ?: JSONObject.NULL).put("loading", mp != null && !ready)
      .put("playing", try { ready && mp?.isPlaying == true } catch (_: Exception) { false })
      .put("duration", try { if (ready) (mp?.duration ?: 0) / 1000.0 else 0.0 } catch (_: Exception) { 0.0 })
      .put("currentTime", try { if (ready) (mp?.currentPosition ?: 0) / 1000.0 else 0.0 } catch (_: Exception) { 0.0 })
      .put("didJustFinish", finished).put("error", error ?: JSONObject.NULL).toString()
  }
  private fun fail(message: String) { stopNow(); error = message; publish() }
  private fun stopNow() {
    val mp = player
    player = null
    ready = false
    try { mp?.release() } catch (_: Exception) {}
    abandonFocus()
    audio = null
    name = null
    error = null
    publish()
  }
}
