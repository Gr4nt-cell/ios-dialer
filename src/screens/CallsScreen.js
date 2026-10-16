import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_SPACE, useTheme } from '../theme';
import { isMissedType, useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, contactPhoto, formatNumber, initials, sameDay } from '../phone';
import { gradientFor } from '../gradients';
import { EmptyState, IconButton, LargeHeader, TextButton } from '../components/ui';
import { Glass } from '../components/Glass';
import { useActionSheet } from '../components/ActionSheet';
import { RecentRow } from './RecentsScreen';
import ContactCard from '../components/ContactCard';
import DateStrip, { startOfDay } from '../components/DateStrip';
import { computeStats, formatDuration } from '../stats';
import { useT } from '../i18n';

const FILTERS = [
  { value: 'all', label: 'All Calls', icon: 'call-outline' },
  { value: 'missed', label: 'Missed', icon: 'arrow-down-outline' },
  { value: 'voicemail', label: 'Voicemail', icon: 'recording-outline' },
  { value: 'unknown', label: 'Unknown Callers', icon: 'help-circle-outline' },
];

const CARD_W = 104;
const CARD_H = 140;

function FavoritesRow() {
  const t = useTheme();
  const nav = useNav();
  const { favorites, findContact, call } = useData();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 8, gap: 10 }}>
      {favorites.map((f) => {
        const contact = f.contactId ? findContact(f.contactId) : null;
        const name = contact ? contactName(contact) : f.name || formatNumber(f.number);
        return (
          <ContactCard
            key={f.id}
            overlay
            width={CARD_W}
            height={CARD_H}
            name={name}
            label={f.label || 'phone'}
            image={contactPhoto(contact, true)}
            colorKey={contact ? contact.id : f.number}
            onPress={() => call(f.number)}
            onLongPress={() => nav.push({ name: 'contact', contactId: contact ? contact.id : null, number: f.number })}
          />
        );
      })}
      <Pressable onPress={() => nav.push({ name: 'pickFavorite' })}>
        {({ pressed }) => (
          <Glass radius={22} pressed={pressed} style={{ width: favorites.length ? 64 : CARD_W, height: CARD_H, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="add" size={30} color={t.blue} />
            <Text style={{ color: t.secondary, fontSize: 12, marginTop: 4 }}>{favorites.length ? 'Add' : 'Favorites'}</Text>
          </Glass>
        )}
      </Pressable>
    </ScrollView>
  );
}

// Gentle message for days without calls.
function DayMessage({ icon, text }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 40, paddingTop: 44 }}>
      <Glass radius={30} style={{ width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={26} color={t.blue} />
      </Glass>
      <Text style={{ color: t.secondary, fontSize: 17, fontWeight: '500', marginTop: 16, textAlign: 'center', lineHeight: 24 }}>{text}</Text>
    </View>
  );
}

export default function CallsScreen() {
  const tr = useT();
  const t = useTheme();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const sheet = useActionSheet();
  const { recents, resolve, markRecentsSeen, deleteCalls, callVoicemail, favorites } = useData();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    markRecentsSeen();
  }, [recents.length, markRecentsSeen]);

  const typed = recents.filter((g) => {
    if (filter === 'missed') return isMissedType(g.type);
    if (filter === 'voicemail') return g.type === 'voicemail';
    if (filter === 'unknown') return !resolve(g.number);
    return true;
  });
  // days that have calls get a dot in the date strip
  const marked = useMemo(() => new Set(typed.map((g) => new Date(g.date).toDateString())), [typed]);
  const list = typed.filter((g) => sameDay(g.date, day));
  const today = startOfDay(new Date());
  const isFuture = day > today;
  const isToday = day.getTime() === today.getTime();

  const current = FILTERS.find((f) => f.value === filter);

  // headline figures for the Statistics button
  const statsLine = useMemo(() => {
    const month = computeStats(recents.flatMap((g) => g.calls), 'month');
    return `${month.total} calls · ${formatDuration(month.talkSeconds)} this month`;
  }, [recents]);

  const chooseFilter = () =>
    sheet.show({
      title: tr('Show'),
      options: FILTERS.map((f) => ({ text: `${tr(f.label)}${f.value === filter ? '  ✓' : ''}`, onPress: () => setFilter(f.value) })),
    });

  const clear = () =>
    Alert.alert(tr('Clear Calls?'), tr('This removes these calls from your history.'), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Clear'),
        style: 'destructive',
        onPress: () => {
          deleteCalls(list.flatMap((g) => g.calls));
          setEditing(false);
        },
      },
    ]);

  const header = (
    <LargeHeader
      title={filter === 'all' ? tr('Calls') : tr(current.label)}
      left={<IconButton glass name="filter" onPress={chooseFilter} color={filter === 'all' ? t.text : t.blue} />}
      right={
        editing ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextButton glass title={tr('Clear')} color={t.red} onPress={clear} disabled={!list.length} />
            <TextButton prominent title={tr('Done')} onPress={() => setEditing(false)} />
          </View>
        ) : (
          <TextButton glass title={tr('Edit')} onPress={() => setEditing(true)} disabled={!list.length} />
        )
      }
    >
      {filter === 'all' && !editing ? (
        <Pressable onPress={() => nav.push({ name: 'statistics' })} style={{ marginHorizontal: 16, marginBottom: 12 }}>
          {({ pressed }) => (
            <Glass radius={22} pressed={pressed} style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.chartOther, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="stats-chart" size={19} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>{tr('Statistics')}</Text>
                <Text style={{ color: t.secondary, fontSize: 12 }} numberOfLines={1}>{statsLine}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.tertiary} />
            </Glass>
          )}
        </Pressable>
      ) : null}
      {filter === 'all' && !editing ? (
        <View style={{ marginBottom: 8 }}>
          {favorites.length ? <Text style={[styles.section, { color: t.text }]}>{tr('Favorites')}</Text> : null}
          <FavoritesRow />
        </View>
      ) : null}
      {filter === 'voicemail' ? (
        <Pressable onPress={callVoicemail} style={{ marginHorizontal: 16, marginBottom: 10 }}>
          {({ pressed }) => (
            <Glass radius={22} pressed={pressed} style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
              <Ionicons name="recording" size={22} color={t.blue} />
              <Text style={{ color: t.text, fontSize: 17, marginLeft: 10, flex: 1 }}>{tr('Call Voicemail')}</Text>
              <Ionicons name="chevron-forward" size={18} color={t.tertiary} />
            </Glass>
          )}
        </Pressable>
      ) : null}
      <Text style={[styles.section, { color: t.text }]}>{tr('Recent')}</Text>
      <DateStrip value={day} onChange={setDay} marked={marked} />
      <View style={{ height: 8 }} />
    </LargeHeader>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        removeClippedSubviews
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={30}
        data={list}
        keyExtractor={(g) => g.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <RecentRow group={item} showTime editing={editing} onDelete={() => deleteCalls(item.calls)} />}
        ListEmptyComponent={
          isFuture ? (
            <DayMessage icon="sparkles" text={tr('Looking forward to what the future brings ♡')} />
          ) : isToday ? (
            <EmptyState icon={current.icon} title={filter === 'all' ? tr('No Calls Yet Today') : `${tr('No')} ${tr(current.label)}`} message={filter === 'all' ? tr('Calls you make and receive today will appear here.') : undefined} />
          ) : filter === 'all' ? (
            <DayMessage icon="leaf" text={tr('A quiet day, I hope you learnt something from the past')} />
          ) : (
            <EmptyState icon={current.icon} title={`${tr('No')} ${tr(current.label)}`} message={tr('Nothing like that on this day.')} />
          )
        }
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom + 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: CARD_W, height: CARD_H, borderRadius: 22, overflow: 'hidden', backgroundColor: '#222' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 64 },
  cardText: { position: 'absolute', left: 10, right: 8, bottom: 9 },
  section: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8, marginTop: 4 },
});
