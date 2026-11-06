export const WALLPAPERS = [
  { id: 'mint', title: 'Mint Dream', source: require('../assets/dialer-gradient-background.jpg'), darkSource: require('../assets/wallpapers/mint-dark.jpg') },
  { id: 'rose', title: 'Rose Glass', source: require('../assets/wallpapers/rose-glass.png'), darkSource: require('../assets/wallpapers/rose-glass-dark.jpg') },
  { id: 'lavender', title: 'Lavender Mist', source: require('../assets/wallpapers/lavender-mist.png'), darkSource: require('../assets/wallpapers/lavender-mist-dark.jpg') },
  { id: 'peach', title: 'Peach Bloom', source: require('../assets/wallpapers/peach-bloom.png'), darkSource: require('../assets/wallpapers/peach-bloom-dark.jpg') },
  { id: 'ocean', title: 'Ocean Mint', source: require('../assets/wallpapers/ocean-mint.png'), darkSource: require('../assets/wallpapers/ocean-mint-dark.jpg') },
  { id: 'cotton', title: 'Cotton Candy', source: require('../assets/wallpapers/cotton-candy.png'), darkSource: require('../assets/wallpapers/cotton-candy-dark.jpg') },
  { id: 'sage', title: 'Soft Sage', source: require('../assets/wallpapers/soft-sage.png'), darkSource: require('../assets/wallpapers/soft-sage-dark.jpg') },
  { id: 'sunrise', title: 'Sunrise Glow', source: require('../assets/wallpapers/sunrise-glow.png'), darkSource: require('../assets/wallpapers/sunrise-glow-dark.jpg') },
  { id: 'bluebell', title: 'Bluebell', source: require('../assets/wallpapers/bluebell.png'), darkSource: require('../assets/wallpapers/bluebell-dark.jpg') },
  { id: 'pearl', title: 'Mint Pearl', source: require('../assets/wallpapers/mint-pearl.png'), darkSource: require('../assets/wallpapers/mint-pearl-dark.jpg') },
];

export function getWallpaperSource(settings = {}, dark = false) {
  if (settings.appBackground === 'custom' && settings.appBackgroundUri) {
    return { uri: settings.appBackgroundUri };
  }
  const wallpaper = WALLPAPERS.find((entry) => entry.id === settings.appBackground) || WALLPAPERS[0];
  return dark ? wallpaper.darkSource : wallpaper.source;
}

// Retain saved preset IDs while giving every call background the same soft finish.
const CALL_WALLPAPERS = {
  fastscore: 'ocean', aurora: 'mint', sunset: 'sunrise', ocean: 'ocean',
  midnight: 'bluebell', rose: 'rose', forest: 'sage', lavender: 'lavender',
  ember: 'peach', peach: 'peach', lagoon: 'ocean', cosmic: 'cotton', mono: 'pearl',
};

export function getCallWallpaperSource(settings = {}, dark = false) {
  const choice = settings.callBackground || 'pastel';
  if (choice === 'plain') return null;
  if (choice === 'pastel' || choice === 'auto') return getWallpaperSource(settings, dark);
  const appBackground = CALL_WALLPAPERS[choice] || 'mint';
  return getWallpaperSource({ appBackground }, dark);
}
