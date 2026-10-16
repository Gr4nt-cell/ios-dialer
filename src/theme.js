import { useColorScheme } from 'react-native';

const light = {
  dark: false,
  bg: '#FFFFFF',
  grouped: '#F2F2F7',
  card: '#FFFFFF',
  text: '#000000',
  secondary: '#8A8A8E',
  tertiary: '#C4C4C7',
  separator: '#D1D1D6',
  fill: '#EEEEF0',
  key: '#E9E9EB',
  keyPressed: '#BDBDC2',
  keyText: '#000000',
  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  avatar: ['#A5ABB6', '#858A94'],
  glass: 'rgba(250,250,252,0.94)',
  glassBorder: 'rgba(0,0,0,0.06)',
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
  bg: '#000000',
  grouped: '#000000',
  card: '#1C1C1E',
  text: '#FFFFFF',
  secondary: '#8D8D93',
  tertiary: '#48484A',
  separator: '#38383A',
  fill: '#1C1C1E',
  key: '#2E2E30',
  keyPressed: '#5A5A5E',
  keyText: '#FFFFFF',
  blue: '#0A84FF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  avatar: ['#6C6C72', '#4C4C52'],
  glass: 'rgba(38,38,40,0.94)',
  glassBorder: 'rgba(255,255,255,0.08)',
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
