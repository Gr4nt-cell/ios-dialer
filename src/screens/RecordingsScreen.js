import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, formatNumber, numberKey } from '../phone';
import { EmptyState, IconButton, SheetHeader } from '../components/ui';
import { Glass } from '../components/Glass';
import Dialer from '../dialer';

export function loadRecordings() {
  if (!Dialer || !Dialer.listRecordings) return [];
  try {
    return JSON.parse(Dialer.listRecordings()) || [];
  } catch {
    return [];
  }
}

function mmss(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function dateLabel(ts) {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function RecordingsScreen({ route }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { resolve } = useData();
  const [items, setItems] = useState(loadRecordings);
  const [current, setCurrent] = useState(null);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  const filterKeys = useMemo(() => (route.numbers ? new Set(route.numbers.map(numberKey)) : null), [route.numbers]);
  const list = filterKeys ? items.filter((r) => filterKeys.has(numberKey(r.number))) : items;

  useEffect(() => {
    if (status.didJustFinish) {
      setCurrent(null);
      try {
        player.seekTo(0);
      } catch {
        // ignore
      }
    }
  }, [status.didJustFinish, player]);

  const toggle = useCallback(
    (rec) => {
      try {
        if (current === rec.name) {
          if (status.playing) player.pause();
          else player.play();
          return;
        }
        player.replace({ uri: rec.uri });
        player.play();
        setCurrent(rec.name);
      } catch (e) {
        Alert.alert('Couldn’t Play Recording', String((e && e.message) || e));
      }
    },
    [current, status.playing, player]
  );

  const remove = (rec) =>
    Alert.alert('Delete Recording?', 'This recording will be removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (current === rec.name) {
            try {
              player.pause();
            } catch {
              // ignore
            }
            setCurrent(null);
          }
          if (Dialer) Dialer.deleteRecording(rec.name);
          setItems(loadRecordings());
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: t.grouped }}>
      <SheetHeader title="Recordings" left={<IconButton glass name="chevron-back" onPress={nav.pop} />} />
      <FlatList
        removeClippedSubviews
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={30}
        data={list}
        keyExtractor={(r) => r.name}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}
        ListEmptyComponent={<EmptyState icon="radio-button-on" title="No Recordings" message="Tap Record during a call to save it here." />}
        renderItem={({ item }) => {
          const match = item.number && item.number !== 'unknown' ? resolve(item.number) : null;
          const title = match ? contactName(match.contact) : item.number && item.number !== 'unknown' ? formatNumber(item.number) : 'Unknown';
          const active = current === item.name;
          const playing = active && status.playing;
          const total = (active && status.duration) || item.duration || 0;
          const pos = active ? status.currentTime || 0 : 0;
          return (
            <Glass radius={20} style={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pressable onPress={() => toggle(item)} hitSlop={6}>
                  <View style={[styles.play, { backgroundColor: t.blue }]}>
                    <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" style={playing ? null : { marginLeft: 2 }} />
                  </View>
                </Pressable>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={{ color: t.secondary, fontSize: 13, marginTop: 1 }}>
                    {dateLabel(item.date)} · {mmss(item.duration)}
                  </Text>
                </View>
                <Pressable onPress={() => remove(item)} hitSlop={10} style={{ paddingLeft: 10 }}>
                  <Ionicons name="trash-outline" size={20} color={t.red} />
                </Pressable>
              </View>
              {active ? (
                <View style={{ marginTop: 10 }}>
                  <View style={[styles.track, { backgroundColor: t.dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)' }]}>
                    <View style={[styles.fill, { backgroundColor: t.blue, width: `${total ? Math.min(100, (pos / total) * 100) : 0}%` }]} />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                    <Text style={{ color: t.secondary, fontSize: 11 }}>{mmss(pos)}</Text>
                    <Text style={{ color: t.secondary, fontSize: 11 }}>-{mmss(total - pos)}</Text>
                  </View>
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
  play: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
});
