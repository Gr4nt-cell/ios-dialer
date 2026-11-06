# Glass design and background update

The bottom dock and tablet rail now use the preview's telephone silhouette, open person outline, nine-dot keypad and outlined search icon. All four are high-resolution, locally bundled alpha masks, tinted by selection/theme. Existing classic-layout icons, badges, tap/drag switching and haptics remain available.

Shared glass uses brighter white borders, restrained mint/blue highlights, translucent fills and softer sage shadows. The active dock lens stays translucent and turns its label/icon blue. Glass settings and the reduced-effects performance mode still apply.

All ten bundled wallpaper choices have been rebuilt as smooth 1280×1920 pastel colour fields. Mint Dream matches the preview's mint-to-pale-sage look. Every family has a matching charcoal dark variant. The app uses a single background image rather than animated neon gradient layers. Gallery photos remain supported and receive a dim overlay in dark mode.

The call screen uses the same material and background family. Pastel/Automatic follows the selected app wallpaper. Other saved call-preset IDs map to corresponding softened wallpaper families, with readable dark text in light mode and white text in dark mode. Plain stays plain. Settings renders the same selected image in its call preview and swatches. Caller photo depth and call controls retain their layout.

The previous search-history grid, Turkish translations and recorder changes are included in this source.

Validation: all 67 JavaScript/JSX files pass the repository syntax checker; the scope checker passes; relative asset references, image dimensions, image decoding and icon alpha masks were checked. Selection checks cover ten wallpaper families, all fifteen call presets in light/dark mode, app-following calls, custom photos and unknown saved-preset fallback. Assets were visually inspected. No Android APK was built and no on-device rendering or call test was performed.

To regenerate the assets for development, run scripts/generate-theme-assets.py with Python, Pillow and NumPy. These are build-time artwork dependencies only. The telephone glyph uses DejaVu Sans; its license is included under assets/fonts/DEJAVU-LICENSE.txt.
