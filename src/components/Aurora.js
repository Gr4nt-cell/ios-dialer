import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

// Soft colour field behind every screen. The glass material blurs whatever sits
// behind it, so without this there is nothing for it to refract — flat white or
// flat black reads as frosted plastic rather than glass.
//
// Built only from expo-linear-gradient (already a dependency): full-bleed
// washes fading to transparent, so there are no hard edges and no extra
// native module on the launch path.

const LIGHT = {
  base: ['#E9EFFF', '#F4F0FF', '#FFF2F8'],
  washes: [
    { c: '126,174,255', a: 0.55, start: { x: 1, y: 0 }, end: { x: 0.1, y: 0.8 } },
    { c: '255,166,203', a: 0.45, start: { x: 0, y: 0.25 }, end: { x: 0.9, y: 1 } },
    { c: '181,144,255', a: 0.4, start: { x: 1, y: 1 }, end: { x: 0.2, y: 0.15 } },
    { c: '146,242,210', a: 0.35, start: { x: 0, y: 1 }, end: { x: 0.8, y: 0.2 } },
  ],
};

const DARK = {
  base: ['#0B1020', '#120F22', '#180F1C'],
  washes: [
    { c: '46,107,255', a: 0.38, start: { x: 1, y: 0 }, end: { x: 0.1, y: 0.8 } },
    { c: '255,77,147', a: 0.24, start: { x: 0, y: 0.25 }, end: { x: 0.9, y: 1 } },
    { c: '123,75,255', a: 0.3, start: { x: 1, y: 1 }, end: { x: 0.2, y: 0.15 } },
    { c: '31,191,155', a: 0.2, start: { x: 0, y: 1 }, end: { x: 0.8, y: 0.2 } },
  ],
};

export default function Aurora({ variant = 'default' }) {
  const t = useTheme();
  const p = t.dark ? DARK : LIGHT;
  // Pushed screens sit a little calmer than the tab screens.
  const damp = variant === 'sheet' ? 0.65 : 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={p.base}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {p.washes.map((w, i) => (
        <LinearGradient
          key={i}
          colors={[
            `rgba(${w.c},${(w.a * damp).toFixed(3)})`,
            `rgba(${w.c},${(w.a * damp * 0.35).toFixed(3)})`,
            `rgba(${w.c},0)`,
          ]}
          locations={[0, 0.35, 0.72]}
          start={w.start}
          end={w.end}
          style={StyleSheet.absoluteFill}
        />
      ))}
    </View>
  );
}
