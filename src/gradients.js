// Soft call-background swatch palettes. Full-size light/dark images live in wallpapers.js.
export const GRADIENTS = [
  // The app's own pastel backdrop, drawn from assets/dialer-gradient-background.jpg.
  // The three colours are only for the swatch and the preview; the call screen
  // itself renders the selected offline wallpaper.
  { id: 'pastel', name: 'Pastel', colors: ['#D9EAE5', '#E5EEF0', '#E9F2DE'] },
  { id: 'plain', name: 'Plain White', colors: ['#FFFFFF', '#FFFFFF', '#FFFFFF'] },
  { id: 'fastscore', name: 'Fast Score', colors: ['#D2E9E8', '#E5EFF5', '#E0F0E9'] },
  { id: 'aurora', name: 'Aurora', colors: ['#D9EAE5', '#E5EEF0', '#E9F2DE'] },
  { id: 'sunset', name: 'Sunset', colors: ['#F8E3CF', '#F4E6E4', '#F7EFCF'] },
  { id: 'ocean', name: 'Ocean', colors: ['#D2E9E8', '#E5EFF5', '#E0F0E9'] },
  { id: 'midnight', name: 'Midnight', colors: ['#DFE8F7', '#E9E5F5', '#E3EFF1'] },
  { id: 'rose', name: 'Rose', colors: ['#F3DAE4', '#F4E7F2', '#F9E9E1'] },
  { id: 'forest', name: 'Forest', colors: ['#DEEAD9', '#E6EEE2', '#ECEDD8'] },
  { id: 'lavender', name: 'Lavender', colors: ['#E7DEF3', '#E2EBF7', '#EEEAF7'] },
  { id: 'ember', name: 'Ember', colors: ['#F8E5D6', '#F9EDE3', '#F0EAD7'] },
  { id: 'peach', name: 'Peach', colors: ['#F8E5D6', '#F9EDE3', '#F0EAD7'] },
  { id: 'lagoon', name: 'Lagoon', colors: ['#D2E9E8', '#E5EFF5', '#E0F0E9'] },
  { id: 'cosmic', name: 'Cosmic', colors: ['#F3E1F0', '#E1ECF9', '#F8E9F2'] },
  { id: 'mono', name: 'Graphite', colors: ['#E5F0E9', '#EDF4F8', '#F0F4E9'] },
];

const ROTATION = ['midnight', 'ocean', 'sunset', 'aurora', 'cosmic', 'forest', 'ember', 'lavender', 'rose', 'lagoon'];

export function gradientById(id) {
  return GRADIENTS.find((g) => g.id === id) || null;
}

// 'auto' and an unset choice both mean the pastel backdrop, which is the default.
export function gradientFor(key, choice = 'auto') {
  const picked = choice && choice !== 'auto' ? gradientById(choice) : null;
  if (picked) return picked.colors;
  if (choice === 'auto') return gradientById('pastel').colors;
  let h = 0;
  for (const ch of key || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return gradientById(ROTATION[h % ROTATION.length]).colors;
}
