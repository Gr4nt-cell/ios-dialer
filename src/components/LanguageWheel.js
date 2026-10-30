import React, { useMemo } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Touch';
import { fs, useTheme } from '../theme';
import { Glass, GlassShadow } from './Glass';
import { useT } from '../i18n';
import Wheel from './Wheel';

const ITEM_H = 52;
const VISIBLE = 5; // rows on screen; the middle one is the selection
const HEIGHT = ITEM_H * VISIBLE;

/**
 * Language picker as an endless wheel: the selection sits in the long middle
 * row and the rows taper away above and below.
 */
export default function LanguageWheel({ visible, options, value, onChange, onClose, title }) {
  const t = useTheme();
  const tr = useT();

  const initialIndex = useMemo(() => {
    const i = options.findIndex((o) => o.code === value);
    return i < 0 ? 0 : i;
  }, [options, value]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} feedback="none">
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: t.dark ? 'rgba(9,12,18,0.48)' : 'rgba(91,99,111,0.18)' },
          ]}
        />
      </Pressable>

      <View style={styles.centre} pointerEvents="box-none">
        <GlassShadow radius={34} style={{ width: '88%', maxWidth: 400 }}>
          <Glass radius={34} strong style={{ paddingTop: 16, paddingBottom: 12 }}>
            <Text style={[styles.title, { color: t.text }]}>{title || tr('Language')}</Text>

            <View style={{ height: HEIGHT }}>
              {/* the selected row sits in this band */}
              <View pointerEvents="none" style={[styles.selection, { top: (HEIGHT - ITEM_H) / 2 }]}>
                <View
                  style={{
                    height: ITEM_H,
                    marginHorizontal: 16,
                    borderRadius: ITEM_H / 2,
                    borderWidth: 1,
                    borderColor: t.glassBorder,
                  }}
                />
              </View>

              <Wheel
                data={options}
                itemSize={ITEM_H}
                viewport={HEIGHT}
                initialIndex={initialIndex}
                transform="scaleX"
                scaleRange={[0.52, 0.78, 1, 0.78, 0.52]}
                opacityRange={[0.35, 0.7, 1, 0.7, 0.35]}
                onCentre={(opt) => opt && opt.code !== value && onChange(opt.code)}
                renderItem={({ item, isCentre, animated }) => (
                  <Animated.View style={[{ height: ITEM_H, justifyContent: 'center' }, animated]}>
                    <Glass strong vivid radius={(ITEM_H - 10) / 2} style={styles.row}>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: isCentre ? t.text : t.secondary,
                          fontSize: isCentre ? fs(18) : fs(16),
                          fontWeight: isCentre ? '700' : '500',
                        }}
                      >
                        {item.name}
                      </Text>
                    </Glass>
                  </Animated.View>
                )}
              />
            </View>

            <Pressable onPress={onClose} style={{ marginTop: 10, marginHorizontal: 16 }}>
              {({ pressed }) => (
                <Glass radius={22} pressed={pressed} tint={t.blue} tintOpacity={0.92} style={styles.done}>
                  <Text style={{ color: '#fff', fontSize: fs(16), fontWeight: '600' }}>{tr('Done')}</Text>
                </Glass>
              )}
            </Pressable>
          </Glass>
        </GlassShadow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fs(17), fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  selection: { position: 'absolute', left: 0, right: 0, zIndex: 2 },
  row: {
    height: ITEM_H - 10,
    marginHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  done: { height: 44, alignItems: 'center', justifyContent: 'center' },
});
