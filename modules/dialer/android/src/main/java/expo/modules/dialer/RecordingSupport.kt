package expo.modules.dialer

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.util.Locale

/** OEM names describe the device, never imply access to its private dialer APIs. */
internal object RecordingSupport {
  fun family(manufacturer: String, brand: String): String {
    val names = listOf(manufacturer, brand).map { it.lowercase(Locale.ROOT).trim() }
    return when {
      names.any { it in setOf("xiaomi", "redmi", "poco") } -> "Xiaomi / Redmi / POCO"
      "samsung" in names -> "Samsung"
      names.any { it in setOf("oppo", "realme", "oneplus") } -> "OPPO / Realme / OnePlus"
      names.any { it in setOf("vivo", "iqoo") } -> "Vivo / iQOO"
      names.any { it in setOf("huawei", "honor") } -> "Huawei / Honor"
      "motorola" in names -> "Motorola"
      "google" in names -> "Google Pixel"
      names.any { it in setOf("tecno", "infinix", "itel") } -> "TECNO / Infinix / itel"
      "sony" in names -> "Sony"
      "asus" in names -> "ASUS"
      "nokia" in names || "hmd global" in names || "hmd" in names -> "Nokia / HMD"
      else -> manufacturer.ifBlank { "Android" }
    }
  }

  @Suppress("DEPRECATION")
  fun microphoneDeclared(ctx: Context): Boolean = try {
    ctx.packageManager.getPackageInfo(ctx.packageName, PackageManager.GET_PERMISSIONS)
      .requestedPermissions?.contains(Manifest.permission.RECORD_AUDIO) == true
  } catch (_: Exception) { false }

  fun directAudioGranted(ctx: Context): Boolean = ContextCompat.checkSelfPermission(
    ctx, "android.permission.CAPTURE_AUDIO_OUTPUT"
  ) == PackageManager.PERMISSION_GRANTED

  fun info(ctx: Context): Map<String, Any> {
    val direct = directAudioGranted(ctx)
    return mapOf(
      "family" to family(Build.MANUFACTURER, Build.BRAND),
      "model" to Build.MODEL,
      "androidVersion" to Build.VERSION.SDK_INT,
      "directAudioGranted" to direct,
      "microphoneDeclared" to microphoneDeclared(ctx),
      "microphoneGranted" to (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED),
      "mode" to if (direct) "System call audio, with microphone fallback" else "Speakerphone microphone (device dependent)",
      "vendorRecorderIntegrated" to false,
      "notice" to "OEM built-in recording is a separate system feature. Manufacturer detection does not unlock it. Confirm the other person hears the spoken notice and test both voices on this device."
    )
  }
}
