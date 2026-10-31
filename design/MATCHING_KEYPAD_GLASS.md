# Match the light keypad material

`KeypadGlass` in `src/components/Glass.js` now owns the numeric keypad's existing material. The keypad is visually unchanged. Photo-free light contact/favorite cards and light-background in-call buttons reuse it rather than approximating it with separate settings.

- Neutral fill: the theme's existing `key` tint at opacity 0.28 (effective tint alpha 0.2408 with Glass's existing vivid factor). Existing white rim, sheen/refraction and soft depth are retained. Text/icons keep full opacity.
- Photo-free light cards remove their additional white gradients, sheen and dark label shade. Initials and labels use readable theme colors over the shared transparent surface.
- All 13 pressable call surfaces reuse `CallControlGlass`, including round controls, minimize, small pills, SIM choices, call-waiting actions and phone/tablet DTMF buttons. Light controls override the plain-call backdrop's heavier lifted material and per-control fill scaling so neutral surfaces match the keypad. Answer/end keep their red/green tint and use the colored keypad action's tint opacity.
- Photo cards, non-glass cards, dark mode and deliberately dark call backgrounds preserve their previous rendering. No icon shapes, dimensions, action handlers, call logic or native modules changed. No new dependencies or live blur targets.

## Verification

- All 51 JavaScript/JSX source files pass `scripts/check-syntax.cjs`.
- `git diff --check` passes.
- A temporary renderer using mocked React Native primitives compared 516 combinations covering dark/photo/non-glass cards and dark/dark-backdrop call controls with the base revision. Output matched. The numeric keypad output also matched in clear/tinted/plain modes and both themes.
- Neutral light call material equals the shared keypad material with either flat or gradient backdrop contexts.
- Consumer event handlers are byte-identical to the base revision.
- No Android device or APK runtime testing was performed for this change.

## Figma and publishing

Figma reference: https://www.figma.com/design/s5Vt3iKEuQR68XXEtXy20B
Figma's current seat tool limit prevented canvas edits. `figma-matching-keypad-glass.js` creates an editable comparison page when run with Scripter in that file. It reuses the original keypad component (ID 3:106, validated by name/type at runtime), preserving the reference material, and imports Ionicons SVGs. The script passes JavaScript module syntax validation but has not been executed in Figma.

GitHub branch creation returned HTTP 403 (Resource not accessible by integration). The changes are prepared locally and have not been published.
