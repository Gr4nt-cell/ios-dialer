import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, formatNumber, numberKey } from '../phone';
import { EmptyState, IconButton, SheetHeader } from '../components/ui';
import { Glass } from '../components/Glass';
import Dialer from '../dialer';
import { useT } from '../i18n';

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
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { resolve } = useData();
  const [items, setItems] = useState(loadRecordings);
  const [current, setCurrent] = useState(null);
  const [status, setStatus] = useState({});
  const lastError = useRef(null);
  const lastSnapshot = useRef(null);
  const fileRevision = useRef(-1);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      try {
        const raw = Dialer?.getRecordingPlayback?.() || '{}';
        if (raw === lastSnapshot.current) return;
        lastSnapshot.current = raw;
        const next = JSON.parse(raw);
        if (!mounted) return;
        setStatus(next);
        if (next.error && lastError.current !== next.error) {
          lastError.current = next.error;
          setCurrent(null);
          Alert.alert(tr('Couldn’t Play Recording'), tr(next.error));
        }
      } catch { /* A missing module is reported when Play is pressed. */ }
    };
    refresh();
    const timer = setInterval(refresh, 250);
    // Refresh completed MP3 conversions without requiring the screen to be reopened.
    const files = setInterval(() => {
      try {
        // Keep the active row available if conversion publishes an MP3 mid-playback.
        const playback = JSON.parse(lastSnapshot.current || '{}');
        if (playback.playing || playback.loading) return;
        const revision = Dialer?.getRecordingRevision?.() || 0;
        if (mounted && revision !== fileRevision.current) {
          fileRevision.current = revision;
          setItems(loadRecordings());
        }
      } catch {}
    }, 1500);
    return () => {
      mounted = false;
      clearInterval(timer);
      clearInterval(files);
      try { Dialer?.stopRecordingPlayback?.(); } catch {}
    };
  }, []);

  const filterKeys = useMemo(() => (route.numbers ? new Set(route.numbers.map(numberKey)) : null), [route.numbers]);
  const list = filterKeys ? items.filter((r) => filterKeys.has(numberKey(r.number))) : items;

  const toggle = useCallback((rec) => {
    try {
      lastError.current = null;
      lastSnapshot.current = null;
      if (!Dialer?.playRecording) throw new Error(tr('Install the updated app to play saved recordings.'));
      if (current === rec.name && status.name === rec.name) {
        if (status.loading) return;
        if (status.playing) Dialer.pauseRecordingPlayback();
        else Dialer.resumeRecordingPlayback();
        return;
      }
      if (!Dialer.playRecording(rec.name)) throw new Error(tr('This recording is missing or empty.'));
      setStatus({ name: rec.name, loading: true });
      setCurrent(rec.name);
    } catch (e) {
      Alert.alert(tr('Couldn’t Play Recording'), String(e?.message || e));
    }
  }, [current, status.name, status.loading, status.playing, tr]);

  const remove = (rec) =>
    Alert.alert(tr('Delete Recording?'), tr('This recording will be removed from this phone.'), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Delete'),
        style: 'destructive',
        onPress: () => {
          if (current === rec.name) {
            try {
              Dialer?.stopRecordingPlayback?.();
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
    <View style={{ flex: 1 }}>
      <SheetHeader title={tr('Recordings')} left={<IconButton glass name="chevron-back" onPress={nav.pop} />} />
      <FlatList
        removeClippedSubviews
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={30}
        data={list}
        keyExtractor={(r) => r.name}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 10 }}
        ListEmptyComponent={<EmptyState icon="radio-button-on" title={tr('No Recordings')} message={tr('Tap Record during a call to save it here.')} />}
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
                    <Ionicons name={active && status.loading ? 'hourglass-outline' : playing ? 'pause' : 'play'} size={18} color="#fff" style={playing ? null : { marginLeft: 2 }} />
                  </View>
                </Pressable>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: t.text, fontSize: fs(16), fontWeight: '600' }} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={{ color: t.secondary, fontSize: fs(13), marginTop: 1 }}>
                    {dateLabel(item.date)} · {mmss(item.duration)} · {(item.format || item.name.split('.').pop()).toUpperCase()}
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
                    <Text style={{ color: t.secondary, fontSize: fs(11) }}>{mmss(pos)}</Text>
                    <Text style={{ color: t.secondary, fontSize: fs(11) }}>-{mmss(total - pos)}</Text>
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
