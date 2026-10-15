import { Linking, PermissionsAndroid, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import Dialer from '../modules/dialer';

// ---------- numbers ----------

export const cleanNumber = (s) => (s || '').replace(/[^\d+*#,;]/g, '');

// Key used to match the same number written differently (+233 24…, 024…).
export function numberKey(s) {
  const d = (s || '').replace(/\D/g, '');
  return d.length > 9 ? d.slice(-9) : d;
}

function groupRest(d) {
  if (d.length <= 4) return d;
  if (d.length === 9) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  const parts = [];
  let rest = d;
  while (rest.length > 4) {
    parts.push(rest.slice(0, 3));
    rest = rest.slice(3);
  }
  parts.push(rest);
  return parts.join(' ');
}

export function formatNumber(raw) {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/[^\d+\s()-]/.test(s)) return s; // contains * # , ; or letters
  const plus = s.startsWith('+');
  const d = s.replace(/\D/g, '');
  if (plus) {
    if (d.startsWith('1') && d.length === 11) {
      return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    }
    if (d.length <= 3) return `+${d}`;
    const ccLen = d.length >= 12 ? 3 : d.length === 11 ? 2 : 1;
    return `+${d.slice(0, ccLen)} ${groupRest(d.slice(ccLen))}`;
  }
  if (d.length === 10 && d[0] === '0') return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return groupRest(d);
}

// ---------- names ----------

export function contactName(c) {
  if (!c) return '';
  const full = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return c.name || full || c.company || (c.phoneNumbers && c.phoneNumbers[0] && c.phoneNumbers[0].number) || 'No Name';
}

export function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter((w) => /[A-Za-zÀ-ɏ]/.test(w[0] || ''));
  if (!words.length) return '';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function prettyLabel(label) {
  if (!label) return 'phone';
  const l = String(label).toLowerCase();
  return l === 'cell' ? 'mobile' : l;
}

// ---------- T9 search ----------

const T9 = { a: 2, b: 2, c: 2, d: 3, e: 3, f: 3, g: 4, h: 4, i: 4, j: 5, k: 5, l: 5, m: 6, n: 6, o: 6, p: 7, q: 7, r: 7, s: 7, t: 8, u: 8, v: 8, w: 9, x: 9, y: 9, z: 9 };
const toT9 = (s) => s.toLowerCase().replace(/[a-z]/g, (ch) => String(T9[ch])).replace(/[^0-9]/g, '');

export function t9Search(contacts, typed, limit = 20) {
  const q = (typed || '').replace(/\D/g, '');
  if (q.length < 2) return [];
  const out = [];
  for (const c of contacts) {
    const phones = c.phoneNumbers || [];
    if (!phones.length) continue;
    let hit = phones.find((p) => (p.number || '').replace(/\D/g, '').includes(q));
    if (!hit) {
      const words = contactName(c).split(/\s+/);
      if (words.some((w) => toT9(w).startsWith(q))) hit = phones[0];
    }
    if (hit) {
      out.push({ contact: c, number: hit.number, label: prettyLabel(hit.label) });
      if (out.length >= limit) break;
    }
  }
  return out;
}

// ---------- time ----------

const DAY = 86400000;

export function timeLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startToday) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (ts >= startToday - DAY) return 'Yesterday';
  if (ts >= startToday - 6 * DAY) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: '2-digit' });
}

export function sameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function durationLabel(sec) {
  const s = Math.round(sec || 0);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  return `${h} hour${h === 1 ? '' : 's'} ${m % 60} min`;
}

// ---------- calling ----------

function telUri(number) {
  // keep the leading +, encode # so it isn't treated as a URI fragment
  return 'tel:' + cleanNumber(number).replace(/#/g, '%23');
}

async function ensureCallPermission() {
  if (Platform.OS !== 'android') return false;
  try {
    const perm = PermissionsAndroid.PERMISSIONS.CALL_PHONE;
    if (await PermissionsAndroid.check(perm)) return true;
    const res = await PermissionsAndroid.request(perm);
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// Places the call through Android Telecom (our own call screen takes over when
// this app is the default phone app). Falls back to the system dialer.
export async function placeCall(numberOrUri, accountKey = null) {
  const isVoicemail = numberOrUri.startsWith('voicemail:');
  const number = isVoicemail ? numberOrUri : cleanNumber(numberOrUri);
  if (!number) return false;
  const permitted = await ensureCallPermission();
  if (permitted && Dialer) {
    try {
      await Dialer.placeCall(number, accountKey);
      return true;
    } catch {
      // fall through to intents
    }
  }
  const uri = isVoicemail ? 'voicemail:' : telUri(number);
  if (permitted) {
    try {
      IntentLauncher.startActivityAsync('android.intent.action.CALL', { data: uri }).catch(() => {});
      return true;
    } catch {
      // fall through
    }
  }
  try {
    await Linking.openURL(isVoicemail ? 'tel:' : uri);
    return true;
  } catch {
    return false;
  }
}

export function sendMessage(number) {
  return Linking.openURL('sms:' + cleanNumber(number)).catch(() => {});
}

export function sendEmail(email) {
  return Linking.openURL('mailto:' + email).catch(() => {});
}

export function parseTelUrl(url) {
  if (!url || !/^tel:/i.test(url)) return null;
  try {
    return decodeURIComponent(url.replace(/^tel:(\/\/)?/i, ''));
  } catch {
    return url.replace(/^tel:(\/\/)?/i, '');
  }
}

// Full-size contact photo when available (Android's "image" can be a small thumbnail).
export function contactPhoto(c, large = false) {
  if (!c) return null;
  const raw = c.rawImage && c.rawImage.uri;
  const img = c.image && c.image.uri;
  return large ? raw || img || null : img || raw || null;
}
