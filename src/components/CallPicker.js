import React, { useContext, useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from './Touch';
import * as ExpoBlur from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { formatNumber, numberKey, prettyLabel } from '../phone';
import { getPhoneAccounts } from '../dialer';
import { Glass, GlassModeContext } from './Glass';
import { ChromeText } from './ui';

const { BlurView } = ExpoBlur;
const HAS_TARGET_API = !!ExpoBlur.BlurTargetView;

/** SIMs that can place calls, e.g. [{ key, label, number }]. */
export function callAccounts() {
  try {
    return getPhoneAccounts().accounts || [];
  } catch {
    return [];
  }
}

function Backdrop({ target, onClose }) {
  const t = useTheme();
  // no blur when Liquid Glass is switched off
  const plain = useContext(GlassModeContext) === 'plain';
  const blurProps =
    plain || Platform.OS !== 'android' ? {} : HAS_TARGET_API ? (target ? { blurTarget: target, blurMethod: 'dimezisBlurViewSdk31Plus' } : null) : { experimentalBlurMethod: 'dimezisBlurView' };
  return (
    <Pressable feedback="none" style={StyleSheet.absoluteFill} onPress={onClose}>
      {blurProps ? (
        <BlurView {...blurProps} intensity={45} tint={t.dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.dark ? 'rgba(9,12,18,0.45)' : 'rgba(235,238,242,0.35)' }]} />
    </Pressable>
  );
}

/**
 * Blurred pop-up over the screen.
 *  - mode 'numbers': a stack of number pills to pick from
 *  - mode 'sim':     a button per SIM
 * `target` is the ref of a BlurTargetView wrapping the screen content (for the real blur).
 */
export default function CallPicker({ picker, target, onClose, onPickNumber, onPickSim }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (picker) {
      fade.setValue(0);
      Animated.spring(fade, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
    }
  }, [picker, fade]);

  if (!picker) return null;

  const scale = fade.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const rise = fade.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100 }]}>
      <Backdrop target={target} onClose={onClose} />
      {/* pinned to the bottom edge of the screen, never higher than its middle */}
      <Animated.View
        style={[
          styles.sheet,
          { bottom: Math.max(insets.bottom, 12) + 90, maxHeight: screenH / 2, opacity: fade, transform: [{ translateY: rise }, { scale }] },
        ]}
      >
          {picker.mode === 'numbers' ? (
            <>
              <Text style={[styles.caption, { color: t.secondary }]}>{picker.action === 'message' ? 'Message which number?' : picker.action === 'favorite' ? 'Add which number to Favorites?' : 'Call which number?'}</Text>
              {picker.phones.map((p, i) => (
                <Pressable key={p.id || i} onPress={() => onPickNumber(p)} style={{ marginBottom: 12 }}>
                  {({ pressed }) => (
                    <Glass radius={24} pressed={pressed} outline style={styles.numberPill}>
                      <Text style={{ color: t.text, fontSize: fs(20), fontWeight: '600', letterSpacing: 0.5 }}>{formatNumber(p.number)}</Text>
                      {p.label || (picker.lastKey && picker.lastKey === numberKey(p.number)) ? (
                        <Text style={{ color: t.secondary, fontSize: fs(12), marginTop: 1 }}>
                          {p.label ? prettyLabel(p.label) : ''}
                          {picker.lastKey && picker.lastKey === numberKey(p.number) ? (
                            <Text style={{ color: t.green, fontWeight: '600' }}>{p.label ? '  ·  ' : ''}Last called</Text>
                          ) : null}
                        </Text>
                      ) : null}
                    </Glass>
                  )}
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <Text style={{ color: t.secondary, fontSize: fs(15), marginBottom: 14 }}>{formatNumber(picker.number)}</Text>
              <View style={{ flexDirection: 'row', gap: 14 }}>
                {picker.accounts.map((a, i) => (
                  <Pressable key={a.key} onPress={() => onPickSim(a)}>
                    {({ pressed }) => (
                      <Glass radius={19} pressed={pressed} outline style={styles.simTile}>
                        <View style={[styles.simBadge, { backgroundColor: t.blue }]}>
                          <Text style={{ color: '#fff', fontSize: fs(13), fontWeight: '800' }}>{i + 1}</Text>
                        </View>
                        <ChromeText style={{ color: t.text, fontSize: fs(16), fontWeight: '600', marginTop: 6 }}>
                          {a.label || `SIM ${i + 1}`}
                        </ChromeText>
                      </Glass>
                    )}
                  </Pressable>
                ))}
              </View>
            </>
          )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // lower half of the screen, within thumb reach
  sheet: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 24 },
  caption: { fontSize: fs(13), fontWeight: '600', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.6 },
  numberPill: { minWidth: 250, paddingHorizontal: 26, paddingVertical: 12, alignItems: 'center' },
  simTile: { width: 132, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  simBadge: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});
