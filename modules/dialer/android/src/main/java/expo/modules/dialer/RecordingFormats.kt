package expo.modules.dialer

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.os.Process
import java.io.File
import java.nio.ByteOrder
import java.util.concurrent.Executors

/** Keep the working AAC capture. MP3 is converted after stop, never by renaming AAC. */
object RecordingFormats {
  private val changed = java.util.concurrent.atomic.AtomicInteger()
  fun revision(): Int = changed.get()
  private val worker = Executors.newSingleThreadExecutor { task ->
    Thread({ Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND); task.run() }, "RecordingExport")
  }
  fun get(ctx: Context): String = ctx.getSharedPreferences("dialer_recording_format", Context.MODE_PRIVATE).getString("format", "m4a") ?: "m4a"
  fun set(ctx: Context, format: String): Boolean {
    if (format !in setOf("m4a", "mp3")) return false
    ctx.getSharedPreferences("dialer_recording_format", Context.MODE_PRIVATE).edit().putString("format", format).apply()
    return true
  }
  fun convert(source: File) {
    worker.execute {
      if (!source.isFile) return@execute
      val target = File(source.parentFile, source.nameWithoutExtension + ".mp3")
      val partial = File(source.parentFile, source.nameWithoutExtension + ".mp3.part")
      val extractor = MediaExtractor()
      var codec: MediaCodec? = null
      try {
        extractor.setDataSource(source.absolutePath)
        val track = (0 until extractor.trackCount).first { extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
        extractor.selectTrack(track)
        val format = extractor.getTrackFormat(track)
        val rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
        // Recorder always writes mono. Keep the original if an unexpected file is encountered.
        require(format.getInteger(MediaFormat.KEY_CHANNEL_COUNT) == 1)
        format.setInteger(MediaFormat.KEY_PCM_ENCODING, AudioFormat.ENCODING_PCM_16BIT)
        val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
        codec = decoder
        decoder.configure(format, null, null, 0)
        decoder.start()
        partial.outputStream().buffered().use { stream ->
          Mp3Encoder(rate, stream).use { encoder ->
            val info = MediaCodec.BufferInfo()
            val samples = IntArray(2048)
            var inputDone = false
            var outputDone = false
            var deadline = System.nanoTime() + 30000000000L
            while (!outputDone) {
              check(System.nanoTime() < deadline) { "Decoder stalled" }
              if (!source.exists()) throw IllegalStateException("Recording deleted")
              if (!inputDone) {
                val inputIndex = decoder.dequeueInputBuffer(10000)
                if (inputIndex >= 0) {
                  val buffer = decoder.getInputBuffer(inputIndex)!!
                  val size = extractor.readSampleData(buffer, 0)
                  if (size < 0) {
                    decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                    inputDone = true
                  } else {
                    decoder.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime, 0)
                    extractor.advance()
                  }
                }
              }
              val outputIndex = decoder.dequeueOutputBuffer(info, 10000)
              if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                val decoded = decoder.outputFormat
                require(decoded.getInteger(MediaFormat.KEY_CHANNEL_COUNT) == 1)
                if (decoded.containsKey(MediaFormat.KEY_PCM_ENCODING)) require(decoded.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_16BIT)
              } else if (outputIndex >= 0) {
                deadline = System.nanoTime() + 30000000000L
                val pcm = decoder.getOutputBuffer(outputIndex)!!.order(ByteOrder.LITTLE_ENDIAN)
                pcm.position(info.offset); pcm.limit(info.offset + info.size)
                while (pcm.remaining() >= 2) {
                  val count = minOf(samples.size, pcm.remaining() / 2)
                  for (i in 0 until count) samples[i] = pcm.short.toInt() shl 16
                  encoder.encode(samples, count)
                }
                outputDone = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
                decoder.releaseOutputBuffer(outputIndex, false)
              }
            }
          }
        }
        check(partial.length() > 1024)
        // Atomic publish; never discard the original until MP3 is complete and validated.
        val metadata = android.media.MediaMetadataRetriever()
        try {
          metadata.setDataSource(partial.absolutePath)
          check((metadata.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0) > 0)
        } finally { metadata.release() }
        if (source.exists() && !target.exists() && partial.renameTo(target)) {
          target.setLastModified(source.lastModified())
          source.delete()
        }
      } catch (_: Exception) {
        // A crash, low storage, or unsupported decoder leaves the playable original M4A intact.
      } finally {
        partial.delete()
        try { codec?.stop() } catch (_: Exception) {}
        try { codec?.release() } catch (_: Exception) {}
        extractor.release()
        changed.incrementAndGet()
      }
    }
  }
}
