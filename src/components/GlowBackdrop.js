import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

// Ambient color field from the liquid-glass source. Panels remain translucent
// so this background shows through them.
export function GlowBackdrop({ style }) {
  const t = useTheme();
  const [a, b, c] = t.glow;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style, { backgroundColor: t.backdropBase }]}>
      {t.dark ? (
        <>
          <LinearGradient
            colors={t.backdrop}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient colors={[a, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 0.75, y: 0.55 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', b]} start={{ x: 0.2, y: 0.3 }} end={{ x: 1, y: 0.75 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', c]} start={{ x: 0.7, y: 0.45 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
        </>
      ) : (
        <Image
          source={require('../../assets/soft-pastel-background.jpg')}
          // Stretch the viewport-relative color fields instead of cropping them.
          resizeMode="stretch"
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}
