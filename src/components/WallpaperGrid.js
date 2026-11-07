import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from './Touch';
import { fs, useTheme } from '../theme';

export function wallpaperGridLayout(width, count = 0) {
  const available = Math.max(1, Number.isFinite(width) ? width : 288);
  const columns = count === 4 ? (available >= 430 ? 4 : 2) : available >= 680 ? 6 : available >= 430 ? 4 : available < 210 ? 2 : 3;
  const gap = 10;
  return { columns, gap, tileWidth: Math.max(1, Math.floor((available - gap * (columns - 1)) / columns)) };
}

// Images always have a bounded, clipped viewport. Intrinsic bitmap dimensions
// cannot expand a flex row or paint over adjacent tiles/sections on Android.
export default function WallpaperGrid({ items, selectedId, onSelect, dark = false }) {
  const t = useTheme();
  const [width, setWidth] = useState(288);
  const { gap, tileWidth } = wallpaperGridLayout(width, items.length);
  return (
    <View onLayout={(event) => {
      const next = Math.floor(event.nativeEvent.layout.width);
      if (next > 0 && next !== width) setWidth(next);
    }} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {items.map((item) => {
        const selected = item.id === selectedId;
        const height = Math.round(tileWidth * 1.3);
        return (
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ selected }} onPress={() => onSelect(item.id)} style={{ width: tileWidth }}>
            {({ pressed }) => (
              <>
                <View style={{ width: tileWidth, height, padding: 2, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: selected ? t.blue : t.glassBorder, transform: [{ scale: pressed ? 0.97 : 1 }] }}>
                  <View style={{ flex: 1, borderRadius: 11, overflow: 'hidden', backgroundColor: item.color || t.backdropBase }}>
                    {item.source ? <Image source={item.source} fadeDuration={0} resizeMode="cover" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} /> : null}
                    {dark && item.source ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.70)' }]} /> : null}
                  </View>
                  {selected ? <View style={styles.check}><Ionicons name="checkmark" size={13} color="#fff" /></View> : null}
                </View>
                <Text numberOfLines={2} style={{ color: selected ? t.blue : t.secondary, fontSize: fs(12), lineHeight: fs(16), textAlign: 'center', minHeight: fs(34), marginTop: 5 }}>{item.title}</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({ check: { position: 'absolute', right: 5, top: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: '#1678ED', alignItems: 'center', justifyContent: 'center' } });
