# Recording playback, formats, black calls and three announcements — 1.0.8

Install a fresh native build (version code 9). All changes extend the source with
the already working offline caller voices. No caller speech models or wallpapers
were removed.

## Saved audio

The existing microphone/firmware capture and spoken recording notice are kept.
M4A is the default: AAC mono in a real MPEG-4 audio container. Settings → Call
Recording → Recording Format now offers M4A and MP3. Choosing MP3 still captures
the reliable M4A first, then decodes it with Android MediaCodec and encodes real
MP3 audio on one low-priority background thread using a pure JVM LAME port.
It does not rename an AAC file with an MP3 suffix. Only bounded PCM buffers are
used, not the whole recording in memory. Both formats are listed and labeled.

The conversion writes a hidden `.mp3.part` file and publishes the MP3 atomically
only after encoder flush and metadata validation. The original M4A is retained
if conversion fails, the app process dies, storage fills, or a decoder is not
supported. Existing M4A recordings remain playable. Deleting the source during
conversion cancels publishing; partial files do not appear in the list. Long
recordings may take time to convert on low-end phones.

Recordings now use Android MediaPlayer directly against the private file path,
with async preparation, media audio attributes, audio focus, pause/resume, replay,
progress, and visible decoder/loading errors. This replaces the old Expo player
source-replace/immediate-play path. Media routing is restored after a call on a
best-effort basis, without overriding a live call. Play saved recordings after
the call ends. Media volume must be audible. A new incoming/outgoing call stops
playback; leaving the recordings screen releases it. File metadata is refreshed
when conversion changes the list, not scanned repeatedly while idle.

This repairs the playback path, but cannot restore an older file whose container
was already damaged, or create audio in a file that captured only silence.

## Dark call appearance

Every dark call background is now #000000 regardless of a previously selected
wallpaper. Circular controls use charcoal glass with light borders and white
icons; the end-call button remains red. All twelve call backgrounds and the
saved selection are retained for light mode. The app shell already uses AMOLED
black in dark mode and fixed Rosewater in light mode. The settings call preview
uses the same black-background decision.

## Three caller announcements

The incoming caller announcement (name, generic incoming call, or enabled number)
plays three complete times, with 800 ms between phrases. Cached neural speech is
reused; the name is not synthesized three times. Answer, decline, another call,
silent/DND changes and lock-screen privacy still cancel pending repeats. Test
Announcer auditions the three repeats too. The separate recording-consent notice
remains one announcement before capture, as before.

## Validation

- All 70 JavaScript files parse and the scope checker passes.
- Five regression tests pass: microphone declarations and all dark/light call
  background combinations, including legacy and saved wallpaper preferences.
- Changed native playback, format converter, recording service, MP3 encoder and
  caller-announcement classes compile against Android API 35, AndroidX Core,
  the bundled sherpa AAR and the bundled MP3 jar; unrelated app collaborators
  were represented by compile stubs. This is not a full APK build.
- The actual Mp3Encoder adapter generated two-second mono MP3 files at 8000,
  16000 and 44100 Hz. FFprobe confirmed MP3, rate and channels; FFmpeg decoded
  all three to non-silent PCM of the expected duration (including MP3 padding).
- Android MediaCodec conversion, MediaPlayer routing and incoming-call repeats
  still require device testing. No claim is made that a new APK was installed
  or tested on the Xiaomi here.

MP3 component license and full original source: third_party/jump3r. Runtime
notices are also included in native Android assets/third-party-audio.
