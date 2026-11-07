import { useColorScheme } from 'react-native';

const light = {
  dark: false,
  backdrop: ['#D9EAE5', '#E5EEF0', '#E9F2DE'],
  glow: ['rgba(181,218,208,0.3)', 'rgba(218,237,199,0.25)'],
  backdropBase: '#E6F0E9',
  base: '#E6F0E9',
  bg: 'transparent',
  grouped: 'transparent',
  card: 'rgba(255,255,255,0.42)',
  text: '#1D2428',
  secondary: '#53685F',
  dockInactive: '#60766C',
  tertiary: '#72847B',
  separator: 'rgba(83,104,95,0.15)',
  fill: 'rgba(255,255,255,0.32)',
  key: 'rgba(255,255,255,0.38)',
  keyPressed: 'rgba(255,255,255,0.75)',
  keyText: '#1D2428',
  blue: '#1678ED',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  avatar: ['#A5ABB6', '#858A94'],
  glass: 'rgba(250,255,253,0.25)',
  glassBorder: 'rgba(255,255,255,0.86)',
  glassFillScale: 1,
  // chart hues are their own palette, checked for colour-blind separation
  // and contrast against this scheme's surface
  chartIncoming: '#0A84FF',
  chartOutgoing: '#2FB869',
  chartMissed: '#C02A1F',
  chartOther: '#7A5CFF',
  chartTrack: 'rgba(20,23,31,0.08)',
};

const dark = {
  dark: true,
  backdrop: ['#000000', '#000000', '#000000'],
  glow: ['rgba(58,91,217,0.48)', 'rgba(46,230,166,0.30)', 'rgba(224,48,110,0.32)'],
  backdropBase: '#000000',
  base: '#000000',
  bg: 'transparent',
  grouped: 'transparent',
  card: '#000000',
  text: '#FFFFFF',
  secondary: '#A9BBB3',
  dockInactive: '#A9BBB3',
  tertiary: '#83988D',
  separator: 'rgba(255,255,255,0.12)',
  fill: '#000000',
  // Raised charcoal is reserved for keyboard keys; other dark surfaces stay black.
  key: 'rgba(70,70,76,0.4)',
  keyPressed: 'rgba(140,140,150,0.55)',
  keyText: '#FFFFFF',
  blue: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  avatar: ['#000000', '#000000'],
  glass: '#000000',
  glassBorder: 'rgba(220,238,255,0.22)',
  glassFillScale: 1,
  chartIncoming: '#3B93F0',
  chartOutgoing: '#1DB069',
  chartMissed: '#C73A2E',
  chartOther: '#8A67E8',
  chartTrack: 'rgba(255,255,255,0.10)',
};

export function useTheme() {
  return useColorScheme() === 'dark' ? dark : light;
}

export const TAB_BAR_HEIGHT = 62;
export const TAB_BAR_SPACE = 92;

/**
 * One knob for text size across the app.
 *
 * Every hard-coded fontSize and lineHeight goes through fs(), so the whole app
 * can be re-proportioned by changing this number alone rather than by editing
 * a hundred and seventy literals. Sizes land on half points, which Android
 * renders cleanly.
 *
 * Type that is sized from the shape around it — the initials in an avatar, the
 * digits on a dial key — is deliberately left alone: it is already a fraction
 * of its container and shrinking it again would just leave a gap.
 */
export const FONT_SCALE = 0.85;

export const fs = (n) => Math.round(n * FONT_SCALE * 2) / 2;
