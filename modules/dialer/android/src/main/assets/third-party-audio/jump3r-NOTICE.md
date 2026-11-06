# Jump3r MP3 encoder

Jump3r 1.0.5, Java port of LAME, LGPL-2.1-or-later.
Authors: L.A.M.E. project, Ken Händel, Vadym Vikulin, Hanns Holger Rutz.
Upstream: https://git.iem.at/sciss/jump3r
Maven: https://repo.maven.apache.org/maven2/de/sciss/jump3r/1.0.5/

The bundled libs/jump3r-core-1.0.5.jar contains unmodified bytecode from the
mp3 and mpg packages of the original jar. Desktop entry points and Java Sound
wrappers are excluded because Android has no javax.sound.sampled implementation.
Mp3Encoder.kt calls the core API directly. Full original sources and the license
are supplied here so the encoder can be rebuilt or replaced. Preserve LGPL
notices and applicable relinking/source obligations when redistributing.
