> Superseded for caller names by version 1.0.7: the app now bundles neural name
> synthesis; no installed TTS engine is needed. See EMBEDDED_CALLER_SPEECH.md.

# Rosewater, AMOLED and offline announcement voices

The app now uses Rosewater as its only light-mode background. The general background picker and gallery-background control were removed. Old saved app wallpaper settings are overridden on load. Dark-mode app pages use a pure #000000 AMOLED background with no background image or glow.

All twelve call-background choices remain available separately. Follow App uses Rosewater in light mode and plain AMOLED black in dark mode. Explicit call wallpapers remain selectable in both themes. All twelve artwork assets are retained because the call screen still uses them.

## Chinese ROM compatibility

The fixed recording notice no longer uses Android TextToSpeech. It plays a bundled PCM WAV saying “This call is being recorded,” then starts capture only after playback completes and the call is still active, unmuted and on speakerphone. It needs no Google services, speech engine, voice download or internet connection. Cancellation, hangup, mute and route-change cleanup release the player. Media volume must be audible. Playback completion confirms local playback, not that the remote participant heard it.

## Male and female voices

Settings → Call Recording → Voice and Settings → Call Announcer → Voice have independent Female/Male selectors. Both preferences are stored on the phone. The bundled voices were generated with the Kokoro neural speech model: af_heart (female) and am_michael (male), at normal speed. They are synthetic stock voices, not recordings of a real person. Only 26 short 24 kHz mono PCM files are shipped: the recording notice, incoming-call prompts and digits for each voice. Neural model weights and synthesis dependencies are not included in the app, keeping playback inexpensive on low-end devices.

The caller announcer test auditions the selected bundled voice. If no installed offline phone voice is usable, incoming calls use a bundled “Incoming call” prompt, or a spoken unsaved number when enabled. This fallback also handles a stalled engine initialization. Speaking arbitrary contact names still requires an available offline phone speech engine; recorded clip selection does not choose the gender of that external engine. The settings footer explains that distinction. No unknown-caller identity database or Truecaller integration was added.

The announcer continues to respect silent/vibrate mode, DND and lock-screen privacy, and restores ringtone loudness when speech completes or stops.

## Validation and limits

Validated all 26 WAV headers, rates, channel counts, durations and non-silent amplitudes; native raw-resource references; absence of a TTS dependency in RecordingService; independent call-background selection and fixed app background; JavaScript syntax/scope checks; microphone configuration regression tests; and ZIP integrity. The two MP3 samples are exported from the same recording-notice clips used by the app.

No Android build, device playback, caller-name speech, Xiaomi call capture or frame-rate test was performed here. This source must be rebuilt and installed. Restoring the announcement does not override firmware restrictions on recording both sides of calls.

Audio generation source and dependency details are in scripts/generate-announcement-audio.py and assets/licenses/KOKORO_AUDIO.md. The generator is development-only; the app itself plays the bundled WAVs.
