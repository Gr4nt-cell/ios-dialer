import React, { useRef } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { useTheme, fs } from '../theme';
import { initials } from '../phone';
import { DEPTH_LIMITS } from '../depth';
import { useT } from '../i18n';
import DepthPoster from './DepthPoster';
import { posterSettings } from '../depthSettings';
import { gradientFor } from '../gradients';

const W = 168;
const H = 320;
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
  const factor = AVATAR / REFERENCE;

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
      <DepthPoster settings={{ ...posterSettings(settings), callDepth: enabled }} image={image} name={name} status={tr('calling mobile…')} colors={gradientFor(name, settings.callBackground)} showFeedback />
    </View>
  );
}
