import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import * as ExpoBlur from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme';

// Soft-glass material: a milky translucent fill, a delicate neutral rim and
// diffuse depth. Real background blur stays limited to supported surfaces.

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
export const GlassRefractionContext = createContext(null);
// True when the app background is Plain. Glass relies on the colour field
// behind it to show its shape; over flat white or flat black there is nothing
// to refract, so panels need a crisp edge and a shadow to read at all.
export const FlatBackdropContext = createContext(false);

function colorWithOpacity(color, opacity) {
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color || '');
  if (hex) {
    const value = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
    const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
    return `rgba(${channels.join(',')},${opacity})`;
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(color || '');
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${Number(rgb[4] ?? 1) * opacity})`;
  return color;
}

export function GlassRefractionProvider({ children, active = true }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(!!enabled);
      })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => setReduceMotion(!!enabled));
    return () => {
      mounted = false;
      listener.remove();
    };
  }, []);

  const enabled = active && !reduceMotion;
  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!enabled) return undefined;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [enabled, progress]);

  return <GlassRefractionContext.Provider value={enabled ? progress : null}>{children}</GlassRefractionContext.Provider>;
}

/**
 * Edge and shadow that lift a panel off a flat background.
 *
 * `soft` is for a group of small controls — a row of dial keys casting a full
 * panel shadow each reads as far heavier than one shadow under one panel, so
 * they get a shallower one and end up looking like the date strip.
 */
function lift(dark, soft, liquid) {
  // boxShadow, not elevation: Android's elevation shadow is traced from a
  // polygonal approximation of the view's outline, which turned the round keys
  // into decagons. boxShadow follows the border radius exactly, so a circle
  // casts a circle. (React Native 0.76+ on Android.)
  const a = liquid
    ? soft
      ? dark ? 0.19 : 0.09
      : dark ? 0.29 : 0.14
    : soft
      ? dark ? 0.16 : 0.045
      : dark ? 0.26 : 0.075;
  const y = soft ? 2 : 5;
  const blur = soft ? 8 : 18;
  return {
    borderColor: liquid
      ? dark ? 'rgba(220,238,255,0.25)' : 'rgba(104,139,180,0.25)'
      : dark ? 'rgba(220,228,240,0.14)' : 'rgba(80,86,96,0.14)',
    boxShadow: liquid && !dark
      ? `0px ${y}px ${blur}px rgba(56,91,137,${a})`
      : `0px ${y}px ${blur}px rgba(0,0,0,${a})`,
  };
}

function blurProps(target) {
  if (Platform.OS !== 'android') return {};
  if (HAS_TARGET_API) return target ? { blurTarget: target, blurMethod: 'dimezisBlurViewSdk31Plus' } : null;
  return { experimentalBlurMethod: 'dimezisBlurView' };
}

function RefractionSweep({ progress, dark }) {
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const bandWidth = Math.max(28, Math.min(surfaceWidth * 0.44, 156));
  const translateX = useMemo(
    () =>
      surfaceWidth
        ? progress.interpolate({
            inputRange: [0, 1],
            outputRange: [-bandWidth, surfaceWidth + bandWidth],
          })
        : null,
    [bandWidth, progress, surfaceWidth]
  );

  return (
    <View
      pointerEvents="none"
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (Math.abs(nextWidth - surfaceWidth) > 1) setSurfaceWidth(nextWidth);
      }}
      style={StyleSheet.absoluteFill}
    >
      {translateX ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              top: '-30%',
              bottom: '-30%',
              width: bandWidth,
              opacity: dark ? 0.44 : 0.36,
            },
            { transform: [{ translateX }, { rotate: '16deg' }] },
          ]}
        >
          <LinearGradient
            colors={
              dark
                ? ['rgba(255,255,255,0)', 'rgba(188,225,255,0.08)', 'rgba(255,255,255,0.4)', 'rgba(188,225,255,0.1)', 'rgba(255,255,255,0)']
                : ['rgba(255,255,255,0)', 'rgba(115,190,242,0.06)', 'rgba(255,255,255,0.58)', 'rgba(125,204,246,0.14)', 'rgba(255,255,255,0)']
            }
            locations={[0, 0.22, 0.5, 0.76, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
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
  outline = false, // extra edge contrast for floating navigation
  strong = true, // alphabet-bar rim across the app's glass surfaces
  vivid = true, // translucent colour bleed is the shared app-wide surface
  soft = false, // shallower shadow on a flat background, for small repeated controls
  liquid = true, // brighter bevel and cool glass tint across glass surfaces
  fillScale = 1, // thins the fill further, e.g. a button over a photo
}) {
  const t = useTheme();
  const mode = useContext(GlassModeContext);
  const target = useContext(GlassTargetContext);
  const refraction = useContext(GlassRefractionContext);
  const flat = useContext(FlatBackdropContext);
  const dark = forceDark ?? t.dark;
  const plain = mode === 'plain';
  const showRefraction = liquid && !plain && !!refraction;
  // Flat backdrops still get the translucent fill; the stronger rim and shadow
  // keep those surfaces distinct from the white or black behind them.
  const lifted = flat ? lift(dark, soft, liquid && !plain) : null;
  // a lifted panel is opaque, so a live blur behind it would never show
  const bp = blur && !plain && !flat ? blurProps(target) : null;
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
            // no overflow clip here either, for the same outline reason
            backgroundColor: tint || (dark ? t.card : selected ? t.fill : t.card),
            opacity: tint ? tintOpacity : 1,
            borderWidth: flat ? 1 : StyleSheet.hairlineWidth,
            borderColor: t.separator,
            transform: [{ scale: pressed ? 1.02 : 1 }],
            ...(lifted || {}),
          },
          style,
        ]}
      >
        {pressed ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]} />
        ) : null}
        {selected && !tint ? (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)' }]} />
        ) : null}
        {children}
      </View>
    );
  }

  // fill strength: stronger when there's no real blur behind it, and in Tinted mode
  // A soft frosted fill gives controls body without a hard reflective edge.
  // Vivid keeps more of the existing background visible; tinted stays denser.
  // Sheets without a live blur need enough body for their labels to read.
  const alpha = vivid
    ? realBlur
      ? dark ? (tinted ? 0.5 : 0.3) : tinted ? 0.78 : 0.62
      : dark ? (tinted ? 0.8 : 0.65) : tinted ? 0.9 : 0.78
    : dark
    ? realBlur ? (tinted ? 0.74 : 0.56) : tinted ? 0.94 : 0.9
    : realBlur ? (tinted ? 0.88 : 0.76) : tinted ? 0.97 : 0.94;
  // Flat surfaces keep their own faint colour field and rely on the raised rim
  // and shadow for definition, rather than becoming opaque.
  const a = alpha * fillScale;
  const fill = tint
    ? colorWithOpacity(tint, tintOpacity * fillScale * (vivid ? 0.86 : 1))
    : flat
    ? dark ? `rgba(39,42,48,${a})` : `rgba(246,250,255,${a})`
    : dark ? `rgba(38,41,47,${a})` : `rgba(252,253,254,${a})`;
  const rimTop = dark ? 'rgba(255,255,255,0.18)' : liquid ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)';
  const rim = flat
    ? lifted.borderColor
    : liquid
    ? dark ? 'rgba(220,238,255,0.28)' : 'rgba(105,143,185,0.25)'
    : strong
    ? dark ? 'rgba(220,228,240,0.18)' : 'rgba(80,86,96,0.16)'
    : outline
    ? dark ? 'rgba(220,228,240,0.14)' : 'rgba(80,86,96,0.12)'
    : dark ? 'rgba(220,228,240,0.1)' : 'rgba(80,86,96,0.08)';
  const edge = dark ? 'rgba(0,0,0,0.14)' : liquid ? 'rgba(70,102,145,0.075)' : 'rgba(70,78,90,0.018)';
  const highlight = flat
    ? liquid ? dark ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.78)' : dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0)'
    : tint
    ? liquid ? 'rgba(255,255,255,0.34)' : 'rgba(255,255,255,0.14)'
    : vivid
    ? liquid ? dark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' : dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.24)'
    : liquid ? dark ? 'rgba(255,255,255,0.17)' : 'rgba(255,255,255,0.42)' : dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.2)';

  // Android derives an elevation shadow from the view's outline, and a view
  // that also clips its children can hand it a coarse polygon instead of the
  // rounded shape — a circular key then casts a hexagon. So when a shadow is in
  // play the outer view is left plain (background, radius, shadow, nothing
  // else) and the clipping moves to a layer inside it.
  const decoration = (
    <>
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
      <View style={[StyleSheet.absoluteFill, { backgroundColor: lifted ? 'transparent' : fill }]} />
      {/* specular highlight */}
      <LinearGradient
        pointerEvents="none"
        colors={[highlight, 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.55 }}
        style={StyleSheet.absoluteFill}
      />
      {showRefraction ? <RefractionSweep progress={refraction} dark={dark} /> : null}
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
      {/* rim light: bright on top, softer around (on the outer view when lifted) */}
      {lifted ? null : (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: strong || outline ? 1 : StyleSheet.hairlineWidth, borderColor: rim }]} />
      )}
      {flat && !liquid ? null : (
        <LinearGradient
          pointerEvents="none"
          colors={[rimTop, 'rgba(255,255,255,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.12 }}
          style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        />
      )}
    </>
  );

  if (lifted) {
    return (
      <View
        pointerEvents={pointerEvents}
        onLayout={onLayout}
        style={[
          {
            borderRadius: radius,
            backgroundColor: fill,
            borderWidth: 1,
            transform: [{ scale: pressed ? 1.04 : 1 }],
          },
          lifted,
          style,
        ]}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
          {decoration}
        </View>
        {children}
      </View>
    );
  }

  return (
    <View
      pointerEvents={pointerEvents}
      onLayout={onLayout}
      style={[{ borderRadius: radius, overflow: 'hidden', transform: [{ scale: pressed ? 1.04 : 1 }] }, style]}
    >
      {decoration}
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
          shadowColor: '#171B23',
          shadowOpacity: t.dark ? 0.28 : 0.09,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 6 },
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
