package expo.modules.dialer

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.ContactsContract
import android.provider.Settings
import android.telecom.Call
import androidx.core.content.ContextCompat

/**
 * Plays the ringtone and vibration for incoming calls.
 *
 * Many phones (Xiaomi/HyperOS in particular) leave ringing to the default phone app, so the
 * service declares IN_CALL_SERVICE_RINGING and this class does the ringing: the contact's own
 * ringtone or the phone's default, following the ring/vibrate/silent switch and Do Not Disturb.
 * While another call is already in progress it plays the soft call-waiting beep instead.
 */
object Ringer {
  private val main = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var vibrating = false
  private var ringingId: String? = null
  private var silencedId: String? = null
  private var waitingTone: ToneGenerator? = null
  private var waitingId: String? = null

  private val waitingBeep = object : Runnable {
    override fun run() {
      try { waitingTone?.startTone(ToneGenerator.TONE_SUP_CALL_WAITING, 900) } catch (_: Exception) {}
      main.postDelayed(this, 3500)
    }
  }

  /** Called whenever call state changes. */
  fun update(ctx: Context) {
    val ringing = CallManager.ringingCall()
    val id = ringing?.let { CallManager.idOf(it) }
    if (ringing == null || id == null || id == silencedId) {
      stop()
      return
    }
    val busy = CallManager.topLevelCalls().any {
      it != ringing && CallManager.stateOf(it).let { s ->
        s == Call.STATE_ACTIVE || s == Call.STATE_HOLDING || s == Call.STATE_DIALING || s == Call.STATE_CONNECTING
      }
    }
    if (busy) startWaiting(id) else startRinging(ctx, ringing, id)
  }

  /** Volume key / "Silence" button: stop the sound for this call only. */
  fun silence() {
    silencedId = ringingId ?: waitingId
    stop()
  }

  private fun startRinging(ctx: Context, call: Call, id: String) {
    if (ringingId == id) return
    stop()
    ringingId = id

    // Telecom asks for silent ringing when the call is filtered (DND, call screening…)
    if (Build.VERSION.SDK_INT >= 29 && call.details.extras?.getBoolean(Call.EXTRA_SILENT_RINGING_REQUESTED, false) == true) return

    val audio = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val mode = audio.ringerMode
    if (mode == AudioManager.RINGER_MODE_SILENT) return

    val vibrateWhenRinging = try {
      Settings.System.getInt(ctx.contentResolver, "vibrate_when_ringing", 1) == 1
    } catch (_: Exception) { true }
    if (mode == AudioManager.RINGER_MODE_VIBRATE || vibrateWhenRinging) vibrate(ctx)
    if (mode == AudioManager.RINGER_MODE_NORMAL && audio.getStreamVolume(AudioManager.STREAM_RING) > 0) {
      play(ctx, ringtoneFor(ctx, call))
    }
  }

  private fun ringtoneFor(ctx: Context, call: Call): Uri? {
    val number = call.details.handle?.schemeSpecificPart ?: ""
    if (number.isNotBlank() &&
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED
    ) {
      try {
        ctx.contentResolver.query(
          Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number)),
          arrayOf(ContactsContract.PhoneLookup.CUSTOM_RINGTONE),
          null, null, null,
        )?.use { c ->
          if (c.moveToFirst()) c.getString(0)?.takeIf { it.isNotBlank() }?.let { return Uri.parse(it) }
        }
      } catch (_: Exception) {}
    }
    return try {
      RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_RINGTONE)
    } catch (_: Exception) { null } ?: Settings.System.DEFAULT_RINGTONE_URI
  }

  private fun play(ctx: Context, uri: Uri?) {
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val candidates = listOfNotNull(uri, Settings.System.DEFAULT_RINGTONE_URI, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
    for (u in candidates) {
      val mp = MediaPlayer()
      try {
        mp.setAudioAttributes(attrs)
        mp.setDataSource(ctx, u)
        mp.isLooping = true
        mp.prepare()
        mp.start()
        player = mp
        return
      } catch (_: Exception) {
        try { mp.release() } catch (_: Exception) {}
      }
    }
  }

  private fun vibrator(ctx: Context): Vibrator? =
    if (Build.VERSION.SDK_INT >= 31) {
      (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

  private fun vibrate(ctx: Context) {
    val v = vibrator(ctx) ?: return
    if (!v.hasVibrator()) return
    val pattern = longArrayOf(0, 1000, 1000)
    try {
      val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build()
      if (Build.VERSION.SDK_INT >= 26) {
        @Suppress("DEPRECATION")
        v.vibrate(VibrationEffect.createWaveform(pattern, 0), attrs)
      } else {
        @Suppress("DEPRECATION")
        v.vibrate(pattern, 0, attrs)
      }
      vibrating = true
    } catch (_: Exception) {}
  }

  private fun startWaiting(id: String) {
    if (waitingId == id) return
    stop()
    waitingId = id
    try {
      waitingTone = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 80)
      main.post(waitingBeep)
    } catch (_: Exception) {}
  }

  fun stop() {
    player?.let {
      try { it.stop() } catch (_: Exception) {}
      try { it.release() } catch (_: Exception) {}
    }
    player = null
    if (vibrating) {
      CallManager.appContext?.let { ctx -> try { vibrator(ctx)?.cancel() } catch (_: Exception) {} }
      vibrating = false
    }
    main.removeCallbacks(waitingBeep)
    waitingTone?.let { try { it.release() } catch (_: Exception) {} }
    waitingTone = null
    ringingId = null
    waitingId = null
  }
}
