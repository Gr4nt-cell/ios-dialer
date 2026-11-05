export const WALLPAPERS = [
  { id: 'mint', title: 'Mint Dream', source: require('../assets/dialer-gradient-background.jpg') },
  { id: 'rose', title: 'Rose Glass', source: require('../assets/wallpapers/rose-glass.png') },
  { id: 'lavender', title: 'Lavender Mist', source: require('../assets/wallpapers/lavender-mist.png') },
  { id: 'peach', title: 'Peach Bloom', source: require('../assets/wallpapers/peach-bloom.png') },
  { id: 'ocean', title: 'Ocean Mint', source: require('../assets/wallpapers/ocean-mint.png') },
  { id: 'cotton', title: 'Cotton Candy', source: require('../assets/wallpapers/cotton-candy.png') },
  { id: 'sage', title: 'Soft Sage', source: require('../assets/wallpapers/soft-sage.png') },
  { id: 'sunrise', title: 'Sunrise Glow', source: require('../assets/wallpapers/sunrise-glow.png') },
  { id: 'bluebell', title: 'Bluebell', source: require('../assets/wallpapers/bluebell.png') },
  { id: 'pearl', title: 'Mint Pearl', source: require('../assets/wallpapers/mint-pearl.png') },
];

export function getWallpaperSource(settings = {}) {
  if (settings.appBackground === 'custom' && settings.appBackgroundUri) {
    return { uri: settings.appBackgroundUri };
  }
  return WALLPAPERS.find((wallpaper) => wallpaper.id === settings.appBackground)?.source || WALLPAPERS[0].source;
}
