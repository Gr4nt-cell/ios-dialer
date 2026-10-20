import React, { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, formatNumber } from '../phone';
import { EmptyState, IconButton, SheetHeader } from '../components/ui';
import { Glass } from '../components/Glass';
import Dialer from '../dialer';
import { useT } from '../i18n';

export function loadTranscripts() {
  if (!Dialer || !Dialer.screeningTranscripts) return [];
  try {
    return JSON.parse(Dialer.screeningTranscripts()) || [];
  } catch {
    return [];
  }
}

function when(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/** Calls the app screened, with what the caller said. Stored only on this phone. */
export default function ScreenedCallsScreen() {
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { resolve, call } = useData();
  const [items, setItems] = useState(loadTranscripts);
  const [open, setOpen] = useState(null);

  const remove = (item) =>
    Alert.alert(tr('Delete Transcript?'), tr('This transcript will be removed from this phone.'), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Delete'),
        style: 'destructive',
        onPress: () => {
          if (Dialer && Dialer.deleteTranscript) Dialer.deleteTranscript(item.file);
          setItems(loadTranscripts());
        },
      },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader title={tr('Screened Calls')} left={<IconButton glass name="chevron-back" onPress={nav.pop} />} />
      <FlatList
        data={items}
        keyExtractor={(x) => x.file}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}
        ListEmptyComponent={
          <EmptyState icon="chatbubbles-outline" title={tr('No Screened Calls')} message={tr('Tap Screen when a call comes in, and what the caller says appears here.')} />
        }
        renderItem={({ item }) => {
          const match = item.number ? resolve(item.number) : null;
          const title = match ? contactName(match.contact) : item.name || (item.number ? formatNumber(item.number) : tr('No Caller ID'));
          const spam = (item.spam || 0) >= 0.6;
          const expanded = open === item.file;
          return (
            <Glass radius={20} style={{ padding: 14 }}>
              <Pressable onPress={() => setOpen(expanded ? null : item.file)}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: spam ? t.red : t.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={{ color: t.secondary, fontSize: 13, marginTop: 1 }}>{when(item.at)}</Text>
                  </View>
                  {item.number ? (
                    <Pressable onPress={() => call(item.number)} hitSlop={8} style={{ paddingHorizontal: 8 }}>
                      <Ionicons name="call-outline" size={20} color={t.blue} />
                    </Pressable>
                  ) : null}
                  <Pressable onPress={() => remove(item)} hitSlop={8} style={{ paddingLeft: 6 }}>
                    <Ionicons name="trash-outline" size={20} color={t.red} />
                  </Pressable>
                </View>
                {item.summary ? (
                  <Text style={{ color: spam ? t.red : t.text, fontSize: 14, marginTop: 8 }} numberOfLines={expanded ? 0 : 2}>
                    {item.summary}
                  </Text>
                ) : null}
              </Pressable>
              {expanded ? (
                <View style={{ marginTop: 10, gap: 6 }}>
                  {(item.lines || []).map((l, i) => (
                    <View key={i} style={[styles.bubble, l.who === 'caller' ? { alignSelf: 'flex-start', backgroundColor: t.dark ? '#2C2C2E' : '#E9E9EB' } : { alignSelf: 'flex-end', backgroundColor: t.blue }]}>
                      <Text style={{ color: l.who === 'caller' ? t.text : '#fff', fontSize: 14 }}>{l.text}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </Glass>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '86%', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16 },
});
