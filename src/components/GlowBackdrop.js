import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { useData } from '../DataContext';
import { getWallpaperSource } from '../wallpapers';

// One bundled image replaces the old stacked neon gradients. Both themes use
// the selected wallpaper family, with no live blur or decorative animation.
export function GlowBackdrop({ style }) {
  const t = useTheme();
  const { settings } = useData();
  const custom = settings.appBackground === 'custom' && !!settings.appBackgroundUri;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style, { backgroundColor: t.backdropBase }]}>
      <Image source={getWallpaperSource(settings, t.dark)} resizeMode={custom ? 'cover' : 'stretch'} fadeDuration={0} style={StyleSheet.absoluteFill} />
      {t.dark && custom ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,18,15,0.68)' }]} /> : null}
    </View>
  );
}
