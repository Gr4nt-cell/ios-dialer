/** Light wallpaper presets; every dark call stays AMOLED black. */
export function callAppearance(theme, choice) {
  const pick = choice === 'auto' || !choice ? 'pastel' : choice;
  return {
    plain: theme.dark || pick === 'plain',
    light: !theme.dark,
    background: theme.dark ? '#000000' : '#FFFFFF',
    text: theme.text,
    secondary: theme.secondary,
  };
}
