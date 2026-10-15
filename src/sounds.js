import { createAudioPlayer } from 'expo-audio';

const SOURCES = {
  '0': require('../assets/tones/0.wav'),
  '1': require('../assets/tones/1.wav'),
  '2': require('../assets/tones/2.wav'),
  '3': require('../assets/tones/3.wav'),
  '4': require('../assets/tones/4.wav'),
  '5': require('../assets/tones/5.wav'),
  '6': require('../assets/tones/6.wav'),
  '7': require('../assets/tones/7.wav'),
  '8': require('../assets/tones/8.wav'),
  '9': require('../assets/tones/9.wav'),
  '*': require('../assets/tones/star.wav'),
  '#': require('../assets/tones/hash.wav'),
};

let players = null;

function getPlayers() {
  if (players) return players;
  players = {};
  for (const key of Object.keys(SOURCES)) {
    try {
      players[key] = createAudioPlayer(SOURCES[key]);
    } catch {
      // audio unavailable; tones are optional
    }
  }
  return players;
}

export function preloadTones() {
  getPlayers();
}

export function playTone(key) {
  const player = getPlayers()[key];
  if (!player) return;
  try {
    Promise.resolve(player.seekTo(0))
      .then(() => player.play())
      .catch(() => {});
  } catch {
    // ignore
  }
}
