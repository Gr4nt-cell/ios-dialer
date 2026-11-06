/** All call presets use pale pastels in light mode and matching charcoal hues in dark mode. */
export function callAppearance(theme, choice) {
  const pick = choice === 'auto' || !choice ? 'pastel' : choice;
  return {
    plain: pick === 'plain',
    light: !theme.dark,
    background: theme.dark ? theme.backdropBase : '#FFFFFF',
    text: theme.text,
    secondary: theme.secondary,
  };
}
