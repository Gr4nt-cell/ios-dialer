package expo.modules.dialer

import android.content.ContentProviderOperation
import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds.Email
import android.provider.ContactsContract.CommonDataKinds.Organization
import android.provider.ContactsContract.CommonDataKinds.Phone
import android.provider.ContactsContract.CommonDataKinds.Photo
import android.provider.ContactsContract.CommonDataKinds.StructuredName
import android.provider.ContactsContract.Data
import android.provider.ContactsContract.RawContacts
import android.telephony.PhoneNumberUtils
import android.telephony.TelephonyManager
import androidx.exifinterface.media.ExifInterface
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.Locale

object ContactTools {
  // Accounts owned by messaging apps — read-only for us, never the place to put a photo.
  private val MESSENGER_ACCOUNTS = setOf(
    "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "com.viber.voip",
    "org.thoughtcrime.securesms", "com.facebook.messenger", "com.google.android.apps.tachyon",
  )

  private val WHATSAPP_PACKAGES = listOf("com.whatsapp", "com.whatsapp.w4b")

  // ---------- images ----------

  fun readBytes(ctx: Context, uri: String): ByteArray? = try {
    ctx.contentResolver.openInputStream(Uri.parse(uri))?.use { it.readBytes() }
  } catch (_: Exception) { null }

  /** Decodes, downsamples to [maxSide] and applies EXIF rotation. */
  fun decode(bytes: ByteArray, maxSide: Int): Bitmap? {
    return try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
      var sample = 1
      while (bounds.outWidth / (sample * 2) >= maxSide || bounds.outHeight / (sample * 2) >= maxSide) sample *= 2
      val opts = BitmapFactory.Options().apply { inSampleSize = sample }
      var bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, opts) ?: return null

      val rotation = try {
        when (ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90f
          ExifInterface.ORIENTATION_ROTATE_180 -> 180f
          ExifInterface.ORIENTATION_ROTATE_270 -> 270f
          else -> 0f
        }
      } catch (_: Exception) { 0f }

      val longest = maxOf(bmp.width, bmp.height)
      val scale = if (longest > maxSide) maxSide.toFloat() / longest else 1f
      if (rotation != 0f || scale != 1f) {
        val m = Matrix()
        if (scale != 1f) m.postScale(scale, scale)
        if (rotation != 0f) m.postRotate(rotation)
        val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
        if (out != bmp) bmp.recycle()
        bmp = out
      }
      bmp
    } catch (_: Throwable) { null }
  }

  private fun jpeg(bmp: Bitmap, quality: Int): ByteArray {
    val out = ByteArrayOutputStream()
    bmp.compress(Bitmap.CompressFormat.JPEG, quality, out)
    return out.toByteArray()
  }

  fun md5(bytes: ByteArray): String =
    MessageDigest.getInstance("MD5").digest(bytes).joinToString("") { "%02x".format(it) }

  // ---------- contact photo ----------

  private data class Raw(val id: Long, val accountType: String?)

  private fun rawContacts(ctx: Context, contactId: Long): List<Raw> {
    val out = mutableListOf<Raw>()
    ctx.contentResolver.query(
      RawContacts.CONTENT_URI,
      arrayOf(RawContacts._ID, RawContacts.ACCOUNT_TYPE),
      "${RawContacts.CONTACT_ID}=? AND ${RawContacts.DELETED}=0",
      arrayOf(contactId.toString()),
      null,
    )?.use { c ->
      while (c.moveToNext()) out.add(Raw(c.getLong(0), c.getString(1)))
    }
    return out
  }

  fun contactIdForRaw(ctx: Context, rawId: Long): Long? = try {
    ctx.contentResolver.query(
      ContentUris.withAppendedId(RawContacts.CONTENT_URI, rawId),
      arrayOf(RawContacts.CONTACT_ID),
      null,
      null,
      null,
    )?.use { c -> if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else null }
  } catch (_: Exception) { null }

  private fun rank(r: Raw): Int = when {
    r.accountType == "com.google" -> 0
    r.accountType == null -> 1
    r.accountType in MESSENGER_ACCOUNTS -> 9
    r.accountType!!.contains("sim", ignoreCase = true) -> 8
    else -> 2
  }

  /**
   * The best photo the provider holds for each contact that has one, as
   * contact id → uri.
   *
   * PHOTO_URI can be the 96px thumbnail, which is what made a photo look soft
   * filling the call screen. When a contact has a full-size display photo the
   * provider records a PHOTO_FILE_ID for it, and that photo is served from the
   * contact's own display_photo path — usually several hundred pixels square,
   * and the largest the system has.
   */
  fun displayPhotos(ctx: Context): Map<String, String> {
    val out = HashMap<String, String>()
    try {
      ctx.contentResolver.query(
        ContactsContract.Contacts.CONTENT_URI,
        arrayOf(
          ContactsContract.Contacts._ID,
          ContactsContract.Contacts.PHOTO_FILE_ID,
          ContactsContract.Contacts.PHOTO_URI,
        ),
        "${ContactsContract.Contacts.PHOTO_URI} IS NOT NULL",
        null,
        null,
      )?.use { c ->
        while (c.moveToNext()) {
          val id = c.getLong(0)
          val best = if (!c.isNull(1)) {
            Uri.withAppendedPath(
              ContentUris.withAppendedId(ContactsContract.Contacts.CONTENT_URI, id),
              ContactsContract.Contacts.Photo.DISPLAY_PHOTO,
            ).toString()
          } else {
            c.getString(2)
          }
          if (best != null) out[id.toString()] = best
        }
      }
    } catch (_: Exception) {}
    return out
  }

  /**
   * The largest photo the provider will keep, so a photo set in the app isn't
   * downscaled further than it has to be. Contacts caps display photos at its
   * own maximum dimension (commonly 720), and asking is cheap.
   */
  fun displayPhotoMaxDim(ctx: Context): Int = try {
    ctx.contentResolver.query(
      ContactsContract.DisplayPhoto.CONTENT_MAX_DIMENSIONS_URI,
      arrayOf(ContactsContract.DisplayPhoto.DISPLAY_MAX_DIM),
      null,
      null,
      null,
    )?.use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }?.takeIf { it > 0 } ?: 1080
  } catch (_: Exception) { 1080 }

  /**
   * Sets (or with a null [uri], removes) the photo of a contact.
   * Writes a full-size display photo; the provider makes the thumbnail.
   */
  fun setContactPhoto(ctx: Context, contactId: Long, uri: String?): Boolean {
    val cr = ctx.contentResolver
    val raws = rawContacts(ctx, contactId).filter { it.accountType !in MESSENGER_ACCOUNTS }.sortedBy { rank(it) }
    if (raws.isEmpty()) return false

    // drop the old photos first so a removed photo really goes away
    val ops = ArrayList<ContentProviderOperation>()
    raws.forEach { r ->
      ops.add(
        ContentProviderOperation.newDelete(Data.CONTENT_URI)
          .withSelection("${Data.RAW_CONTACT_ID}=? AND ${Data.MIMETYPE}=?", arrayOf(r.id.toString(), Photo.CONTENT_ITEM_TYPE))
          .build(),
      )
    }
    try { cr.applyBatch(ContactsContract.AUTHORITY, ops) } catch (_: Exception) {}
    if (uri == null) return true

    val bytes = readBytes(ctx, uri) ?: return false
    val bmp = decode(bytes, displayPhotoMaxDim(ctx)) ?: return false
    val full = jpeg(bmp, 90)
    val target = raws.first()

    val wroteDisplay = try {
      val photoUri = Uri.withAppendedPath(
        ContentUris.withAppendedId(RawContacts.CONTENT_URI, target.id),
        RawContacts.DisplayPhoto.CONTENT_DIRECTORY,
      )
      cr.openAssetFileDescriptor(photoUri, "rw")?.use { fd ->
        fd.createOutputStream().use { it.write(full) }
      } != null
    } catch (_: Exception) { false }

    if (!wroteDisplay) {
      // Fallback: store a small photo directly in the data table.
      val small = Bitmap.createScaledBitmap(bmp, 360, (360f * bmp.height / bmp.width).toInt().coerceAtLeast(1), true)
      val values = android.content.ContentValues().apply {
        put(Data.RAW_CONTACT_ID, target.id)
        put(Data.MIMETYPE, Photo.CONTENT_ITEM_TYPE)
        put(Data.IS_SUPER_PRIMARY, 1)
        put(Photo.PHOTO, jpeg(small, 85))
      }
      return try { cr.insert(Data.CONTENT_URI, values) != null } catch (_: Exception) { false }
    }
    bmp.recycle()
    return true
  }

  // ---------- numbers ----------

  private fun countryIso(ctx: Context): String {
    val tm = ctx.getSystemService(TelephonyManager::class.java)
    val iso = tm?.simCountryIso?.takeIf { it.isNotBlank() }
      ?: tm?.networkCountryIso?.takeIf { it.isNotBlank() }
      ?: Locale.getDefault().country
    return iso.uppercase(Locale.US)
  }

  /** International digits without "+", e.g. 2348012345678. */
  fun toE164Digits(ctx: Context, number: String): String {
    val e164 = try { PhoneNumberUtils.formatNumberToE164(number, countryIso(ctx)) } catch (_: Exception) { null }
    val raw = e164 ?: number
    var digits = raw.filter { it.isDigit() }
    if (e164 == null && number.trim().startsWith("00")) digits = digits.removePrefix("00")
    return digits
  }

  // ---------- WhatsApp ----------

  fun whatsAppPackage(ctx: Context): String? = WHATSAPP_PACKAGES.firstOrNull { pkg ->
    try {
      ctx.packageManager.getPackageInfo(pkg, 0)
      true
    } catch (_: PackageManager.NameNotFoundException) { false }
  }

  /** kind: "chat" | "voice" | "video". Returns "ok", "chat" (fell back to a chat), "notInstalled" or "error". */
  fun openWhatsApp(ctx: Context, contactId: Long?, number: String, kind: String): String {
    val pkg = whatsAppPackage(ctx) ?: return "notInstalled"
    val digits = toE164Digits(ctx, number)

    if (kind == "voice" || kind == "video") {
      val mimes = if (kind == "video") {
        listOf("vnd.android.cursor.item/vnd.com.whatsapp.video.call", "vnd.android.cursor.item/vnd.com.whatsapp.w4b.video.call")
      } else {
        listOf("vnd.android.cursor.item/vnd.com.whatsapp.voip.call", "vnd.android.cursor.item/vnd.com.whatsapp.w4b.voip.call")
      }
      val tail = digits.takeLast(9)
      var found: Pair<Long, String>? = null
      try {
        val marks = mimes.joinToString(",") { "?" }
        val sel = StringBuilder("${Data.MIMETYPE} IN ($marks)")
        val args = ArrayList(mimes)
        if (contactId != null) {
          sel.append(" AND ${Data.CONTACT_ID}=?")
          args.add(contactId.toString())
        }
        ctx.contentResolver.query(
          Data.CONTENT_URI,
          arrayOf(Data._ID, Data.MIMETYPE, Data.DATA1, Data.DATA3),
          sel.toString(),
          args.toTypedArray(),
          null,
        )?.use { c ->
          while (c.moveToNext()) {
            val data1 = (c.getString(2) ?: "") + " " + (c.getString(3) ?: "")
            val d = data1.filter { it.isDigit() }
            if (tail.isNotEmpty() && d.contains(tail)) {
              found = c.getLong(0) to c.getString(1)
              break
            }
          }
        }
      } catch (_: Exception) {}

      found?.let { (id, mime) ->
        val ownerPkg = if (mime.contains(".w4b.")) "com.whatsapp.w4b" else "com.whatsapp"
        val intent = Intent(Intent.ACTION_VIEW)
          .setDataAndType(ContentUris.withAppendedId(Data.CONTENT_URI, id), mime)
          .setPackage(if (whatsAppPackageInstalled(ctx, ownerPkg)) ownerPkg else pkg)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return try {
          ctx.startActivity(intent)
          "ok"
        } catch (_: Exception) {
          if (openChat(ctx, pkg, digits)) "chat" else "error"
        }
      }
      return if (openChat(ctx, pkg, digits)) "chat" else "error"
    }

    return if (openChat(ctx, pkg, digits)) "ok" else "error"
  }

  private fun whatsAppPackageInstalled(ctx: Context, pkg: String): Boolean = try {
    ctx.packageManager.getPackageInfo(pkg, 0)
    true
  } catch (_: Exception) { false }

  private fun openChat(ctx: Context, pkg: String, digits: String): Boolean {
    val uri = Uri.parse("https://api.whatsapp.com/send?phone=$digits")
    return try {
      ctx.startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      true
    } catch (_: Exception) {
      try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (_: Exception) { false }
    }
  }

  // ---------- depth (subject cut-out) cache ----------

  fun cacheFile(ctx: Context, name: String): File {
    val dir = File(ctx.cacheDir, "call-depth")
    if (!dir.exists()) dir.mkdirs()
    return File(dir, name)
  }

  fun writePng(bmp: Bitmap, file: File) {
    FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
  }

  fun writeJpeg(bmp: Bitmap, file: File) {
    FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.JPEG, 92, it) }
  }

  // ---------- writing contacts ----------
  //
  // expo-contacts raises on both adding and updating here (its Android update path
  // is unreliable and its insert refuses some accounts), which is what surfaced as
  // "Couldn't Save". These go through the content provider directly, the same way
  // the photo write above already does.

  private fun phoneType(label: String?): Int = when (label?.lowercase(Locale.US)) {
    "mobile", "cell" -> Phone.TYPE_MOBILE
    "home" -> Phone.TYPE_HOME
    "work", "office" -> Phone.TYPE_WORK
    "main" -> Phone.TYPE_MAIN
    "fax" -> Phone.TYPE_FAX_WORK
    else -> Phone.TYPE_OTHER
  }

  private fun emailType(label: String?): Int = when (label?.lowercase(Locale.US)) {
    "home" -> Email.TYPE_HOME
    "work", "office" -> Email.TYPE_WORK
    else -> Email.TYPE_OTHER
  }

  /** The raw contact we may write to: ours or the device account, never a messenger's. */
  private fun writableRaw(ctx: Context, contactId: Long): Long? =
    rawContacts(ctx, contactId).filter { it.accountType !in MESSENGER_ACCOUNTS }.sortedBy { rank(it) }.firstOrNull()?.id

  /**
   * Creates a contact, or replaces the name, numbers and emails of an existing one.
   * Returns the contact id, or -1 if the write failed.
   */
  fun saveContact(
    ctx: Context,
    contactId: Long?,
    firstName: String?,
    lastName: String?,
    company: String?,
    phones: List<Map<String, Any?>>,
    emails: List<Map<String, Any?>>,
  ): Long {
    val cr = ctx.contentResolver
    val first = firstName?.trim().orEmpty()
    val last = lastName?.trim().orEmpty()
    val org = company?.trim().orEmpty()
    val display = listOf(first, last).filter { it.isNotEmpty() }.joinToString(" ").ifEmpty { org }

    val numbers = phones.mapNotNull { p ->
      val n = (p["number"] as? String)?.trim().orEmpty()
      if (n.isEmpty()) null else (p["label"] as? String) to n
    }
    val mails = emails.mapNotNull { e ->
      val a = (e["email"] as? String)?.trim().orEmpty()
      if (a.isEmpty()) null else (e["label"] as? String) to a
    }

    val ops = ArrayList<ContentProviderOperation>()

    if (contactId == null) {
      // a new contact goes in the local account, so no sync adapter can refuse it
      ops.add(
        ContentProviderOperation.newInsert(RawContacts.CONTENT_URI)
          .withValue(RawContacts.ACCOUNT_TYPE, null)
          .withValue(RawContacts.ACCOUNT_NAME, null)
          .build(),
      )
      if (display.isNotEmpty() || first.isNotEmpty() || last.isNotEmpty()) {
        ops.add(
          ContentProviderOperation.newInsert(Data.CONTENT_URI)
            .withValueBackReference(Data.RAW_CONTACT_ID, 0)
            .withValue(Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
            .withValue(StructuredName.DISPLAY_NAME, display)
            .withValue(StructuredName.GIVEN_NAME, first.ifEmpty { null })
            .withValue(StructuredName.FAMILY_NAME, last.ifEmpty { null })
            .build(),
        )
      }
      if (org.isNotEmpty()) {
        ops.add(
          ContentProviderOperation.newInsert(Data.CONTENT_URI)
            .withValueBackReference(Data.RAW_CONTACT_ID, 0)
            .withValue(Data.MIMETYPE, Organization.CONTENT_ITEM_TYPE)
            .withValue(Organization.COMPANY, org)
            .withValue(Organization.TYPE, Organization.TYPE_WORK)
            .build(),
        )
      }
      numbers.forEach { (label, number) ->
        ops.add(
          ContentProviderOperation.newInsert(Data.CONTENT_URI)
            .withValueBackReference(Data.RAW_CONTACT_ID, 0)
            .withValue(Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
            .withValue(Phone.NUMBER, number)
            .withValue(Phone.TYPE, phoneType(label))
            .withValue(Phone.LABEL, label)
            .build(),
        )
      }
      mails.forEach { (label, address) ->
        ops.add(
          ContentProviderOperation.newInsert(Data.CONTENT_URI)
            .withValueBackReference(Data.RAW_CONTACT_ID, 0)
            .withValue(Data.MIMETYPE, Email.CONTENT_ITEM_TYPE)
            .withValue(Email.ADDRESS, address)
            .withValue(Email.TYPE, emailType(label))
            .withValue(Email.LABEL, label)
            .build(),
        )
      }
      return try {
        val res = cr.applyBatch(ContactsContract.AUTHORITY, ops)
        val rawId = ContentUris.parseId(res[0].uri ?: return -1L)
        contactIdForRaw(ctx, rawId) ?: -1L
      } catch (_: Exception) { -1L }
    }

    val rawId = writableRaw(ctx, contactId) ?: return -1L
    val raw = rawId.toString()

    // Replace rather than merge: the form shows the whole set, so what it sends
    // is the whole set — otherwise a number deleted in the form survives here.
    listOf(StructuredName.CONTENT_ITEM_TYPE, Organization.CONTENT_ITEM_TYPE, Phone.CONTENT_ITEM_TYPE, Email.CONTENT_ITEM_TYPE)
      .forEach { mime ->
        ops.add(
          ContentProviderOperation.newDelete(Data.CONTENT_URI)
            .withSelection("${Data.RAW_CONTACT_ID}=? AND ${Data.MIMETYPE}=?", arrayOf(raw, mime))
            .build(),
        )
      }
    if (display.isNotEmpty() || first.isNotEmpty() || last.isNotEmpty()) {
      ops.add(
        ContentProviderOperation.newInsert(Data.CONTENT_URI)
          .withValue(Data.RAW_CONTACT_ID, rawId)
          .withValue(Data.MIMETYPE, StructuredName.CONTENT_ITEM_TYPE)
          .withValue(StructuredName.DISPLAY_NAME, display)
          .withValue(StructuredName.GIVEN_NAME, first.ifEmpty { null })
          .withValue(StructuredName.FAMILY_NAME, last.ifEmpty { null })
          .build(),
      )
    }
    if (org.isNotEmpty()) {
      ops.add(
        ContentProviderOperation.newInsert(Data.CONTENT_URI)
          .withValue(Data.RAW_CONTACT_ID, rawId)
          .withValue(Data.MIMETYPE, Organization.CONTENT_ITEM_TYPE)
          .withValue(Organization.COMPANY, org)
          .withValue(Organization.TYPE, Organization.TYPE_WORK)
          .build(),
      )
    }
    numbers.forEach { (label, number) ->
      ops.add(
        ContentProviderOperation.newInsert(Data.CONTENT_URI)
          .withValue(Data.RAW_CONTACT_ID, rawId)
          .withValue(Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
          .withValue(Phone.NUMBER, number)
          .withValue(Phone.TYPE, phoneType(label))
          .withValue(Phone.LABEL, label)
          .build(),
      )
    }
    mails.forEach { (label, address) ->
      ops.add(
        ContentProviderOperation.newInsert(Data.CONTENT_URI)
          .withValue(Data.RAW_CONTACT_ID, rawId)
          .withValue(Data.MIMETYPE, Email.CONTENT_ITEM_TYPE)
          .withValue(Email.ADDRESS, address)
          .withValue(Email.TYPE, emailType(label))
          .withValue(Email.LABEL, label)
          .build(),
        )
    }
    return try {
      cr.applyBatch(ContactsContract.AUTHORITY, ops)
      contactId
    } catch (_: Exception) { -1L }
  }

  /** Appends one number to a contact that already exists. */
  fun addNumber(ctx: Context, contactId: Long, label: String?, number: String): Boolean {
    val n = number.trim()
    if (n.isEmpty()) return false
    val rawId = writableRaw(ctx, contactId) ?: return false
    val values = android.content.ContentValues().apply {
      put(Data.RAW_CONTACT_ID, rawId)
      put(Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE)
      put(Phone.NUMBER, n)
      put(Phone.TYPE, phoneType(label))
      put(Phone.LABEL, label)
    }
    return try { ctx.contentResolver.insert(Data.CONTENT_URI, values) != null } catch (_: Exception) { false }
  }

}
