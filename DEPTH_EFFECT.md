# Reference call portrait and photo quality

Applied to the supplied `ios-dialer-main.zip` source, preserving its current app structure, native call handlers, tablet dial-pad layout, themes, privacy controls, translations and release optimization configuration.

## Depth settings

Open **Settings → Call Screen → Adjust Depth & Live Preview**. The live preview stays visible above the scrollable controls. Changes save automatically. Adjust portrait size, vertical and horizontal placement, bottom fade, name size and name placement. Restore reference look resets the composition and selects Pastel. Existing Sprout, Size and position controls also adjust this same renderer; their stored preferences are translated rather than discarded.

The base portrait is 10% smaller and sits 2% of the screen height higher than the previous build (about 15 points on a 760-point call panel). Existing saved size and position adjustments remain relative to this revised base.

The shared portrait renderer paints the caller's name first and the transparent subject afterward. The subject has no circular frame. Its shoulders fade smoothly into the existing call background. The decorative layer passes all touches through to the original call controls. Tablet portrait sizing stays bounded to a portrait-shaped frame so it does not spill across the keypad column.

## Highest available photo detail

- Prefer the Contacts provider's full-size display-photo file, with its unique photo file ID, ahead of thumbnail images. A replacement photo gets a new URI and invalidates the old cutout cache.
- Decode original photo RGB separately from subject detection. The old 1,200-pixel cap is no longer a cap on the displayed portrait.
- Detect the subject using a smaller mask, then apply only its alpha to the separately decoded original RGB. Do not enlarge the segmenter's small RGB image.
- Save the resulting cropped portrait as lossless PNG. Disable Android's image-view thumbnail resizing on the large portrait and its photo fallback.
- Avoid upscaling small originals. Very large originals are limited by current device memory, a 24-megapixel processing budget and an 8,192-pixel maximum dimension. These are safety ceilings, not an assertion that every device can process an 8K photo. Full-resolution compositing is serialized to limit concurrent bitmap allocations.
- The model's first use can require a Google Play Services download. While it downloads, the hook retries every five seconds for up to one minute, then shows a photo fallback with a useful status. Model failures and photos without a subject use the original photo fallback. No missing detail can be recovered when the contact provider only has a small original.

Cached detection masks are reused for fade changes. Rendering requests are debounced, duplicate requests are shared, and the JavaScript result cache is bounded. Cutouts are written atomically. A caller's old portrait is hidden while a different photo is being prepared.

## Validation

All 64 JavaScript files passed syntax parsing. Renderer checks covered settings translation, range bounds, default portrait geometry, name overlap and touch passthrough. A hook test verified the full-resolution request, model-download retry, successful retry result and protection against showing a previous caller’s portrait. Android ARM64 release build succeeded (711 tasks), including native Kotlin compilation, Metro/Hermes bundling and the source’s R8 release shrinking. APK signature, ZIP integrity, manifest, embedded Hermes bundle and ARM64 libraries were verified. Real phone telephony, segmentation edge quality and memory behavior still require device testing.

## Rebuilding

Use a full JDK 17 with `javac`, install dependencies with `npm ci`, then run `npx expo prebuild --platform android --no-install`. From `android`, run `./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a`. The uploaded source's release shrinking and native keep rules are retained. A native rebuild is required because the depth bridge now accepts the fade parameter.
