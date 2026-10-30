import React from 'react';
import { Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { useBottomSpace } from '../device';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { formatNumber } from '../phone';
import { IconButton, LargeHeader } from '../components/ui';
import { Glass } from '../components/Glass';
import { useT } from '../i18n';

export default function VoicemailScreen() {
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useBottomSpace();
  const nav = useNav();
  const { callVoicemail, settings, recents } = useData();
  const voicemailCalls = recents.filter((g) => g.type === 'voicemail').slice(0, 20);

  return (
    <View style={{ flex: 1, paddingBottom: tabBarSpace + insets.bottom }}>
      <LargeHeader title={tr('Voicemail')} right={<IconButton glass name="settings-outline" onPress={() => nav.push({ name: 'settings' })} />} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
        <Glass strong vivid radius={42} style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="recording-outline" size={44} color={t.secondary} />
        </Glass>
        <Text style={{ color: t.text, fontSize: fs(22), fontWeight: '700', marginTop: 18 }}>{tr('Voicemail')}</Text>
        <Text style={{ color: t.secondary, fontSize: fs(15), textAlign: 'center', marginTop: 6, lineHeight: fs(21) }}>
          Listen to your messages by calling your carrier’s voicemail
          {settings.voicemailNumber ? ` at ${formatNumber(settings.voicemailNumber)}` : ''}.
        </Text>
        {voicemailCalls.length ? (
          <Text style={{ color: t.secondary, fontSize: fs(13), marginTop: 10 }}>
            {voicemailCalls.length} recent voicemail {voicemailCalls.length === 1 ? 'call' : 'calls'} in Recents
          </Text>
        ) : null}
        <Pressable onPress={callVoicemail} style={{ marginTop: 26, alignSelf: 'stretch' }}>
          {({ pressed }) => (
            <Glass radius={16} pressed={pressed} tint={t.blue} tintOpacity={0.9} style={{ paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
              <Ionicons name="call" size={18} color="#fff" />
              <Text style={{ color: '#fff', fontSize: fs(17), fontWeight: '600', marginLeft: 8 }}>{tr('Call Voicemail')}</Text>
            </Glass>
          )}
        </Pressable>
        <Text style={{ color: t.secondary, fontSize: fs(13), textAlign: 'center', marginTop: 14 }}>{tr('Tip: press and hold 1 on the keypad to call voicemail.')}</Text>
      </View>
    </View>
  );
}
