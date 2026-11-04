import React, { createContext, useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

// Bundled outlines preserve the reference symbols on Android: no platform emoji
// substitution, downloaded fonts, or dependence on the device's symbol font.
const FONTS = { CallScreenReference: require('../../assets/fonts/call-screen-reference.ttf') };
const FontReady = createContext(false);
export function ReferenceCallTypography({ children }) {
  const [loaded] = useFonts(FONTS);
  return <FontReady.Provider value={loaded}>{children}</FontReady.Provider>;
}

const SYMBOLS = {
  person: '♙', 'person-outline': '♙',
  chatbubble: '▤', 'document-text-outline': '▤',
  'radio-button-on': '◉',
  'volume-high': '◖)', 'volume-medium': '◖)',
  pause: 'Ⅱ',
  mic: '♩', 'mic-outline': '♩', 'mic-off': '♩', 'mic-off-outline': '♩',
  add: '+', keypad: '⠿', 'keypad-outline': '⠿',
  call: '☎', 'chevron-down': '⌄',
};

export function ReferenceCallIcon({ name, size = 28, color = '#20363B', style }) {
  const ready = useContext(FontReady);
  const symbol = SYMBOLS[name];
  // Bluetooth, headset, Resume and Merge retain their meaningful state icons.
  if (!symbol) return <Ionicons name={name} size={size} color={color} style={style} />;
  return (
    <View accessible={false} pointerEvents="none" style={{ minWidth: size, height: size * 1.2, alignItems: 'center', justifyContent: 'center' }}>
      {ready ? <Text accessible={false} allowFontScaling={false} style={[{
        fontFamily: 'CallScreenReference', fontWeight: '400', fontSize: size,
        lineHeight: size * 1.2, includeFontPadding: false, textAlign: 'center', color,
      }, style]}>{symbol}</Text> : null}
    </View>
  );
}

export function ReferenceCallLabel({ children, color = '#20363B', style, ...props }) {
  const ready = useContext(FontReady);
  return <Text {...props} allowFontScaling={false} numberOfLines={1} style={[{
    color, fontSize: 13, lineHeight: 15, fontWeight: '400', includeFontPadding: false,
    textAlign: 'center', marginTop: 7,
  }, ready && { fontFamily: 'CallScreenReference' }, style]}>{children}</Text>;
}

export function ReferenceCallSurface({ children, radius = 36, pressed, tint, on, style }) {
  return <View style={[styles.surface, {
    borderRadius: radius,
    backgroundColor: tint || (on ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.20)'),
    opacity: pressed ? 0.92 : 1,
    transform: [{ scale: pressed ? 0.96 : 1 }],
  }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: {
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    boxShadow: '0px 10px 25px rgba(32,54,59,0.094)',
  },
});
