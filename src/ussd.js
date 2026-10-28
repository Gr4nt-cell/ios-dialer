import { Alert } from 'react-native';
import Dialer, { runUssd } from './dialer';
import { placeCall } from './phone';

/**
 * Runs a USSD code the way the operator expects, whether or not a call is up.
 *
 * The code is placed like a call, which hands it to the telephony stack and
 * brings up the operator's own USSD dialog. That dialog is the only thing that
 * keeps the session open, so a menu — "1 Balance, 2 Data" — can be answered.
 * Asking the radio directly instead gets a single reply and no session, which
 * is why a menu code came back with "Your choice was incorrect": the network
 * was answering a question nobody could reply to.
 *
 * During a call the code goes out on that call's SIM. If Telecom refuses the
 * request outright, the direct radio route is tried rather than leaving the
 * code unsent, and only then is anything reported here.
 */
export async function runUssdThroughOperator(code, call, tr) {
  const accountKey = (call && call.accountKey) || null;

  try {
    const placed = await placeCall(code, accountKey);
    if (placed) return { ok: true, via: 'operator' };
  } catch {
    // fall through to the radio
  }

  const r = await runUssd(code, accountKey);
  if (r.ok) {
    Alert.alert(code, r.message || tr('No reply from the network.'));
    return r;
  }

  const body =
    r.reason === 'unavailable' ? tr('The network didn’t accept the code while a call is in progress.')
    : r.reason === 'permission' ? tr('Phone permission is needed to run USSD codes.')
    : r.reason === 'unsupported' ? tr('This phone can’t run USSD codes during a call.')
    : r.reason === 'timeout' ? tr('The network didn’t answer.')
    : tr('The network turned the code down while the call is connected.');

  const canHold = !!(call && call.canHold && call.state === 'active' && Dialer && Dialer.hold);
  const buttons = [];
  if (canHold) {
    buttons.push({
      text: tr('Hold Call & Retry'),
      onPress: async () => {
        try {
          Dialer.hold(call.id, true);
        } catch {
          // carry on; the retry is worth a try either way
        }
        await new Promise((resolve) => setTimeout(resolve, 1400));
        try {
          const placed = await placeCall(code, accountKey);
          if (placed) return;
        } catch {
          // fall through to the radio
        }
        const again = await runUssd(code, accountKey);
        const tail = tr('Your call is on hold — resume it from the call screen.');
        if (again.ok) Alert.alert(code, `${again.message || tr('No reply from the network.')}\n\n${tail}`);
        else Alert.alert(tr('Couldn’t Run the Code'), `${tr('It didn’t go through on hold either. Try again after the call.')}\n\n${tail}`);
      },
    });
  }
  buttons.push({ text: tr('OK'), style: 'cancel' });

  Alert.alert(tr('Couldn’t Run the Code'), canHold ? `${body} ${tr('Putting it on hold often lets the code through.')}` : body, buttons);
  return r;
}
