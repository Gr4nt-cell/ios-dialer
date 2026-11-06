import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import Dialer from './dialer';

let pendingRequest = null;

export async function hasRecordingPermission() {
  if (Platform.OS === 'android') return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return !!(await getRecordingPermissionsAsync()).granted;
}

function showPermissionHelp(blocked) {
  Alert.alert('Microphone Access Needed', blocked
    ? 'Microphone permission is blocked. Open Settings, choose Permissions → Microphone → Allow while using the app, then return and tap Record again.'
    : 'Microphone access was not granted. Tap Record to try again, or allow Microphone in the app’s settings. Also check that Android’s microphone privacy switch is on.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => Alert.alert('Open Settings', 'Open Android Settings → Apps → Phone → Permissions → Microphone.')) },
  ]);
}

// Use the same Android permission checked by the native recorder. Never start
// capture on a denial, and never raise a permission dialog for background auto-record.
export async function ensureRecordingPermission({ request = true, notify = true } = {}) {
  try {
    if (Platform.OS === 'android') {
      const installed = Dialer?.getRecordingPermissionStatus?.();
      if (installed?.declared === false) {
        if (notify) Alert.alert('App Update Required', 'This installed build does not declare microphone permission. Install the rebuilt Phone app, then tap Microphone Access again. Android Settings cannot add a permission missing from the APK.');
        return false;
      }
    }
    if (await hasRecordingPermission()) return true;
    if (!request) return false;
    if (!pendingRequest) {
      pendingRequest = (async () => {
        if (Platform.OS === 'android') {
          const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
            title: 'Microphone Access',
            message: 'Allow microphone access to record calls after the spoken announcement.',
            buttonPositive: 'Continue',
            buttonNegative: 'Cancel',
          });
          return { granted: status === PermissionsAndroid.RESULTS.GRANTED, blocked: status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN };
        }
        const permission = await requestRecordingPermissionsAsync();
        return { granted: permission.granted, blocked: permission.canAskAgain === false };
      })().finally(() => { pendingRequest = null; });
    }
    const permission = await pendingRequest;
    const granted = !!permission.granted && await hasRecordingPermission();
    if (!granted && notify) showPermissionHelp(permission.blocked);
    return granted;
  } catch (error) {
    if (notify) Alert.alert('Couldn’t Check Microphone Access', error?.message || 'Try allowing Microphone in Android app settings.');
    return false;
  }
}
