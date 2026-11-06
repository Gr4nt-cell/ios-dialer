// Four shared images serve independent app and call choices. Dark mode stays black.
export const WALLPAPERS = [
  { id: 'mint', title: 'Mint Lagoon', source: require('../assets/wallpapers-glass/01-mint-lagoon.webp') },
  { id: 'rose', title: 'Rosewater', source: require('../assets/wallpapers-glass/02-rosewater.webp') },
  { id: 'lavender', title: 'Lilac Breeze', source: require('../assets/wallpapers-glass/03-lilac-breeze.webp') },
  { id: 'ocean', title: 'Ocean Pearl', source: require('../assets/wallpapers-glass/05-ocean-pearl.webp') },
];

// The same image files are reused, while app/call selections remain independent.
export const APP_WALLPAPER = WALLPAPERS.find((item) => item.id === 'rose');
export function appBackgroundId(choice) {
  if (WALLPAPERS.some((entry) => entry.id === choice)) return choice;
  return LEGACY_CALL_WALLPAPERS[choice] || 'rose';
}
export function getAppWallpaperSource(dark = false, settings = {}) {
  return dark ? null : getWallpaperSource(settings);
}

export function getWallpaperSource(settings = {}, dark = false) {
  return (WALLPAPERS.find((entry) => entry.id === appBackgroundId(settings.appBackground)) || APP_WALLPAPER).source;
}

// Migrate removed presets so old preferences still select an available background.
const LEGACY_CALL_WALLPAPERS = {
  fastscore: 'ocean', aurora: 'mint', sunset: 'rose', ocean: 'ocean',
  midnight: 'ocean', rose: 'rose', forest: 'mint', lavender: 'lavender',
  ember: 'rose', peach: 'rose', lagoon: 'ocean', cosmic: 'rose', mono: 'ocean',
  mint: 'mint', sage: 'mint', pistachio: 'mint', sunrise: 'rose', coral: 'rose',
  cotton: 'rose', bluebell: 'ocean', pearl: 'ocean',
};

export function callBackgroundId(choice = 'pastel') {
  if (!choice || choice === 'auto' || choice === 'pastel') return 'pastel';
  if (choice === 'plain') return 'plain';
  const id = choice.startsWith('wallpaper:') ? choice.slice(10) : choice;
  const available = WALLPAPERS.some((item) => item.id === id) ? id : LEGACY_CALL_WALLPAPERS[id] || 'rose';
  return `wallpaper:${available}`;
}

export function getCallWallpaperSource(settings = {}, dark = false) {
  if (dark) return null;
  const choice = callBackgroundId(settings.callBackground);
  if (choice === 'plain') return null;
  if (choice === 'pastel') return getAppWallpaperSource(dark, settings);
  return getWallpaperSource({ appBackground: choice.slice(10) }, dark);
}
