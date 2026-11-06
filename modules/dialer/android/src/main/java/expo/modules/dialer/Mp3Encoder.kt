package expo.modules.dialer

import de.sciss.jump3r.mp3.*
import de.sciss.jump3r.mpg.Common
import de.sciss.jump3r.mpg.Interface
import de.sciss.jump3r.mpg.MPGLib
import java.io.Closeable
import java.io.OutputStream

/** Bounded-memory, pure JVM LAME adapter. No Java Sound or extra JNI runtime. */
class Mp3Encoder(sampleRate: Int, private val output: OutputStream) : Closeable {
  private val lame = Lame()
  private val flags: LameGlobalFlags
  private val encoded = ByteArray(16384)
  private var closed = false
  init {
    val ga = GainAnalysis(); val bs = BitStream(); val p = Presets()
    val qp = QuantizePVT(); val q = Quantize(); val vbr = VBRTag()
    val version = Version(); val id3 = ID3Tag(); val rv = Reservoir(); val take = Takehiro()
    val mpg = MPGLib(); val intf = Interface(); val common = Common()
    lame.setModules(ga, bs, p, qp, q, vbr, version, id3, mpg)
    bs.setModules(ga, mpg, version, vbr); id3.setModules(bs, version)
    p.setModules(lame); q.setModules(bs, rv, qp, take)
    qp.setModules(take, rv, lame.enc.psy); rv.setModules(bs)
    take.setModules(qp); vbr.setModules(lame, bs, version)
    mpg.setModules(intf, common); intf.setModules(vbr, common)
    flags = lame.lame_init()
    flags.num_channels = 1
    flags.in_samplerate = sampleRate
    flags.out_samplerate = sampleRate
    flags.mode = MPEGMode.MONO
    flags.brate = 64
    flags.quality = 5
    flags.VBR = VbrMode.vbr_off
    flags.bWriteVbrTag = false
    flags.findReplayGain = false
    flags.write_id3tag_automatic = false
    id3.id3tag_init(flags)
    require(lame.lame_init_params(flags) == 0) { "MP3 encoder initialization failed" }
  }
  fun encode(pcm: IntArray, count: Int) {
    check(!closed)
    require(count in 0..2048 && count <= pcm.size)
    val size = lame.lame_encode_buffer_int(flags, pcm, pcm, count, encoded, 0, encoded.size)
    check(size >= 0) { "MP3 encoding failed" }
    output.write(encoded, 0, size)
  }
  override fun close() {
    if (closed) return
    closed = true
    try {
      val size = lame.lame_encode_flush(flags, encoded, 0, encoded.size)
      check(size >= 0) { "MP3 finalization failed" }
      output.write(encoded, 0, size)
    } finally { lame.lame_close(flags) }
  }
}
