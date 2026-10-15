// Call-screen backgrounds. Each preset is [glow A, glow B, base].
export const GRADIENTS = [
  { id: 'aurora', name: 'Aurora', colors: ['#2EE6A6', '#3A5BD9', '#06142B'] },
  { id: 'sunset', name: 'Sunset', colors: ['#FF8A3D', '#E0306E', '#2A0B1C'] },
  { id: 'ocean', name: 'Ocean', colors: ['#1FA2C9', '#2C5FD6', '#04162A'] },
  { id: 'midnight', name: 'Midnight', colors: ['#4A4FD8', '#7A3FD1', '#07081A'] },
  { id: 'rose', name: 'Rose', colors: ['#FF7EB3', '#B0306E', '#2A0A18'] },
  { id: 'forest', name: 'Forest', colors: ['#2E9D5B', '#0F8F86', '#04190F'] },
  { id: 'lavender', name: 'Lavender', colors: ['#B49CFF', '#6D5BD0', '#140F2E'] },
  { id: 'ember', name: 'Ember', colors: ['#FFB547', '#D9573A', '#250C04'] },
  { id: 'peach', name: 'Peach', colors: ['#FFC29E', '#F0717A', '#2B1212'] },
  { id: 'lagoon', name: 'Lagoon', colors: ['#5CE1E6', '#2E9D8F', '#03201F'] },
  { id: 'cosmic', name: 'Cosmic', colors: ['#D04A8C', '#4A4FD8', '#0D0620'] },
  { id: 'mono', name: 'Graphite', colors: ['#8E8E93', '#48484A', '#0B0B0D'] },
];

const ROTATION = ['midnight', 'ocean', 'sunset', 'aurora', 'cosmic', 'forest', 'ember', 'lavender', 'rose', 'lagoon'];

export function gradientById(id) {
  return GRADIENTS.find((g) => g.id === id) || null;
}

// 'auto' gives every caller their own stable gradient based on who they are.
export function gradientFor(key, choice = 'auto') {
  const picked = choice && choice !== 'auto' ? gradientById(choice) : null;
  if (picked) return picked.colors;
  let h = 0;
  for (const ch of key || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return gradientById(ROTATION[h % ROTATION.length]).colors;
}
