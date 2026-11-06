// Twelve bundled AI-created soft-colour wallpapers. Dark mode dims the same art at render time.
export const WALLPAPERS = [
  { id: 'mint', title: 'Mint Lagoon', source: require('../assets/wallpapers-glass/01-mint-lagoon.png'), darkSource: require('../assets/wallpapers-glass/01-mint-lagoon.png') },
  { id: 'rose', title: 'Rosewater', source: require('../assets/wallpapers-glass/02-rosewater.png'), darkSource: require('../assets/wallpapers-glass/02-rosewater.png') },
  { id: 'lavender', title: 'Lilac Breeze', source: require('../assets/wallpapers-glass/03-lilac-breeze.png'), darkSource: require('../assets/wallpapers-glass/03-lilac-breeze.png') },
  { id: 'peach', title: 'Peach Sorbet', source: require('../assets/wallpapers-glass/04-peach-sorbet.png'), darkSource: require('../assets/wallpapers-glass/04-peach-sorbet.png') },
  { id: 'ocean', title: 'Ocean Pearl', source: require('../assets/wallpapers-glass/05-ocean-pearl.png'), darkSource: require('../assets/wallpapers-glass/05-ocean-pearl.png') },
  { id: 'pistachio', title: 'Pistachio Glow', source: require('../assets/wallpapers-glass/06-pistachio-glow.png'), darkSource: require('../assets/wallpapers-glass/06-pistachio-glow.png') },
  { id: 'coral', title: 'Coral Dawn', source: require('../assets/wallpapers-glass/07-coral-dawn.png'), darkSource: require('../assets/wallpapers-glass/07-coral-dawn.png') },
  { id: 'cotton', title: 'Pink Opal', source: require('../assets/wallpapers-glass/08-pink-opal.png'), darkSource: require('../assets/wallpapers-glass/08-pink-opal.png') },
  { id: 'sage', title: 'Sage Silk', source: require('../assets/wallpapers-glass/09-sage-silk.png'), darkSource: require('../assets/wallpapers-glass/09-sage-silk.png') },
  { id: 'sunrise', title: 'Golden Hour', source: require('../assets/wallpapers-glass/10-golden-hour.png'), darkSource: require('../assets/wallpapers-glass/10-golden-hour.png') },
  { id: 'bluebell', title: 'Aqua Frost', source: require('../assets/wallpapers-glass/11-aqua-frost.png'), darkSource: require('../assets/wallpapers-glass/11-aqua-frost.png') },
  { id: 'pearl', title: 'Prism Dream', source: require('../assets/wallpapers-glass/12-prism-dream.png'), darkSource: require('../assets/wallpapers-glass/12-prism-dream.png') },
 ];

export function getWallpaperSource(settings = {}, dark = false) {
  if (settings.appBackground === 'custom' && settings.appBackgroundUri) return { uri: settings.appBackgroundUri };
  const wallpaper = WALLPAPERS.find((entry) => entry.id === settings.appBackground) || WALLPAPERS[0];
  return wallpaper.source;
}

const LEGACY_CALL_WALLPAPERS = {
  fastscore: 'ocean', aurora: 'mint', sunset: 'sunrise', ocean: 'ocean',
  midnight: 'bluebell', rose: 'rose', forest: 'sage', lavender: 'lavender',
  ember: 'coral', peach: 'peach', lagoon: 'ocean', cosmic: 'cotton', mono: 'pearl',
};

export function callBackgroundId(choice = 'pastel') {
  if (!choice || choice === 'auto' || choice === 'pastel') return 'pastel';
  if (choice === 'plain') return 'plain';
  if (choice.startsWith('wallpaper:') && WALLPAPERS.some((item) => item.id === choice.slice(10))) return choice;
  return `wallpaper:${LEGACY_CALL_WALLPAPERS[choice] || 'mint'}`;
}

export function getCallWallpaperSource(settings = {}, dark = false) {
  const choice = callBackgroundId(settings.callBackground);
  if (choice === 'plain') return null;
  if (choice === 'pastel') return getWallpaperSource(settings, dark);
  return getWallpaperSource({ appBackground: choice.slice(10) }, dark);
}
