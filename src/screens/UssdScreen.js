import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import Dialer, { getPhoneAccounts } from '../dialer';
import { placeCall } from '../phone';
import { IconButton, Segmented, SheetHeader } from '../components/ui';

const FAILURES = {
  '-1': 'The network couldn’t complete this request.',
  '-2': 'The USSD service isn’t available right now.',
  '-100': 'This Android version can’t show USSD replies in apps.',
};

// Numbered options such as "1. Balance" or "2) Bundles" mean the network expects a reply.
const looksLikeMenu = (text) => /(^|\n)\s*\d{1,2}\s*[.):-]/.test(text || '');

export default function UssdScreen({ route }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const code = route.code;
  const { accounts, defaultKey } = useMemo(() => getPhoneAccounts(), []);
  const [account, setAccount] = useState(defaultKey || (accounts[0] && accounts[0].key) || null);
  const [status, setStatus] = useState('running');
  const [message, setMessage] = useState('');

  const run = useCallback(
    async (key) => {
      if (!Dialer) {
        nav.pop();
        placeCall(code);
        return;
      }
      setStatus('running');
      setMessage('');
      try {
        const res = await Dialer.sendUssd(code, key || null);
        if (res && res.ok) {
          setStatus('done');
          setMessage(res.message || '');
        } else {
          setStatus('error');
          setMessage(FAILURES[String(res && res.code)] || 'The network couldn’t complete this request.');
        }
      } catch (e) {
        setStatus('error');
        setMessage(e && e.message ? e.message : 'Couldn’t run this code.');
      }
    },
    [code, nav]
  );

  useEffect(() => {
    run(account);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openMenu = () => {
    nav.pop();
    placeCall(code, account);
  };

  const menu = status === 'done' && looksLikeMenu(message);

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader title={code} right={<IconButton prominent name="checkmark" onPress={nav.pop} />} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {accounts.length > 1 ? (
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Segmented
              options={accounts.slice(0, 3).map((a) => ({ label: a.label, value: a.key }))}
              value={account}
              onChange={(k) => {
                setAccount(k);
                run(k);
              }}
            />
          </View>
        ) : null}

        <View style={{ backgroundColor: t.card, borderRadius: 16, padding: 18, minHeight: 140, justifyContent: 'center' }}>
          {status === 'running' ? (
            <View style={{ alignItems: 'center' }}>
              <ActivityIndicator color={t.secondary} />
              <Text style={{ color: t.secondary, fontSize: 15, marginTop: 12 }}>Running {code}…</Text>
            </View>
          ) : (
            <View>
              {status === 'error' ? <Ionicons name="alert-circle" size={26} color={t.orange} style={{ marginBottom: 8 }} /> : null}
              <Text selectable style={{ color: t.text, fontSize: 17, lineHeight: 24 }}>
                {message || 'No reply from the network.'}
              </Text>
            </View>
          )}
        </View>

        {status !== 'running' ? (
          <View style={{ marginTop: 18, gap: 10 }}>
            {menu || status === 'error' ? (
              <Pressable onPress={openMenu}>
                {({ pressed }) => (
                  <View style={{ backgroundColor: t.blue, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.75 : 1 }}>
                    <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>{menu ? 'Reply to Menu' : 'Try in Network Dialog'}</Text>
                  </View>
                )}
              </Pressable>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => run(account)} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View style={{ backgroundColor: t.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: pressed ? 0.6 : 1 }}>
                    <Text style={{ color: t.blue, fontSize: 17 }}>Run Again</Text>
                  </View>
                )}
              </Pressable>
              <Pressable onPress={() => Clipboard.setStringAsync(message)} disabled={!message} style={{ flex: 1 }}>
                {({ pressed }) => (
                  <View style={{ backgroundColor: t.card, borderRadius: 14, paddingVertical: 14, alignItems: 'center', opacity: pressed || !message ? 0.6 : 1 }}>
                    <Text style={{ color: t.blue, fontSize: 17 }}>Copy</Text>
                  </View>
                )}
              </Pressable>
            </View>
            {menu ? (
              <Text style={{ color: t.secondary, fontSize: 13, textAlign: 'center', marginTop: 4, lineHeight: 18 }}>
                Menus that need a reply open in the network’s own dialog, where you can type your choice.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
