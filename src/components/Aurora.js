import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme';

// Soft colour field behind every screen. The glass material blurs whatever sits
// behind it, so without this there is nothing for it to refract — flat white or
// flat black reads as frosted plastic rather than glass.

const LIGHT = {
  base: ['#E9EFFF', '#F4F0FF', '#FFF2F8'],
  orbs: [
    { c: '#7FAEFF', o: 0.75, x: 0.86, y: 0.06, r: 0.62 },
    { c: '#FFA6CB', o: 0.62, x: 0.06, y: 0.3, r: 0.52 },
    { c: '#B590FF', o: 0.5, x: 0.95, y: 0.6, r: 0.55 },
    { c: '#92F2D2', o: 0.55, x: 0.02, y: 0.84, r: 0.5 },
  ],
};

const DARK = {
  base: ['#0B1020', '#120F22', '#180F1C'],
  orbs: [
    { c: '#2E6BFF', o: 0.42, x: 0.86, y: 0.06, r: 0.62 },
    { c: '#FF4D93', o: 0.3, x: 0.06, y: 0.3, r: 0.52 },
    { c: '#7B4BFF', o: 0.34, x: 0.95, y: 0.6, r: 0.55 },
    { c: '#1FBF9B', o: 0.26, x: 0.02, y: 0.84, r: 0.5 },
  ],
};

export default function Aurora({ variant = 'default' }) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const p = t.dark ? DARK : LIGHT;

  // Pushed screens (contact, settings…) sit a little calmer than the tab screens.
  const damp = variant === 'sheet' ? 0.6 : 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={p.base} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {p.orbs.map((orb, i) => (
            <RadialGradient key={i} id={`aurora${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={orb.c} stopOpacity={orb.o * damp} />
              <Stop offset="1" stopColor={orb.c} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {p.orbs.map((orb, i) => (
          <Circle
            key={i}
            cx={orb.x * width}
            cy={orb.y * height}
            r={orb.r * width}
            fill={`url(#aurora${i})`}
          />
        ))}
      </Svg>
    </View>
  );
}
