import React from 'react';
import { Image } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

// Bundled alpha masks keep the preview's silhouettes identical on every phone.
// Selection changes only the tint; an outline never jumps into a filled glyph.
const ICONS = {
  calls: require('../../assets/dock/calls.png'),
  contacts: require('../../assets/dock/contacts.png'),
  keypad: require('../../assets/dock/keypad.png'),
  search: require('../../assets/dock/search.png'),
};

export default function DockIcon({ name, fallback = 'ellipse', size = 26, color }) {
  const source = ICONS[name];
  return source ? (
    <Image source={source} fadeDuration={0} accessible={false} resizeMode="contain" style={{ width: size, height: size, tintColor: color }} />
  ) : (
    <Ionicons name={fallback === 'search' ? fallback : `${fallback}-outline`} size={size} color={color} />
  );
}
