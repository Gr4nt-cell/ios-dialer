import React, { useMemo, useRef } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import { gradientFor } from '../gradients';
import { initials } from '../phone';
import { depthTransform, useDepth } from '../depth';

const W = 156;
const H = 290;
const REFERENCE_WIDTH = 400; // the offsets are tuned against a real screen

/**
 * Miniature of the call screen showing how far the cut-out of the person sits
 * in front of their name. Uses the same cut-out the call screen uses, so what
 * you line up here is what you get on a call.
 */
export default function DepthPreview({ image, name, settings, enabled = true, onAdjust, limits }) {
  const t = useTheme();
  const depth = useDepth(enabled ? image : null, enabled);
  const palette = gradientFor(name || 'preview', settings?.callBackground);
  const factor = W / REFERENCE_WIDTH;
  const base = depth ? depth.base : image;

  // Dragging the preview moves the cut-out directly; the steppers below are
  // for fine adjustment. Refs keep the handlers stable across renders.
  const start = useRef({ x: 0, y: 0 });
  const live = useRef({ settings, onAdjust, limits });
  live.current = { settings, onAdjust, limits };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !!live.current.onAdjust,
        onMoveShouldSetPanResponder: (_e, g) => !!live.current.onAdjust && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
        onPanResponderGrant: () => {
          const s = live.current.settings || {};
          start.current = { x: s.depthX ?? 0, y: s.depthY ?? 0 };
        },
        onPanResponderMove: (_e, g) => {
          const { onAdjust: cb, limits: lim } = live.current;
          if (!cb) return;
          const maxX = (lim && lim.x) || 60;
          const maxY = (lim && lim.y) || 80;
          const clamp = (v, m) => Math.max(-m, Math.min(m, Math.round(v)));
          cb({
            depthX: clamp(start.current.x + g.dx / factor, maxX),
            depthY: clamp(start.current.y + g.dy / factor, maxY),
          });
        },
      }),
    [factor]
  );

  return (
    <View
      {...pan.panHandlers}
      style={[styles.frame, { borderColor: t.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)' }]}
    >
      <LinearGradient colors={palette} style={StyleSheet.absoluteFill} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} />

      {base ? <Image source={{ uri: base }} resizeMode="cover" style={StyleSheet.absoluteFill} /> : null}

      {/* keeps the name readable, as on the call screen */}
      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: H * 0.55 }}
      />

      {!base ? (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(name) || '?'}</Text>
        </View>
      ) : null}

      <View style={styles.nameWrap}>
        <Text style={styles.status}>mobile</Text>
        <Text style={styles.name} numberOfLines={2}>
          {name || 'Jane Appleseed'}
        </Text>
      </View>

      {/* the person, in front of the name */}
      {depth && enabled ? (
        <Image
          source={{ uri: depth.foreground }}
          resizeMode="cover"
          style={[StyleSheet.absoluteFill, { transform: depthTransform(settings, factor) }]}
          pointerEvents="none"
        />
      ) : null}

      {enabled && !depth && image ? (
        <View style={styles.hint}>
          <Ionicons name="hourglass-outline" size={14} color="rgba(255,255,255,0.9)" />
        </View>
      ) : null}
    </View>
  );
}

export const DEPTH_PREVIEW_WIDTH = W;

const styles = StyleSheet.create({
  frame: { width: W, height: H, borderRadius: 26, overflow: 'hidden', borderWidth: 1, backgroundColor: '#1C1C1E' },
  nameWrap: { position: 'absolute', left: 0, right: 0, bottom: 26, paddingHorizontal: 10 },
  status: { color: 'rgba(255,255,255,0.75)', fontSize: 10, textAlign: 'center' },
  name: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 6,
  },
  avatar: {
    position: 'absolute',
    top: 54,
    alignSelf: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  hint: { position: 'absolute', top: 10, right: 10, opacity: 0.8 },
});
