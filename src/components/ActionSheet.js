import React, { createContext, useCallback, useContext, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Touch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Glass } from './Glass';

// iOS-style action sheet (Android's Alert only fits three buttons).
const SheetContext = createContext({ show: () => {} });
export const useActionSheet = () => useContext(SheetContext);

function Sheet({ sheet, onClose }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const pick = (opt) => {
    onClose();
    if (opt.onPress) setTimeout(opt.onPress, 150);
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable feedback="none" style={styles.backdrop} onPress={onClose} />
      <View style={[styles.wrap, { paddingBottom: insets.bottom + 10 }]}>
        <Glass radius={26} style={styles.group}>
          {sheet.title || sheet.message ? (
            <View style={[styles.head, { borderBottomColor: t.separator }]}>
              {sheet.title ? <Text style={{ color: t.secondary, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{sheet.title}</Text> : null}
              {sheet.message ? <Text style={{ color: t.secondary, fontSize: 13, textAlign: 'center', marginTop: 2 }}>{sheet.message}</Text> : null}
            </View>
          ) : null}
          {sheet.options.map((opt, i) => (
            <Pressable key={i} onPress={() => pick(opt)}>
              {({ pressed }) => (
                <View style={[styles.option, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }, pressed && { backgroundColor: t.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' }]}>
                  <Text style={{ color: opt.destructive ? t.red : t.blue, fontSize: 19 }} numberOfLines={1}>
                    {opt.text}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </Glass>
        <Pressable onPress={onClose}>
          {({ pressed }) => (
            <Glass radius={26} pressed={pressed} style={[styles.option, { marginTop: 8 }]}>
              <Text style={{ color: t.blue, fontSize: 19, fontWeight: '600' }}>Cancel</Text>
            </Glass>
          )}
        </Pressable>
      </View>
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
  wrap: { position: 'absolute', left: 10, right: 10, bottom: 0 },
  group: {},
  head: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  option: { height: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});
