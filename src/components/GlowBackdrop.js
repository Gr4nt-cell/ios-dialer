import React from 'react';
import { StyleSheet, View } from 'react-native';
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
        <>
          {/* A warm, balanced dawn field keeps the glass colorful without
              letting the cool blue wash dominate the whole screen. */}
          <LinearGradient
            colors={['#E2F1FF', '#EEEAFE', '#FBE8EE', '#E4F5EF']}
            locations={[0, 0.32, 0.68, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(255,225,199,0.30)', 'transparent']}
            start={{ x: 1, y: 0 }}
            end={{ x: 0.15, y: 0.55 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', 'rgba(255,151,183,0.36)']}
            start={{ x: 0.08, y: 0.35 }}
            end={{ x: 1, y: 0.58 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['rgba(180,160,255,0.28)', 'transparent']}
            start={{ x: 0, y: 1 }}
            end={{ x: 0.72, y: 0.42 }}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={['transparent', 'rgba(105,218,190,0.34)']}
            start={{ x: 0.22, y: 0.5 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
    </View>
  );
}
