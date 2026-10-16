import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';

// Plain-View charts — no drawing library, so nothing new loads at launch.

// 100% stacked bar: the whole width is the total, each band a share of it.
// Bands are separated by a 2px gap so neighbouring colours never touch, and
// every value is written out in the legend beside it.
export function StackedBar({ slices, height = 16 }) {
  const t = useTheme();
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return <View style={{ height, borderRadius: height / 2, backgroundColor: t.chartTrack }} />;
  }
  const live = slices.filter((s) => s.value > 0);
  return (
    <View style={{ height, borderRadius: height / 2, overflow: 'hidden', flexDirection: 'row', backgroundColor: t.chartTrack }}>
      {live.map((s, i) => (
        <View
          key={s.key}
          style={{
            flex: s.value,
            backgroundColor: s.color,
            marginLeft: i === 0 ? 0 : 2,
          }}
        />
      ))}
    </View>
  );
}

// A ring would need a drawing library; this reads the same way at a glance:
// the share each type takes, stacked, with the total called out above it.
export function ShareRows({ slices, total, textColor, mutedColor }) {
  const t = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {slices.map((s) => {
        const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
        return (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color, marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                {s.labelNode}
                {s.valueNode}
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: t.chartTrack, marginTop: 5, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(pct, 1)}%`, height: 6, borderRadius: 3, backgroundColor: s.color }} />
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// Vertical bars on a recessive track, rounded ends.
export function Bars({ data, height = 74, color, highlightColor }) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {data.map((d, i) => {
        const h = Math.max(6, Math.round((d.value / max) * height));
        return (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <View style={{ width: 24, height, borderRadius: 12, backgroundColor: t.chartTrack, justifyContent: 'flex-end', overflow: 'hidden' }}>
              <View style={{ width: 24, height: h, borderRadius: 12, backgroundColor: d.highlight ? highlightColor : color }} />
            </View>
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
  const pct = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.chartTrack, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}
