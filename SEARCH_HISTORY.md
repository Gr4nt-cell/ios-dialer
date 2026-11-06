# Search history and Turkish language update

Search keeps up to nine recent unique queries across app restarts. The most recent query appears first in a three-row, three-column grid directly below the search bar. Entries use the existing liquid-glass component with rounded rectangular edges, translucent fill, highlights and press feedback. Empty positions reserve columns; no fake search entries are added.

Tap an entry to search again and move it to the newest position. Use Clear to erase history. Searches are committed on keyboard submission, field blur, clearing the query, selecting a result, and leaving the Search screen. The app does not record every intermediate keystroke. Matching ignores letter case and collapses whitespace.

History is saved only on this device using the app's existing AsyncStorage dependency. Writes are serialized; actions made before loading finishes are replayed against the loaded history.

Turkish (Türkçe) is available in the existing language picker and automatically selected for Turkish device locales when language is System. All 191 shared catalog entries have Turkish translations, including search-history controls and recording button states. Existing hardcoded English text outside the translation catalog, including native recorder errors, remains English. The spoken recording announcement remains the exact requested English phrase.

Validation: JavaScript/JSX parsing; nine-item eviction, newest-first ordering, deduplication, whitespace handling and malformed stored-data checks; complete Turkish catalog coverage. Android runtime UI and device recordings have not been tested here. The supplied PNG is a design preview with sample searches, not a screenshot from a running Android build.
