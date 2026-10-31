import { useColorScheme } from 'react-native';

const light = {
  dark: false,
  bg: '#F5F5F5',
  grouped: '#F2F3F4',
  card: '#FCFCFD',
  text: '#18191B',
  secondary: '#73767C',
  tertiary: '#B9BDC3',
  separator: 'rgba(80,86,96,0.12)',
  fill: '#EBEDEF',
  key: '#F9FAFB',
  keyPressed: '#E3E6E9',
  keyText: '#18191B',
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  avatar: ['#ADB5C0', '#939DAA'],
  glass: 'rgba(252,253,254,0.82)',
  glassBorder: 'rgba(80,86,96,0.12)',
  glassFillScale: 0.3,
  refraction: {
    base: ['#C9DFFF', '#EAF0FC', '#F5EAF5', '#F7E7F0', '#E1F5EE'],
    blue: ['rgba(112,169,255,0.48)', 'rgba(147,202,255,0.25)', 'rgba(147,202,255,0)'],
    rose: ['rgba(255,163,199,0)', 'rgba(255,158,197,0.42)', 'rgba(255,178,210,0)'],
    lavender: ['rgba(179,161,255,0.38)', 'rgba(185,171,255,0.18)', 'rgba(185,171,255,0)'],
    mint: ['rgba(124,229,199,0)', 'rgba(133,231,203,0.42)', 'rgba(133,231,203,0)'],
  },
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
  bg: '#111214',
  grouped: '#151619',
  card: '#222428',
  text: '#F5F6F8',
  secondary: '#A0A5AE',
  tertiary: '#5B616B',
  separator: 'rgba(211,220,233,0.12)',
  fill: '#2A2D32',
  key: '#2D3036',
  keyPressed: '#424750',
  keyText: '#F5F6F8',
  blue: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  avatar: ['#6C6C72', '#4C4C52'],
  glass: 'rgba(38,41,47,0.86)',
  glassBorder: 'rgba(220,228,240,0.12)',
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
