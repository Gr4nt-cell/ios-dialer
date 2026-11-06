> Version 1.0.9 reduces this payload to English-only data, with no voice-model
> change. Current size and background choices are documented in SIZE_REDUCTION.md.

# Bundled caller-name speech — version 1.0.7 (Android version code 8)

## Use

Build and install a fresh native APK; Expo Go cannot run this module. In Settings,
enable Call Announcer, choose Male or Female, and tap Test Announcer. The test
uses the embedded engine to say “Incoming call from Stephen.” It reports failure
if name synthesis fails, rather than passing a generic clip off as a name test.
There is no Google TTS, extra voice app, Internet request, microphone access,
listening service, or runtime voice-model download.

Saved contact names come from the existing contacts lookup. Unknown callers get
“Incoming call”, or spoken digits if the existing number option is enabled.
This does not identify unknown people or query Truecaller. The recording notice
continues to use its bundled male/female clips and does not require neural
synthesis or a system TTS engine. Recording remains subject to Android/OEM audio
capture restrictions; this change does not grant system capture privileges.

## Behavior and limits

- English neural speech, one complete phrase with the selected speaker. Names
  in other languages are approximated; pronunciation of Ghanaian and other
  names is not guaranteed. This is not a multilingual voice pack.
- Single background worker and one inference thread; neither model extraction
  nor synthesis runs on the UI thread. Warm up when the announcer is enabled.
- Cache generated WAVs in app-private cache storage using hashed filenames:
  at most 64 entries / 8 MiB, with 24-hour expiry checked on the next request.
  A completed synthesis may be cached after cancellation, but cannot start late
  playback. Changing the contact name or selected voice creates a different key.
- Release the model after 60 seconds without use. The bundled assets are copied
  once to internal no-backup storage, with a completion marker written last.
- Names are limited to 80 characters for synthesis, with control characters
  removed. A very long display name may be shortened in speech.
- Preserve ringtone volume, silent mode, vibrate mode, DND, lock-screen identity
  privacy and call-waiting behavior. Duck the ringtone only during playback.
  Stop speech after answer/decline, call end, privacy lock, or a new announcement.
- First synthesis may take longer on slow hardware. Keep ringing and fall back
  to a short generic clip after 12 seconds. The generated result can speed the
  next call. No speech starts after the pending call has ended.
- The source includes a ~28 MiB all-ABI AAR and ~23 MiB uncompressed model/data;
  APK sizes vary by ABI. Expect extra installed storage for extracted model data.

## Integration

`modules/dialer/android/.../EmbeddedCallerSpeech.kt` owns offline inference,
model extraction, cache and idle release. `CallerAnnouncer.kt` owns ringtone
playback, privacy and cancellation. `AnnouncementVoice.kt` shares the existing
voice preferences. A local Maven repository packages the pinned AAR so native
builds do not fetch an unpinned TTS runtime. Consumer ProGuard rules preserve
JNI configuration classes. The arm64 native library has 16 KiB LOAD alignment.

## Validation completed here

- New/changed Kotlin speech classes compile with Kotlin 2.0.21 against Android
  API 35 classes and the actual bundled AAR, with existing app collaborators
  represented by compile stubs. This is not a full app build or device test.
- CPU offline smoke test with the same engine version and bundled model:
  Stephen, Gloria, Kwame, Esther Sarfoa, Dr Bekui, both speaker IDs; each produced
  non-silent 22050 Hz audio. Desktop timing is not a phone performance promise.
- JavaScript: all 70 files parse; scope check passes; all three microphone
  permission regression tests pass.
- Full APK build and actual incoming calls on a Xiaomi/Chinese ROM remain to be
  tested. Check both voices, a cold start, screen locking during synthesis,
  answering immediately, silent/DND, and the generic unknown-caller fallback.

## Notices

See assets/licenses/embedded-speech/NOTICE.md and bundled source/license files.
