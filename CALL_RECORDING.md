# Call recorder update

The app announces “This call is being recorded” through an installed offline English TTS voice before beginning capture. It waits for speaker routing, refuses muted calls, supports cancellation during setup, and reports asynchronous failures. The recording indicator appears as “Cancel recording” during preparation, then “Stop recording” during capture.

## OEM coverage

Device identification covers Xiaomi/Redmi/POCO, Samsung, OPPO/Realme/OnePlus, Vivo/iQOO, Huawei/Honor, Motorola, Google Pixel, TECNO/Infinix/itel, Sony, ASUS and Nokia/HMD. Other devices use the generic Android path. Settings displays the device and permission-based recording mode.

This is **not an integration with any manufacturer's proprietary recorder**. No documented vendor recording SDK was supplied with the project. Device branding never grants extra privileges. This implementation uses the public Android capture API and retries AAC capture at 44.1, 16 and 8 kHz to accommodate encoder differences.

The direct VOICE_CALL path is attempted only if firmware has actually granted CAPTURE_AUDIO_OUTPUT. Merely declaring the permission, installing an APK or being the default phone app does not grant it. Actual Xiaomi or other OEM system integration requires the manufacturer's firmware permissions/signing/privileged installation and a supported integration interface. This source does not perform rooting or firmware changes.

Ordinary installations use speakerphone microphone capture, which Android or OEM firmware may block or silence. Both voices and remote announcement audibility cannot be guaranteed. TTS completion only confirms local playback, not receipt by the other person. Confirm they heard the announcement. Bluetooth and wired headset recording are not supported by this fallback. The app stops on hold, mute or leaving speakerphone; it restores the previous route if the user has not changed it.

A silent direct source falls back to the microphone. If no signal is observed on the microphone during the initial roughly 15 seconds, the silent file is removed and an error explains the limitation. This may also happen during a genuinely quiet call: speak during the test. Recorder errors stop capture and surface an error. Files containing audio are kept when a session stops.

## Validation performed

- Parsed all changed JavaScript/JSX files with Babel.
- Parsed AndroidManifest.xml and checked ZIP integrity.
- Reviewed permission checks, setup cancellation, TTS timeout, call state monitoring, encoder retries, private storage, and cleanup paths.

No Android SDK, Gradle project output or physical device was available here, so the Kotlin changes have not been compiled and recordings have not been verified on hardware. No APK is included.

## Device verification required before release

Build with the existing Expo/Android workflow. On at least one physical phone from each target OEM, verify:

1. Incoming and outgoing connected calls: hear the exact notice, confirm the remote participant hears it, and play back both voices.
2. Missing/denied microphone permission, media volume zero, missing offline voice and TTS failure: no recording should begin.
3. Repeated Record taps, cancel during announcement and hang up during setup: one session at most; no late restart.
4. Hold, mute, call swap, speaker/headset/Bluetooth changes and end call: stop promptly and release the microphone.
5. Encoder failure, silence-only capture and storage error: show the failure rather than promising a usable recording.
6. Manual and automatic recording with foreground/background and locked screen; Android may reject background microphone foreground-service starts.
7. Saved recordings play correctly and the prior audio route is restored when appropriate.

Reference: https://developer.android.com/reference/android/media/MediaRecorder.AudioSource and https://developer.android.com/media/platform/sharing-audio-input
