import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ExpoBlur from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { formatNumber, prettyLabel } from '../phone';
import { getPhoneAccounts } from '../dialer';
import { Glass } from './Glass';

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
  const blurProps =
    Platform.OS !== 'android' ? {} : HAS_TARGET_API ? (target ? { blurTarget: target, blurMethod: 'dimezisBlurViewSdk31Plus' } : null) : { experimentalBlurMethod: 'dimezisBlurView' };
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
      {blurProps ? (
        <BlurView {...blurProps} intensity={45} tint={t.dark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'} style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.dark ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)' }]} />
    </Pressable>
  );
}

/**
 * Blurred pop-up over the screen.
 *  - mode 'numbers': a stack of number pills to pick from
 *  - mode 'sim':     "Call Using" with a button per SIM
 * `target` is the ref of a BlurTargetView wrapping the screen content (for the real blur).
 */
export default function CallPicker({ picker, target, onClose, onPickNumber, onPickSim }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
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
    <View style={StyleSheet.absoluteFill}>
      <Backdrop target={target} onClose={onClose} />
      <View style={[styles.lower, { paddingBottom: insets.bottom + 56 }]} pointerEvents="box-none">
        <Animated.View style={{ alignItems: 'center', opacity: fade, transform: [{ translateY: rise }, { scale }] }}>
          {picker.mode === 'numbers' ? (
            <>
              <Text style={[styles.caption, { color: t.secondary }]}>{picker.action === 'message' ? 'Message which number?' : 'Call which number?'}</Text>
              {picker.phones.map((p, i) => (
                <Pressable key={p.id || i} onPress={() => onPickNumber(p)} style={{ marginBottom: 12 }}>
                  {({ pressed }) => (
                    <Glass radius={24} pressed={pressed} outline style={styles.numberPill}>
                      <Text style={{ color: t.text, fontSize: 20, fontWeight: '600', letterSpacing: 0.5 }}>{formatNumber(p.number)}</Text>
                      {p.label ? <Text style={{ color: t.secondary, fontSize: 12, marginTop: 1 }}>{prettyLabel(p.label)}</Text> : null}
                    </Glass>
                  )}
                </Pressable>
              ))}
            </>
          ) : (
            <>
              <Glass radius={18} outline style={styles.usingPill}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>Call Using</Text>
              </Glass>
              <Text style={{ color: t.secondary, fontSize: 13, marginBottom: 12 }}>{formatNumber(picker.number)}</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {picker.accounts.map((a, i) => (
                  <Pressable key={a.key} onPress={() => onPickSim(a)}>
                    {({ pressed }) => (
                      <Glass radius={16} pressed={pressed} outline style={styles.simTile}>
                        <View style={[styles.simBadge, { backgroundColor: t.blue }]}>
                          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>
                        </View>
                        <Text style={{ color: t.text, fontSize: 13, fontWeight: '600', marginTop: 5 }} numberOfLines={1}>
                          {a.label || `SIM ${i + 1}`}
                        </Text>
                        {a.number ? (
                          <Text style={{ color: t.secondary, fontSize: 10, marginTop: 1 }} numberOfLines={1}>
                            {formatNumber(a.number)}
                          </Text>
                        ) : null}
                      </Glass>
                    )}
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // sits in the lower half of the screen, within thumb reach
  lower: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 24 },
  caption: { fontSize: 13, fontWeight: '600', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.6 },
  numberPill: { minWidth: 250, paddingHorizontal: 26, paddingVertical: 12, alignItems: 'center' },
  usingPill: { paddingHorizontal: 18, height: 36, justifyContent: 'center', marginBottom: 8 },
  simTile: { width: 100, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  simBadge: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
});
