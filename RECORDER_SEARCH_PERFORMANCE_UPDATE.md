# Recorder, search, performance and call-announcer update

## Microphone permission recovery

Android call recording now checks and requests RECORD_AUDIO directly using React Native PermissionsAndroid, matching the native recorder permission gate. An already-granted permission proceeds immediately. Denied or permanently blocked permissions provide an Open Settings action rather than a dead-end OK message. Permission is rechecked on return before the user retries recording.

Settings → Call Recording includes Microphone Access. Enabling automatic recording asks for permission ahead of a call; background automatic recording never raises a permission dialog. Grant Microphone while using the app, return to the app and tap Record again. The microphone privacy switch must also be on.

This fixes the permission flow shown in the supplied screenshot. It cannot make Android/OEM-blocked call capture work. Speakerphone capture and the recording announcement still require device verification. The native service will report blocked or silent capture instead of promising a usable recording.

## Full-name search history

Selecting a contact or its call button now saves the full contact name and replaces the typed search prefix. Selecting a recent-call result likewise saves its resolved full name, or its number. Previous raw searches remain unchanged unless replaced by a subsequent result selection; an old “Gl” entry cannot reliably be expanded without selecting the intended person again.

History remains limited to nine recent searches in a 3×3 grid. Names wrap without a two-line limit. Capsule rows grow to fit long names instead of clipping them. Search indexes are memoized, and result filtering uses a deferred query to keep text entry responsive.

## Static glass and reduced rendering load

All live refraction providers, animated sweeps and their continuous animation loops have been removed. The translucent glass finish, white edges, static highlights and touch feedback remain.

Performance mode now uses a small bundled static sheen and skips expensive layered gradients, live blur and large shadows on devices classified as low end. The low-end heuristic includes devices with at most 4 GiB RAM, device year class 2020 or older, or 32-bit-only ARM. The user’s selected profile remains respected. Optimized mode reduces effects further. Decorative call-avatar pulsing is omitted on low-end devices, and the remaining native-driver pulse on other devices does not register as an ongoing interaction that can delay list rendering.

These are rendering-work reductions; FPS gains have not been measured on hardware.

## Optional incoming-call announcer

Settings → Call Announcer offers Announce Incoming Calls, Speak Unsaved Numbers, and Test Announcer. It is off by default. When enabled, native Android ringing invokes a once-per-call offline text-to-speech announcement: the saved contact name, or generic incoming-call speech. Reading unsaved numbers is opt-in. This does not identify the owners of unknown numbers.

The voice follows the phone language and requires an installed offline voice. English, Turkish, Spanish, Chinese, Thai, Polish, Japanese and Italian announcement wording is included. Silent/vibrate mode, zero ring volume, DND, call waiting and hidden lock-screen identity suppress speech as appropriate. Answering, rejecting or silencing a call stops the announcer. The ringtone is temporarily ducked during speech and restored afterwards. The settings test reports missing voices and playback failures. Caller announcements do not require microphone permission and are separate from the recording notice.

Unknown-caller identification, Truecaller lookup and other online identity services are not included, as requested. No internet permission or online database was added.

## Validation

- All 68 JavaScript/JSX files parse; repository scope checks pass.
- Exercised permission-already-granted, newly granted, denied, permanently blocked, Settings recovery, silent automatic checks, request failures and concurrent permission requests with mocks.
- Checked full-name prefix replacement, preservation of long names, nine-item eviction and low-end/performance glass budgets.
- Checked relative imports and bundled asset references, Android manifest XML, and source ZIP integrity.
- Reviewed announcer cancellation, lifecycle, offline voice selection, privacy and ringtone restoration paths.

The Kotlin changes have not been compiled: an Android SDK/build environment is not available in this workspace. No APK or physical-device recording, speech or frame-rate test was performed. Build the source with the existing Expo Android workflow, then test permission recovery, incoming calls, voice availability and both sides of a recorded call on the target phone.
