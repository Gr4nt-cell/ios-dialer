/** The call screen follows the app's dark palette, regardless of the saved light-mode poster. */
export function callAppearance(theme, choice) {
  const plain = theme.dark || !choice || choice === 'plain' || choice === 'auto';
  const light = !theme.dark && (plain || choice === 'fastscore');
  return {
    plain,
    light,
    background: theme.dark ? theme.bg : '#FFFFFF',
    text: theme.dark ? theme.text : light ? '#22343A' : '#FFFFFF',
    secondary: theme.dark ? theme.secondary : light ? '#53666D' : 'rgba(255,255,255,0.72)',
  };
}
