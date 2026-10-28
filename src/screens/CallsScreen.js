import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Animated, FlatList, StyleSheet, Text, View } from 'react-native';
import { usePaneSize, useBottomSpace } from '../device';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { isMissedType, useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, contactPhoto, formatNumber, sameDay } from '../phone';
import { EmptyState, IconButton, LargeHeader, TextButton } from '../components/ui';
import { EXTENDED_BLUR, Glass } from '../components/Glass';
import { useActionSheet } from '../components/ActionSheet';
import { RecentRow } from './RecentsScreen';
import ContactCard from '../components/ContactCard';
import DateStrip, { startOfDay } from '../components/DateStrip';
import Wheel from '../components/Wheel';
import { useT } from '../i18n';

const FILTERS = [
  { value: 'all', label: 'All Calls', icon: 'call-outline' },
  { value: 'missed', label: 'Missed', icon: 'arrow-down-outline' },
  { value: 'voicemail', label: 'Voicemail', icon: 'recording-outline' },
  { value: 'unknown', label: 'Unknown Callers', icon: 'help-circle-outline' },
];

// Favourite cards match the contact grid card: four across, same proportions.
const SIDE = 16;
const GRID_GAP = 12;
const COLUMNS = 4;
const cardWidth = (w) => Math.floor((w - SIDE * 2 - GRID_GAP * (COLUMNS - 1)) / COLUMNS);

// The carousel shows exactly five cards, and the two outer ones end flush with
// the date strip below. Cards sit centred in slots of SLOT, so the outer card's
// centre is 2 slots from the middle and it is drawn at OUTER_SCALE:
//
//   viewport/2 - 2*SLOT = OUTER_SCALE * CARD_W / 2   (its left edge at 0)
//   => SLOT = (viewport - OUTER_SCALE * CARD_W) / 4
//
// The slots themselves overflow the viewport; the shrunken cards inside them do
// not, which is what makes the outer edges land on the strip's edges.
const OUTER_SCALE = 0.66;
const slotWidth = (viewport, card) => (viewport - OUTER_SCALE * card) / 4;

function FavoritesRow() {
  const t = useTheme();
  const nav = useNav();
  const tr = useT();
  const { width } = usePaneSize();
  const { favorites, findContact, call } = useData();

  const VIEWPORT = width - SIDE * 2;  // exactly the date strip's width
  const CARD_W = cardWidth(width);
  const CARD_H = Math.round(CARD_W * 1.32);
  const SLOT = slotWidth(VIEWPORT, CARD_W);
  const ROW_H = CARD_H + 16;

  // Stable across renders, so scrolling never re-renders the cards.
  const renderCard = useCallback(
    ({ item, animated }) => {
      const contact = item.contactId ? findContact(item.contactId) : null;
      const name = contact ? contactName(contact) : item.name || formatNumber(item.number);
      return (
        <Animated.View style={[{ width: SLOT, alignItems: 'center', justifyContent: 'center', height: ROW_H }, animated]}>
          <ContactCard
            overlay
            width={CARD_W}
            height={CARD_H}
            name={name}
            label={item.label || 'phone'}
            image={contactPhoto(contact, true)}
            colorKey={contact ? contact.id : item.number}
            onPress={() => call(item.number)}
            onLongPress={() => nav.push({ name: 'contact', contactId: contact ? contact.id : null, number: item.number })}
          />
        </Animated.View>
      );
    },
    [SLOT, ROW_H, CARD_W, CARD_H, findContact, call, nav]
  );

  if (!favorites.length) {
    return (
      <View style={{ paddingHorizontal: SIDE }}>
        <Pressable onPress={() => nav.push({ name: 'pickFavorite' })}>
          {({ pressed }) => (
            <Glass radius={22} pressed={pressed} style={{ width: CARD_W, height: CARD_H, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="add" size={28} color={t.blue} />
              <Text style={{ color: t.secondary, fontSize: 12, marginTop: 4 }}>{tr('Favorites')}</Text>
            </Glass>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    // same inset as the date strip below it, so the row lines up with it
    <View style={{ height: ROW_H, marginHorizontal: SIDE }}>
      <Wheel
        horizontal
        data={favorites}
        itemSize={SLOT}
        viewport={VIEWPORT}
        initialIndex={0}
        scaleRange={[OUTER_SCALE, 0.84, 1, 0.84, OUTER_SCALE]}
        opacityRange={[0.55, 0.85, 1, 0.85, 0.55]}
        // a carousel should fling like the lists elsewhere, not step card by card
        oneAtATime={false}
        liveCentre={false}
        // a further 30% off the shared tick strength
        haptics={0.42}
        renderItem={renderCard}
      />
    </View>
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
  const tabBarSpace = useBottomSpace();
  const sheet = useActionSheet();
  const { recents, resolve, markRecentsSeen, deleteCalls, callVoicemail } = useData();
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

  // Compact top row: filter, the Statistics pill, then Edit.
  const header = (
    <LargeHeader
      compact
      left={<IconButton glass wide name="filter" onPress={chooseFilter} color={filter === 'all' ? t.text : t.blue} />}
      center={
        <Pressable onPress={() => nav.push({ name: 'statistics' })} style={{ alignSelf: 'stretch', justifyContent: 'center' }}>
          {({ pressed }) => (
            <Glass radius={20} pressed={pressed} blur={EXTENDED_BLUR} vivid intensity={90} style={styles.statsPill}>
              <View style={[styles.statsIcon, { backgroundColor: t.chartOther }]}>
                <Ionicons name="stats-chart" size={14} color="#fff" />
              </View>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '600', marginLeft: 8 }} numberOfLines={1} allowFontScaling={false}>
                {tr('Statistics')}
              </Text>
            </Glass>
          )}
        </Pressable>
      }
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
        <View style={{ marginBottom: 6 }}>
          <Text style={[styles.section, { color: t.text }]}>{tr('Favorites')}</Text>
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
      {header}
      <FlatList
        removeClippedSubviews
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={30}
        data={list}
        keyExtractor={(g) => g.id}
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
        contentContainerStyle={{ paddingBottom: tabBarSpace + insets.bottom + 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 20, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8, marginTop: 4 },
  // fills the header row between the filter button and Edit
  statsPill: { width: '100%', height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  statsIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
