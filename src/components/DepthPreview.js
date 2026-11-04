import React, { useRef } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { useTheme, fs } from '../theme';
import { initials } from '../phone';
import { DEPTH_FRAME, DEPTH_LIMITS, depthLayout, useDepth } from '../depth';
import { useT } from '../i18n';

const W = 168;
const H = 236;
const AVATAR = 62;          // the preview's own circle
const REFERENCE = 110;      // the call screen's circle, which the offsets are in

/**
 * A miniature of the call screen, showing how far the person rises out of the
 * circle and across their name. It uses the same cut-out the call screen uses,
 * so what you line up here is what you get on a call, and dragging it moves
 * the person directly.
 */
export default function DepthPreview({ image, name, settings, enabled = true, onAdjust }) {
  const t = useTheme();
  const tr = useT();
  const depth = useDepth(enabled ? image : null, enabled);
  const factor = AVATAR / REFERENCE;
  const cut = depth && depth.box ? depthLayout(depth.box, AVATAR * DEPTH_FRAME, settings, factor) : null;

  // refs keep the gesture handlers stable while the values they read stay live
  const start = useRef({ x: 0, y: 0 });
  const live = useRef({ settings, onAdjust });
  live.current = { settings, onAdjust };

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        const s = live.current.settings || {};
        start.current = { x: s.depthX ?? 0, y: s.depthY ?? 0 };
      },
      onPanResponderMove: (_, g) => {
        const { offset } = DEPTH_LIMITS;
        const clamp = (v) => Math.round(Math.min(offset.max, Math.max(offset.min, v)));
        live.current.onAdjust?.({
          depthX: clamp(start.current.x + g.dx / factor),
          depthY: clamp(start.current.y + g.dy / factor),
        });
      },
    })
  ).current;

  const letters = initials(name);

  return (
    <View
      {...pan.panHandlers}
      style={{ width: W, height: H, borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder }}
    >
      <Image source={require('../../assets/dialer-gradient-background.jpg')} resizeMode="stretch" style={StyleSheet.absoluteFill} />

      <View style={{ alignItems: 'center', marginTop: 22 }}>
        <Text allowFontScaling={false} style={{ color: '#53666D', fontSize: fs(11) }}>{tr('calling mobile…')}</Text>
        <Text allowFontScaling={false} numberOfLines={1} style={{ color: '#22343A', fontSize: fs(19), fontWeight: '700', maxWidth: W - 16 }}>
          {name}
        </Text>

        <View style={{ width: AVATAR, height: AVATAR, marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
          {cut ? (
            <Image
              source={{ uri: depth.foreground }}
              resizeMode="contain"
              style={{ position: 'absolute', width: cut.width, height: cut.height, left: AVATAR / 2 + cut.dx, top: AVATAR / 2 + cut.dy }}
            />
          ) : image ? (
            <Image source={{ uri: image }} style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }} />
          ) : (
            <View style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, backgroundColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#22343A', fontSize: fs(20), fontWeight: '600' }}>{letters}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
