import { PermissionsAndroid, Platform } from 'react-native';
import Dialer from '../modules/dialer';

export default Dialer;

// Android CallAudioState routes
export const ROUTE = { EARPIECE: 1, BLUETOOTH: 2, WIRED: 4, SPEAKER: 8 };

export const isSecretCode = (s) => /^\*#\*#[0-9A-Za-z]+#\*#\*$/.test(s || '');
export const isImeiCode = (s) => s === '*#06#';
// *124#, *170*1#, #100# … (but not the codes above)
export const isUssdCode = (s) => /^[*#][0-9*#]*#$/.test(s || '') && !isSecretCode(s) && !isImeiCode(s);

/**
 * Runs a USSD code through the radio rather than by placing a call.
 *
 * Placing a call is the better route normally, because the network's own
 * dialog then handles the reply and any menu that follows. But Telecom won't
 * place a second call while one is up, which is why a code typed during a
 * call did nothing at all — so mid-call this asks the radio directly and
 * hands back the reply for the app to show.
 *
 * One honest limit: Android has no API to answer a USSD menu this way, so a
 * code that replies with "1. Balance 2. Data" can be read but not replied to
 * until the call ends.
 *
 * Resolves { ok: true, message } or { ok: false, reason }.
 */
export async function runUssd(code, accountKey = null) {
  if (!Dialer || !Dialer.sendUssd) return { ok: false, reason: 'unsupported' };
  let r;
  try {
    // The native side settles only when the network answers, and a network
    // that never answers would leave the button stuck on "Running…".
    r = await Promise.race([
      Dialer.sendUssd(code, accountKey || null),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, code: -200 }), 30000)),
    ]);
  } catch {
    return { ok: false, reason: 'permission' };
  }
  if (r && r.ok) return { ok: true, message: r.message || '' };
  // -100/-101/-102/-103 are ours (too old an Android, no telephony, refused,
  // threw); -1 and -2 are TelephonyManager's RETURN_FAILURE and SERVICE_UNAVAIL.
  const failure = r && typeof r.code === 'number' ? r.code : -1;
  const reason =
    failure === -100 || failure === -101 ? 'unsupported'
    : failure === -102 ? 'permission'
    : failure === -2 ? 'unavailable'
    : failure === -200 ? 'timeout'
    : 'failed';
  return { ok: false, reason, failure, tried: (r && r.tried) || null };
}

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
