# Xiaomi microphone permission missing: build fix

The build configuration set expo-image-picker.microphonePermission to false. Expo documents that this removes RECORD_AUDIO on Android. A permission listed in app.json or a library manifest can therefore disappear from the packaged app. This explains the source-level conflict corresponding to the supplied Xiaomi screenshots. The installed APK itself was not supplied for direct inspection.

Version 1.0.4 replaces the false setting with the same microphone-purpose text used by expo-audio and explicitly enables recordAudioAndroid. A final config plugin restores uncapped microphone and foreground-service declarations and removes stale per-permission manifest-removal markers. Existing INTERNET blocking is preserved.

Both APK and AAB workflows now run the configuration regression tests and verify the generated native manifest. The merged-release manifest check also requires the capture permissions, and the APK workflow inspects aapt permission output before publishing. These checks prevent a missing-permission build from being accepted.

Native runtime diagnostics distinguish an APK that never declared RECORD_AUDIO from a permission the user declined. Missing-declaration builds now explain that an app update is required rather than directing the user to a nonexistent Microphone setting.

## What to do

1. Rebuild this source with the existing Android workflow. For a local clean rebuild, install dependencies, run npx expo prebuild --platform android --clean, then run the existing Gradle APK build. Verify the generated manifest with node scripts/check-recording-permissions.cjs android/app/src/main/AndroidManifest.xml.
2. Install the rebuilt, correctly signed APK as an update to the existing Phone app. A source ZIP cannot update the installed app. Do not uninstall merely to resolve this issue, because that can delete local recordings and app settings.
3. Open Phone → Settings → Call Recording → Microphone Access and allow access. If using Xiaomi Settings directly, inspect this app’s permission list again after the update.
4. Make a test speakerphone call, announce recording, and check playback of both voices.

The app still cannot override Android/OEM restrictions on simultaneous call-audio capture. Restoring microphone permission resolves the missing-permission issue, not universal two-way recording support.

Validation: three configuration/manifest regression tests, missing-declaration runtime-diagnostic tests, repository syntax and scope checks, Android XML/workflow YAML checks, and ZIP integrity. No Expo prebuild, native compilation, packaged-APK inspection or physical Xiaomi test was possible here because the Android build environment/dependencies are unavailable. The new CI checks will verify generated and packaged output when the source is built.

Sources: https://docs.expo.dev/versions/latest/sdk/imagepicker/ and https://docs.expo.dev/versions/latest/sdk/audio/
