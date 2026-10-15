package expo.modules.calllog

import android.provider.CallLog
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallLog")

    // Most recent calls first. Requires READ_CALL_LOG.
    AsyncFunction("load") { limit: Int ->
      val context = appContext.reactContext ?: throw CodedException("No Android context")
      val rows = mutableListOf<Map<String, Any?>>()
      val projection = arrayOf(
        CallLog.Calls._ID,
        CallLog.Calls.NUMBER,
        CallLog.Calls.CACHED_NAME,
        CallLog.Calls.TYPE,
        CallLog.Calls.DATE,
        CallLog.Calls.DURATION
      )
      context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        projection,
        null,
        null,
        CallLog.Calls.DATE + " DESC"
      )?.use { c ->
        while (c.moveToNext() && rows.size < limit) {
          rows.add(
            mapOf(
              "id" to c.getLong(0).toString(),
              "number" to (c.getString(1) ?: ""),
              "name" to c.getString(2),
              "type" to c.getInt(3),
              "date" to c.getLong(4).toDouble(),
              "duration" to c.getLong(5).toDouble()
            )
          )
        }
      }
      rows
    }

    // Deletes entries by id. Requires WRITE_CALL_LOG. Returns number deleted.
    AsyncFunction("remove") { ids: List<String> ->
      val context = appContext.reactContext ?: throw CodedException("No Android context")
      var deleted = 0
      ids.chunked(200).forEach { chunk ->
        val placeholders = chunk.joinToString(",") { "?" }
        deleted += context.contentResolver.delete(
          CallLog.Calls.CONTENT_URI,
          CallLog.Calls._ID + " IN (" + placeholders + ")",
          chunk.toTypedArray()
        )
      }
      deleted
    }
  }
}
