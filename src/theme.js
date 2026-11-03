import { useColorScheme } from 'react-native';

const light = {
  dark: false,
  backdrop: ['#D6FFF0', '#F4FBFA', '#FFF0DF'],
  glow: ['rgba(99,244,204,0.65)', 'rgba(255,179,124,0.65)'],
  backdropBase: '#DFEAFB',
  base: '#DFEAFB',
  bg: 'transparent',
  grouped: 'transparent',
  card: 'rgba(255,255,255,0.42)',
  text: '#000000',
  secondary: '#30394B',
  tertiary: '#C4C4C7',
  separator: '#D1D1D6',
  fill: 'rgba(255,255,255,0.32)',
  key: 'rgba(255,255,255,0.38)',
  keyPressed: 'rgba(255,255,255,0.75)',
  keyText: '#000000',
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  avatar: ['#A5ABB6', '#858A94'],
  glass: 'rgba(255,255,255,0.4)',
  glassBorder: 'rgba(0,0,0,0.06)',
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
  backdrop: ['#05060A', '#05060A', '#05060A'],
  glow: ['rgba(58,91,217,0.48)', 'rgba(46,230,166,0.30)', 'rgba(224,48,110,0.32)'],
  backdropBase: '#05060A',
  base: '#05060A',
  bg: 'transparent',
  grouped: 'transparent',
  card: 'rgba(44,44,48,0.42)',
  text: '#FFFFFF',
  secondary: '#8D8D93',
  tertiary: '#48484A',
  separator: '#38383A',
  fill: 'rgba(60,60,66,0.38)',
  key: 'rgba(70,70,76,0.4)',
  keyPressed: 'rgba(140,140,150,0.55)',
  keyText: '#FFFFFF',
  blue: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  avatar: ['#6C6C72', '#4C4C52'],
  glass: 'rgba(40,40,44,0.42)',
  glassBorder: 'rgba(255,255,255,0.08)',
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
