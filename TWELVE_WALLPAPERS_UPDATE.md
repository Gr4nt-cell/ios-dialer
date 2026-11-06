# Twelve wallpapers and Settings layout repair

Twelve new background images are embedded in assets/wallpapers-glass, replacing the previous ten choices. They were created with image generation using the supplied screenshot only as a reference for its soft, blurred, luminous background. The wallpapers contain no UI, contact photos, icons or text.

The choices are Mint Lagoon, Rosewater, Lilac Breeze, Peach Sorbet, Ocean Pearl, Pistachio Glow, Coral Dawn, Pink Opal, Sage Silk, Golden Hour, Aqua Frost and Prism Dream. Generation prompts are saved alongside the images. All art is offline and uses existing image-rendering dependencies.

Settings → Background chooses the app wallpaper. Settings → Call Background includes the same twelve artworks plus Follow App and Plain controls. Previously saved background IDs remain supported. Gallery photos still work. Dark mode renders the selected wallpaper with a static dim layer instead of bundling a second large bitmap. Both phone and tablet layouts use the same soft artwork.

The Settings overflow shown in the screenshot has been addressed with a shared WallpaperGrid. It measures its actual container, fits 2/3/4/6 columns according to available width, and puts every bitmap inside an explicitly sized, rounded clipping viewport. Original image dimensions can no longer determine the tile size or paint over neighbouring options. Labels remain below the image. The same bounded component is used for the app and call-background pickers.

The Optimized/Performance selector has been removed. Old saved profile values are ignored and dropped from loaded settings. There is one automatically adaptive renderer: low-end devices use a compact static glass sheen, lighter shadows, smaller list batches and no decorative caller-avatar pulse. Other devices keep the richer static glass finish. Live refraction remains removed everywhere. No frame-rate result is claimed without device measurement.

The microphone permission build fix, incoming-call announcer, Turkish translations and full-name search-history fixes are included.

Validation: twelve distinct asset references, bitmap decoding, app/call selection for every wallpaper, saved-preset compatibility, custom-photo handling, grid fitting at ten widths, automatic device budgets, microphone-permission regression tests, repository JavaScript syntax/scope checks and ZIP integrity. Native Android rendering, frame rate and recording/speech still require building and testing on a physical phone. No APK was built here.
