import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Touch';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import Dialer from '../dialer';
import { Glass } from './Glass';
import { ChromeText } from './ui';
import { useT } from '../i18n';

export const SIDEBAR_WIDTH = 92;

function tick() {
  try {
    if (Dialer && Dialer.softTick) {
      Dialer.softTick(0.4);
      return;
    }
  } catch {
    // fall through
  }
  Haptics.selectionAsync().catch(() => {});
}

/**
 * The tablet's section rail.
 *
 * It is the tab bar's idea turned on its side: a glass lens slides to whatever
 * is selected, rather than each item carrying its own highlight. One moving
 * piece reads as a single surface, which is the whole point of the look.
 */
export default function Sidebar({ tabs, active, onChange, onSettings, badges = {} }) {
  const t = useTheme();
  const tr = useT();
  const insets = useSafeAreaInsets();
  const index = Math.max(0, tabs.findIndex((x) => x.key === active));
  const pos = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    Animated.spring(pos, { toValue: index, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [index, pos]);

  const ITEM = 72;
  const LENS = 64;
  const COLUMN = SIDEBAR_WIDTH - 16;

  return (
    <Glass strong vivid radius={32} style={[styles.rail, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 }]}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: COLUMN, height: ITEM * tabs.length }}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.lens,
              {
                width: LENS,
                height: LENS,
                left: (COLUMN - LENS) / 2,
                top: (ITEM - LENS) / 2,
                transform: [{ translateY: Animated.multiply(pos, ITEM) }],
              },
            ]}
          >
            <Glass radius={LENS / 2} vivid outline style={{ width: LENS, height: LENS }} />
          </Animated.View>

          {tabs.map((tab) => {
            const on = tab.key === active;
            const badge = badges[tab.key];
            return (
              <Pressable
                key={tab.key}
                onPress={() => {
                  if (!on) tick();
                  onChange(tab.key);
                }}
                style={{ height: ITEM, alignItems: 'center', justifyContent: 'center' }}
                hitSlop={4}
              >
                <View>
                  <Ionicons name={on ? tab.icon : `${tab.icon}-outline`} size={24} color={on ? t.blue : t.secondary} />
                  {badge ? (
                    <View style={[styles.badge, { backgroundColor: t.red }]}>
                      <Text allowFontScaling={false} style={styles.badgeText}>
                        {badge > 99 ? '99+' : badge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <ChromeText style={{ color: on ? t.blue : t.secondary, fontSize: fs(11), fontWeight: on ? '700' : '500', marginTop: 4 }}>
                  {tr(tab.label)}
                </ChromeText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <Pressable onPress={onSettings} hitSlop={8} style={{ alignItems: 'center' }}>
        {({ pressed }) => (
          <Glass radius={22} pressed={pressed} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="settings-outline" size={21} color={t.text} />
          </Glass>
        )}
      </Pressable>
    </Glass>
  );
}

const styles = StyleSheet.create({
  rail: { width: SIDEBAR_WIDTH, alignItems: 'center' },
  lens: { position: 'absolute' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -12,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: fs(11), fontWeight: '700' },
});
