# Call controls from the supplied screenshot

The active call controls use a dedicated lightweight surface and a bundled vector font to reproduce the reference. No network font loading, platform emoji, generic replacement icons or added native dependencies are required.

| Control | Reference symbol |
| --- | --- |
| Contact | Outlined pawn (`♙`) |
| Message | Horizontally lined square (`▤`) |
| Record | Disc with outer ring (`◉`) |
| Speaker | Filled half-disc and parenthesis (`◖)`) |
| Hold | Narrow double bar (`Ⅱ`) |
| Mute | Single musical note (`♩`) |
| Add Call | Plus (`+`) |
| End | Full telephone (`☎`), rotated 135 degrees |
| Keypad | Two columns of three square dots (`⠿`) |

Geometry: 72-point circles, 108-point column centres, 110-point row pitch, 13-point labels with a 7-point gap, and a 102-by-72-point red End key with 26-point corners. Normal surfaces use 20% translucent white, a 45% white 1-point rim and the reference's soft shadow. Light-mode icon and label ink is `#20363B`. The collapse button uses the same translucent treatment and the reference's white chevron.

Active/disabled feedback, labels, accessibility and all original action callbacks are retained. Bluetooth, headset, Resume and Merge continue using the source's meaningful state-specific icons. Dark mode uses white ink for readability.

The font contains scalable outlines from Nimbus Sans and DejaVu Sans. License notices are included beside the font. `design/build-reference-call-font.py` rebuilds the committed font from those source fonts, but Python is not needed to build the Android app.

Validation: all 65 JavaScript files parsed successfully, the 11 CallButton/EndKey call-site handlers were compared with the uploaded source and are unchanged, and the committed font was loaded and rendered for a visual comparison of all nine controls. Android device rendering was not tested in this workspace.
