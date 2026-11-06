# Smaller bundle — version 1.0.9 (Android version code 10)

Four app backgrounds and four call backgrounds: Rosewater, Mint Lagoon, Lilac
Breeze, and Ocean Pearl. Both selectors share the same four physical image files,
so there are no duplicated assets. App and call choices are saved independently;
Use App Background can optionally link them. Saved app choices persist across
restarts. Both canvases always use AMOLED black in dark mode. Existing removed
wallpaper preferences migrate to the closest available choice.

## Removed and reduced

- Removed eight wallpaper presets and their PNG files. The four retained images
  are 720×1080 WebP files, about 40 KB combined, versus 17.6 MB for the previous
  twelve PNGs. Original colour-image RMSE after resizing/encoding was below 1.3
  levels on the 0–255 scale for each retained wallpaper.
- Removed unused soft-pastel and file-explorer JPG backgrounds, generation-job
  metadata and four superseded change-note files.
- Removed 112 non-English dictionaries (17.1 MB) from the English-only caller
  phonemizer. The English dictionary, shared phonetic data, voice definitions,
  neural model, and both selected speakers remain. This does not change app UI
  language support. Caller-name speech still uses English pronunciation.
- Versioned the extracted speech directory, with old extraction cleanup on the
  background worker at app startup and before model loading. Updates therefore
  do not keep the larger old model/data directory indefinitely.
- Explicitly enable WebP decoding in generated Android builds. Existing R8
  minification remains enabled. Keep all runtime architectures, recording code,
  MP3 encoding, caller voices, permissions, contact-depth preview and controls.

The uncompressed wallpaper and speech assets are reduced from 58,074,956 bytes
to 23,417,404 bytes: 34,657,552 bytes removed (about 33 MiB, 60%). This is an
asset-payload measurement, not a measured APK-size claim. APK compression and
ABI splits affect the final download size. The full ARM64 release-build result
is recorded below.

Required third-party licenses and corresponding source archives are retained.
The archives are development/source-distribution material and are not referenced
as runtime Metro assets. Removing them would shrink the source ZIP, not the
working APK. The offline voice model remains the largest necessary asset.

## Validation

- Both embedded speakers generated non-silent speech with the trimmed data for
  Stephen, Gloria, Kwame, Esther Sarfoa, Dr Bekui and Çağrı.
- Native speech/recording classes compile with the Android API 35 and real
  bundled dependencies, using app collaborator stubs (not a full APK build).
- JavaScript syntax/scope checks and seven regression tests pass, including
  independent app/call selection, follow-app, migration and AMOLED-black cases.
- Four WebP files decode at the intended size. Image/font/audio require paths
  are checked against the packaged source.

The existing native player, M4A/MP3 recording options and three caller-announcement
repeats remain. A rebuilt APK still needs testing on the Xiaomi.

## Continued bundle cleanup

The actual Android Metro export exposed a further 18 unused font files pulled in
by the vector-icon package's root import. All 24 app imports now address Ionicons
directly. The required Ionicons and call-reference fonts are preserved.

Measured using identical Android exports (`expo export --platform android
--no-bytecode`):

| Exported item | Before direct imports | After direct imports |
| --- | ---: | ---: |
| Font files | 20 | 2 |
| Font bytes | 4,088,568 | 401,452 |
| All Metro asset bytes | 4,235,652 | 548,536 |
| JavaScript bundle bytes | 1,820,057 | 1,390,553 |

This removes 3,687,116 font bytes plus 429,504 JavaScript bytes before APK
compression. The source ZIP barely changes because npm's dependency folder was
never included in it; this improvement targets the built app.

`scripts/check-export-budget.cjs` validates the actual export's font, background,
Metro-asset and native speech budgets. Both APK and AAB workflows now run that
check and all seven background/permission tests. The previous export fails the
font/asset guard; the optimized export passes. Native Android prebuild and the
generated microphone manifest check also pass.

The version 1.0.10 clean-build check also found that a library-scoped Maven
repository is not sufficient for the app's transitive speech AAR dependency.
`plugins/withOfflineSpeechRepository.js` registers an exclusive local repository
for that dependency group in the generated root Android project. It does not
fetch an alternative runtime from public repositories. The plugin is idempotent
and runs before the final microphone-permission repair plugin.

## Completed native release verification — 1.0.10 / version code 11

`assembleRelease -PreactNativeArchitectures=arm64-v8a` completed successfully:
651 Gradle tasks, including the complete native recording/announcer modules and
R8 shrinking. The APK is 62,017,697 bytes (62.0 MB / 59.1 MiB), targeting Android
API 36 with minimum API 24. No prior full APK was measured for a like-for-like
size comparison.

Packaged APK checks passed: signature verification, 16 KiB ZIP alignment, all 16
ARM64 native libraries' ELF alignment, microphone/foreground-service permissions,
absence of INTERNET and advertising-ID permissions, four wallpaper content
hashes, the required icon/reference fonts, English-only phonemizer dictionary,
and the unchanged neural-model checksum. The project's release-readiness script
passes; its advisory platform-library edge-to-edge references remain.

The supplied APK uses the generated Android Debug certificate for testing.
Updating an existing release-signed installation requires the existing release
signing key. Do not uninstall an existing app to bypass a signing conflict when
its private recordings still need to be retained. The source workflows use the
user's configured signing secrets for release updates.

Actual calls, saved-recording playback and caller announcement still require
phone testing; this workspace verification does not claim a Xiaomi device test.
