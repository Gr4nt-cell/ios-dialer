import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Touch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { Glass } from './Glass';

// iOS-style action sheet (Android's Alert only fits three buttons).
const SheetContext = createContext({ show: () => {} });
export const useActionSheet = () => useContext(SheetContext);

function Sheet({ sheet, onClose }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fade.setValue(0);
    Animated.spring(fade, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }).start();
  }, [fade]);

  const pick = (opt) => {
    onClose();
    if (opt.onPress) setTimeout(opt.onPress, 150);
  };

  const scale = fade.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const rise = fade.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable feedback="none" style={styles.backdrop} onPress={onClose} />
      {/* each choice is its own glass pill, like the number picker */}
      <Animated.View
        style={[
          styles.wrap,
          { paddingBottom: insets.bottom + 16, opacity: fade, transform: [{ translateY: rise }, { scale }] },
        ]}
      >
        {sheet.title ? (
          <Text style={[styles.caption, { color: t.secondary }]} numberOfLines={2}>
            {sheet.title}
          </Text>
        ) : null}
        {sheet.message ? (
          <Text style={[styles.message, { color: t.secondary }]} numberOfLines={3}>
            {sheet.message}
          </Text>
        ) : null}

        {sheet.options.map((opt, i) => (
          <Pressable key={i} onPress={() => pick(opt)} style={styles.row}>
            {({ pressed }) => (
              <Glass radius={22} outline pressed={pressed} style={styles.option}>
                <Text style={{ color: opt.destructive ? t.red : t.text, fontSize: fs(18), fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
                  {opt.text}
                </Text>
              </Glass>
            )}
          </Pressable>
        ))}

        <Pressable onPress={onClose} style={[styles.row, { marginTop: 6 }]}>
          {({ pressed }) => (
            <Glass radius={22} outline pressed={pressed} style={styles.option}>
              <Text style={{ color: t.secondary, fontSize: fs(18), fontWeight: '600' }}>Cancel</Text>
            </Glass>
          )}
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

export function ActionSheetProvider({ children }) {
  const [sheet, setSheet] = useState(null);
  const show = useCallback((s) => setSheet(s), []);
  const close = useCallback(() => setSheet(null), []);
  return (
    <SheetContext.Provider value={{ show }}>
      {children}
      {sheet ? <Sheet sheet={sheet} onClose={close} /> : null}
    </SheetContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 24 },
  caption: { fontSize: fs(13), fontWeight: '600', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center' },
  message: { fontSize: fs(13), marginTop: -6, marginBottom: 12, textAlign: 'center' },
  row: { alignSelf: 'stretch', marginBottom: 10 },
  option: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 },
});
