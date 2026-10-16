import React, { createContext, useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as ExpoBlur from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

// Liquid-glass style material: real background blur where Android supports it,
// a translucent fill, a bright specular rim on top and a darker lower edge.

const { BlurView } = ExpoBlur;
// Newer expo-blur (SDK 55+) blurs a BlurTargetView; SDK 54 uses experimentalBlurMethod.
export const BlurTargetView = ExpoBlur.BlurTargetView || View;
const HAS_TARGET_API = !!ExpoBlur.BlurTargetView;

/**
 * Real background blur costs a live snapshot of the view behind each surface,
 * and stacking too many of them has crashed this app before. These are the
 * surfaces allowed to use it: at most a few per screen, never inside a list.
 * Flip this to false to fall back to the translucent fill everywhere but the
 * tab bar.
 *
 * Off: three live blurs on the Calls tab (tab bar, date strip, Statistics
 * pill) took the app down on device. The tab bar keeps the only real blur;
 * the rest get the vivid translucent fill below, which costs nothing.
 */
export const EXTENDED_BLUR = false;

export const GlassTargetContext = createContext(null);
export const GlassModeContext = createContext('clear'); // 'clear' | 'tinted' | 'plain'

function blurProps(target) {
  if (Platform.OS !== 'android') return {};
  if (HAS_TARGET_API) return target ? { blurTarget: target, blurMethod: 'dimezisBlurViewSdk31Plus' } : null;
  return { experimentalBlurMethod: 'dimezisBlurView' };
}

export function Glass({
  children,
  style,
  radius = 999,
  blur = false,
  tint, // optional colour, e.g. green call button
  tintOpacity = 0.85,
  pressed = false,
  selected = false,
  dark: forceDark,
  intensity = 60,
  pointerEvents,
  onLayout,
  outline = false, // stronger edge, e.g. the floating tab bar
  strong = false, // clearly visible edge, e.g. the date strip and letter panel
  vivid = false, // wide blur that lets the colour behind bleed through (tab bar)
}) {
  const t = useTheme();
  const mode = useContext(GlassModeContext);
  const target = useContext(GlassTargetContext);
  const dark = forceDark ?? t.dark;
  const plain = mode === 'plain';
  const bp = blur && !plain ? blurProps(target) : null;
  const realBlur = !!bp;
  const tinted = mode === 'tinted';

  // Liquid Glass turned off: a solid card with a hairline edge, and none of
  // the blur, washes or specular highlights.
  if (plain) {
    return (
      <View
        pointerEvents={pointerEvents}
        onLayout={onLayout}
        style={[
          {
            borderRadius: radius,
            overflow: 'hidden',
            backgroundColor: tint || (dark ? t.card : selected ? t.fill : t.card),
            opacity: tint ? tintOpacity : 1,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.separator,
            transform: [{ scale: pressed ? 1.02 : 1 }],
          },
          style,
        ]}
      >
        {pressed ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]} />
        ) : null}
        {selected && !tint ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]} />
        ) : null}
        {children}
      </View>
    );
  }

  // fill strength: stronger when there's no real blur behind it, and in Tinted mode
  // Light mode is kept very clear (mostly see-through, defined by its rim);
  // dark mode needs a little more body to read on black.
  // "vivid" keeps the fill barely there so the blurred colour stays saturated
  // instead of being washed out by a milky layer.
  // Without real blur, "vivid" still stays well clear of the milky default so
  // the colour of the background washes keeps coming through.
  const alpha = vivid
    ? realBlur
      ? dark ? (tinted ? 0.34 : 0.14) : tinted ? 0.3 : 0.08
      : dark ? (tinted ? 0.66 : 0.38) : tinted ? 0.58 : 0.2
    : dark
    ? realBlur ? (tinted ? 0.62 : 0.3) : tinted ? 0.86 : 0.58
    : realBlur ? (tinted ? 0.55 : 0.18) : tinted ? 0.72 : 0.32;
  const fill = tint ? tint : dark ? `rgba(44,44,48,${alpha})` : `rgba(255,255,255,${alpha})`;
  const rimTop = dark ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.9)';
  const rim = strong
    ? dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.24)'
    : outline
    ? dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.16)'
    : dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const edge = dark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.04)';
  const highlight = tint
    ? 'rgba(255,255,255,0.3)'
    : vivid
    ? dark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)'
    : dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.45)';

  return (
    <View
      pointerEvents={pointerEvents}
      onLayout={onLayout}
      style={[
        { borderRadius: radius, overflow: 'hidden', transform: [{ scale: pressed ? 1.04 : 1 }] },
        style,
      ]}
    >
      {realBlur ? (
        <BlurView
          {...bp}
          intensity={intensity}
          // the material tints add a heavy desaturated wash; the plain ones
          // keep the colour behind the glass
          tint={vivid ? (dark ? 'dark' : 'light') : dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: fill, opacity: tint ? tintOpacity : 1 }]} />
      {/* specular highlight */}
      <LinearGradient
        pointerEvents="none"
        colors={[highlight, 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      {/* darker lower edge for depth */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0)', edge]}
        start={{ x: 0.5, y: 0.55 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {selected ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)' }]} /> : null}
      {pressed ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.5)' }]} /> : null}
      {/* rim light: bright on top, softer around */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: strong ? 1.6 : outline ? 1.2 : StyleSheet.hairlineWidth * 2, borderColor: rim }]} />
      <LinearGradient
        pointerEvents="none"
        colors={[rimTop, 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.12 }}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
      {children}
    </View>
  );
}

// Soft drop shadow wrapper (kept outside the clipped glass so it isn't cut off).
export function GlassShadow({ children, style, radius = 999 }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          borderRadius: radius,
          shadowColor: '#000',
          shadowOpacity: t.dark ? 0.5 : 0.14,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
