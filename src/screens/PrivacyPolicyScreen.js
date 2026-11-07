import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { useNav } from '../nav';
import { IconButton, SheetHeader, TextButton } from '../components/ui';
import { Glass } from '../components/Glass';
import { useT } from '../i18n';

const POLICY_URL = 'https://github.com/Gr4nt-cell/ios-dialer/blob/main/PRIVACY.md';

// Same text as PRIVACY.md in the repository (kept in the app because the app has no internet).
const SECTIONS = [
  {
    title: 'The short version',
    body: [
      'Everything stays on your phone. The app has no internet access, no accounts, no ads, no analytics and no tracking. It doesn’t collect, upload, sell or share any of your information, with us or with anyone else.',
    ],
  },
  {
    title: 'What the app accesses, and why',
    items: [
      ['Phone calls', 'To place, answer, hold, merge and end calls, choose a SIM, run USSD codes and show the call screen.'],
      ['Call log', 'To show your recent calls and call statistics, and to remove calls you delete.'],
      ['Contacts', 'To show your contacts, put names and photos on calls, and add or edit contacts when you ask.'],
      ['Camera and photos', 'Only when you choose to take or pick a contact photo.'],
      ['Notifications', 'To show incoming and ongoing calls with answer, decline and hang-up buttons.'],
      ['Vibration and wake lock', 'To vibrate for incoming calls and turn the screen off when the phone is at your ear.'],
      ['Display over other apps', 'Optional. Shows calls on a rear or cover screen, where the phone allows it.'],
      [
        'Accessibility service (Call Island)',
        'Optional, off until you turn it on. Used only to draw the call pill around the selfie camera and let you tap it. It doesn’t read, collect or store anything on your screen or from other apps.',
      ],
    ],
  },
  {
    title: 'What is stored, and where',
    body: [
      'Settings, favourites and blocked numbers are kept in the app’s private storage.',
      'Contacts and call history stay in Android’s own contacts and call-log databases. The app reads them and changes them only when you ask.',
      'Contact photos are read from the phone’s contacts and displayed on the call screen when enabled. When Depth Effect is on, Google Play services provides an on-device subject-segmentation model. The photo is processed on your phone and is not uploaded; Google Play services may download the model when needed.',
      'The app is excluded from Android cloud backups, so settings aren’t copied to Google Drive or any other backup service.',
    ],
  },
  {
    title: 'No internet, no sharing',
    body: [
      'The app doesn’t have Android’s internet permission, so it can’t send data off your phone.',
      'There are no analytics, crash reporting, advertising or tracking libraries, and no data is sold, shared or transferred to third parties.',
      'Some actions hand you over to another app you choose, such as WhatsApp, Messages or the share sheet. What happens next is covered by that app’s privacy policy. Calls themselves are carried by your mobile network, as with any phone app.',
    ],
  },
  {
    title: 'Your controls',
    body: [
      'In Settings › Privacy you can hide who is calling on the lock screen or block screenshots.',
      'You can delete calls from Recents and remove any permission in Android’s settings. Uninstalling the app deletes its local settings.',
    ],
  },
  {
    title: 'Children',
    body: ['The app isn’t directed at children and doesn’t knowingly collect information from anyone, including children under 13.'],
  },
  {
    title: 'Changes',
    body: [
      'If this policy changes, the new version will be published with a new “Last updated” date. The app will never start collecting or sharing data without updating this policy first.',
    ],
  },
];

export default function PrivacyPolicyScreen() {
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  return (
    <View style={{ flex: 1 }}>
      <SheetHeader title={tr('Privacy Policy')} left={<IconButton glass name="chevron-back" onPress={nav.pop} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }}>
        <Text style={{ color: t.secondary, fontSize: fs(13), marginHorizontal: 4 }}>Phone (com.gr4nt.dialer) · Last updated 7 November 2026</Text>
        {SECTIONS.map((sec) => (
          <Glass key={sec.title} radius={20} style={{ padding: 16 }}>
            <Text style={{ color: t.text, fontSize: fs(17), fontWeight: '700', marginBottom: 8 }}>{sec.title}</Text>
            {(sec.body || []).map((p, i) => (
              <Text key={i} style={{ color: t.text, fontSize: fs(15), lineHeight: fs(21), marginTop: i ? 8 : 0 }}>
                {p}
              </Text>
            ))}
            {(sec.items || []).map(([k, v], i) => (
              <View key={k} style={{ marginTop: i ? 10 : 0 }}>
                <Text style={{ color: t.text, fontSize: fs(15), fontWeight: '600' }}>{k}</Text>
                <Text style={{ color: t.secondary, fontSize: fs(14), lineHeight: fs(20), marginTop: 1 }}>{v}</Text>
              </View>
            ))}
          </Glass>
        ))}
        <View style={{ alignItems: 'center', marginTop: 4 }}>
          <TextButton title={tr('View Online')} onPress={() => Linking.openURL(POLICY_URL).catch(() => {})} />
        </View>
      </ScrollView>
    </View>
  );
}
