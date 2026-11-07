package expo.modules.dialer

import android.content.Context

/** Voice preference for embedded caller-name announcements. */
object AnnouncementVoice {
  private fun prefs(ctx: Context) = ctx.getSharedPreferences("dialer_announcement_voice", Context.MODE_PRIVATE)
  fun all(ctx: Context): Map<String, String> {
    val preferences = prefs(ctx)
    return mapOf("callerVoice" to (preferences.getString("callerVoice", "female") ?: "female"))
  }
  fun set(ctx: Context, kind: String, voice: String): Boolean {
    if (kind != "callerVoice" || voice !in setOf("male", "female")) return false
    prefs(ctx).edit().putString(kind, voice).apply()
    return true
  }
  fun incomingResources(ctx: Context, identity: String?): List<Int> {
    val male = prefs(ctx).getString("callerVoice", "female") == "male"
    val number = identity?.takeIf { it.isNotBlank() && it.all { char -> char in '0'..'9' || char.isWhitespace() } }?.filter { it in '0'..'9' }
    if (number.isNullOrBlank()) return listOf(if (male) R.raw.incoming_call_male else R.raw.incoming_call_female)
    val digits = if (male) intArrayOf(R.raw.digit_0_male, R.raw.digit_1_male, R.raw.digit_2_male, R.raw.digit_3_male, R.raw.digit_4_male, R.raw.digit_5_male, R.raw.digit_6_male, R.raw.digit_7_male, R.raw.digit_8_male, R.raw.digit_9_male)
      else intArrayOf(R.raw.digit_0_female, R.raw.digit_1_female, R.raw.digit_2_female, R.raw.digit_3_female, R.raw.digit_4_female, R.raw.digit_5_female, R.raw.digit_6_female, R.raw.digit_7_female, R.raw.digit_8_female, R.raw.digit_9_female)
    return listOf(if (male) R.raw.incoming_call_from_male else R.raw.incoming_call_from_female) + number.take(15).map { digits[it - '0'] }
  }
}
