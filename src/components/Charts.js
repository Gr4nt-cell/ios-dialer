import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

const TAU = Math.PI * 2;

function arc(cx, cy, rOut, rIn, a0, a1) {
  const pt = (r, a) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M${pt(rOut, a0)}`,
    `A${rOut} ${rOut} 0 ${large} 1 ${pt(rOut, a1)}`,
    `L${pt(rIn, a1)}`,
    `A${rIn} ${rIn} 0 ${large} 0 ${pt(rIn, a0)}`,
    'Z',
  ].join(' ');
}

// Part-to-whole ring. Segments carry a 2px gap so neighbouring colours never
// touch, and every value is also written out in the legend beside it.
export function Donut({ slices, size = 156, thickness = 30, children }) {
  const t = useTheme();
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2;
  const rIn = r - thickness;
  const mid = (r + rIn) / 2;
  const gap = total > 0 ? Math.min(0.09, 2 / mid) : 0;
  const live = slices.filter((s) => s.value > 0);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <G>
          <Circle cx={r} cy={r} r={mid} stroke={t.chartTrack} strokeWidth={thickness} fill="none" />
          {total > 0 && live.length === 1 ? (
            <Circle cx={r} cy={r} r={mid} stroke={live[0].color} strokeWidth={thickness} fill="none" />
          ) : null}
          {total > 0 && live.length > 1
            ? live.map((s, i) => {
                const before = live.slice(0, i).reduce((a, x) => a + x.value, 0) / total;
                const a0 = -Math.PI / 2 + before * TAU + gap / 2;
                const a1 = a0 + (s.value / total) * TAU - gap;
                if (a1 <= a0) return null;
                return <Path key={s.key} d={arc(r, r, r, rIn, a0, a1)} fill={s.color} />;
              })
            : null}
        </G>
      </Svg>
      {children}
    </View>
  );
}

// Vertical bars on a recessive track, rounded ends, one gutter between each.
export function Bars({ data, height = 74, color, highlightColor }) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {data.map((d, i) => {
        const h = Math.max(6, Math.round((d.value / max) * height));
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Svg width={26} height={height}>
              <Rect x={1} y={0} width={24} height={height} rx={12} fill={t.chartTrack} />
              <Rect x={1} y={height - h} width={24} height={h} rx={12} fill={d.highlight ? highlightColor : color} />
            </Svg>
            <View style={{ height: 6 }} />
            {d.label}
          </View>
        );
      })}
    </View>
  );
}

// Horizontal magnitude bar, used in the most-called list.
export function Meter({ value, max, color }) {
  const t = useTheme();
  const pct = max > 0 ? Math.max(0.04, Math.min(1, value / max)) : 0;
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.chartTrack, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}
