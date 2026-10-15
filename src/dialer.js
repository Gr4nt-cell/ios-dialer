import { PermissionsAndroid, Platform } from 'react-native';
import Dialer from '../modules/dialer';

export default Dialer;

// Android CallAudioState routes
export const ROUTE = { EARPIECE: 1, BLUETOOTH: 2, WIRED: 4, SPEAKER: 8 };

export const isSecretCode = (s) => /^\*#\*#[0-9A-Za-z]+#\*#\*$/.test(s || '');
export const isImeiCode = (s) => s === '*#06#';
// *124#, *170*1#, #100# … (but not the codes above)
export const isUssdCode = (s) => /^[*#][0-9*#]*#$/.test(s || '') && !isSecretCode(s) && !isImeiCode(s);

export function parseCallState(json) {
  try {
    const s = JSON.parse(json);
    return { calls: s.calls || [], audio: s.audio || null, recording: s.recording || null };
  } catch {
    return { calls: [], audio: null, recording: null };
  }
}

export function getPhoneAccounts() {
  if (!Dialer) return { accounts: [], defaultKey: null };
  try {
    return JSON.parse(Dialer.getPhoneAccounts());
  } catch {
    return { accounts: [], defaultKey: null };
  }
}

export async function requestPhonePermissions() {
  if (Platform.OS !== 'android') return {};
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted = [P.CALL_PHONE, P.READ_PHONE_STATE, P.READ_CALL_LOG];
  if (Platform.Version >= 33 && P.POST_NOTIFICATIONS) wanted.push(P.POST_NOTIFICATIONS);
  try {
    return await PermissionsAndroid.requestMultiple(wanted.filter(Boolean));
  } catch {
    return {};
  }
}

const LIVE = new Set(['new', 'dialing', 'connecting', 'select_account', 'ringing', 'simulated_ringing', 'active', 'holding', 'disconnecting', 'pulling', 'audio_processing']);
export const isLive = (c) => LIVE.has(c.state);
export const isRinging = (c) => c.state === 'ringing' || c.state === 'simulated_ringing';
