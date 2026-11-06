import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import { useData } from '../DataContext';
import { getAppWallpaperSource } from '../wallpapers';

// One of four compressed wallpapers in light mode; unlit black in dark mode.
export function GlowBackdrop({ style }) {
  const t = useTheme();
  const { settings } = useData();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style, { backgroundColor: t.dark ? '#000000' : t.backdropBase }]}>
      {!t.dark ? <Image source={getAppWallpaperSource(false, settings)} resizeMode="stretch" fadeDuration={0} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}
