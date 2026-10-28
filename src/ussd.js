import { Alert } from 'react-native';
import Dialer, { runUssd } from './dialer';

/**
 * Runs a USSD code while a call is in progress, and shows what came back.
 *
 * With no call up, a code is placed like an ordinary call so the network's own
 * dialog handles it — that path is elsewhere and unchanged. This one exists
 * because Telecom won't place a second call, so mid-call the code has to go
 * through the radio, and the reply has to be shown by the app.
 *
 * Networks differ on whether they accept USSD during a call at all, so a
 * failure offers to park the call first: on hold the radio is free and the
 * same code often goes through.
 */
export async function runUssdDuringCall(code, call, tr, { afterHold } = {}) {
  const r = await runUssd(code, call && call.accountKey);
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
        const again = await runUssd(code, call.accountKey);
        if (again.ok) {
          Alert.alert(code, `${again.message || tr('No reply from the network.')}\n\n${tr('Your call is on hold — resume it from the call screen.')}`);
        } else {
          Alert.alert(tr('Couldn’t Run the Code'), `${tr('It didn’t go through on hold either. Try again after the call.')}\n\n${tr('Your call is on hold — resume it from the call screen.')}`);
        }
        afterHold?.(again);
      },
    });
  }
  buttons.push({ text: tr('OK'), style: 'cancel' });

  Alert.alert(tr('Couldn’t Run the Code'), canHold ? `${body} ${tr('Putting it on hold often lets the code through.')}` : body, buttons);
  return r;
}
