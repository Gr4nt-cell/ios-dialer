import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Glass, GlassShadow } from './Glass';

export const UNIFIED_TABS = [
  { key: 'calls', label: 'Calls', icon: 'call' },
  { key: 'contacts', label: 'Contacts', icon: 'person-circle' },
  { key: 'keypad', label: 'Keypad', icon: 'keypad' },
  { key: 'search', label: 'Search', icon: 'search' },
];

export const CLASSIC_TABS = [
  { key: 'favorites', label: 'Favorites', icon: 'star' },
  { key: 'recents', label: 'Recents', icon: 'time' },
  { key: 'contacts', label: 'Contacts', icon: 'person-circle' },
  { key: 'keypad', label: 'Keypad', icon: 'keypad' },
  { key: 'voicemail', label: 'Voicemail', icon: 'recording' },
  { key: 'search', label: 'Search', icon: 'search' },
];

// Floating glass capsule with a sliding glass "lens" behind the selected tab,
// Search lives inside the same bar.
export default function TabBar({ tabs, active, onChange, badges = {} }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.findIndex((x) => x.key === active));
  const pos = useRef(new Animated.Value(index)).current;
  const squish = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(pos, { toValue: index, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  }, [index, pos]);

  const itemW = width ? (width - 8) / tabs.length : 0;

  const press = (key) => {
    Haptics.selectionAsync().catch(() => {});
    Animated.sequence([
      Animated.timing(squish, { toValue: 1.12, duration: 90, useNativeDriver: true }),
      Animated.spring(squish, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }),
    ]).start();
    onChange(key);
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <GlassShadow radius={32} style={{ flex: 1 }}>
        <Glass blur outline radius={32} intensity={70} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: 62 }}>
          {itemW > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                width: itemW,
                bottom: 4,
                transform: [{ translateX: Animated.multiply(pos, itemW) }, { scaleX: squish }, { scaleY: squish }],
              }}
            >
              <Glass radius={27} selected style={{ flex: 1 }} tint={t.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.06)'} tintOpacity={1} />
            </Animated.View>
          ) : null}
          <View style={{ flexDirection: 'row', flex: 1, paddingHorizontal: 4 }}>
            {tabs.map((tab) => {
              const on = tab.key === active;
              const color = on ? t.blue : t.text;
              return (
                <Pressable key={tab.key} onPress={() => press(tab.key)} style={styles.item} hitSlop={4}>
                  <View>
                    <Ionicons name={tab.icon === 'search' ? 'search' : on ? tab.icon : tab.icon + '-outline'} size={tabs.length > 5 ? 22 : 24} color={color} />
                    {badges[tab.key] ? (
                      <View style={[styles.badge, { backgroundColor: t.red }]}>
                        <Text style={styles.badgeText}>{badges[tab.key] > 99 ? '99+' : badges[tab.key]}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.label, { color }]} numberOfLines={1}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Glass>
      </GlassShadow>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'flex-end' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, fontWeight: '600', marginTop: 2, letterSpacing: -0.1 },
  badge: { position: 'absolute', top: -4, right: -12, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
