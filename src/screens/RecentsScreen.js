import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_SPACE, useTheme } from '../theme';
import { isMissedType, useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, formatNumber, timeLabel } from '../phone';
import { Avatar, EmptyState, LargeHeader, Segmented, TextButton } from '../components/ui';
import { useT } from '../i18n';

export function RecentRow({ group, editing, onDelete, showTime }) {
  const t = useTheme();
  const nav = useNav();
  const { resolve, call, isBlocked } = useData();
  const match = resolve(group.number);
  const missed = isMissedType(group.type);
  const title = match ? contactName(match.contact) : group.name || (group.number ? formatNumber(group.number) : 'Unknown');
  const subtitle = match ? match.label : group.number ? (group.name ? formatNumber(group.number) : 'unknown') : 'No Caller ID';
  const count = group.calls.length;

  const openInfo = () =>
    nav.push({ name: 'contact', contactId: match ? match.contact.id : null, number: group.number, calls: group.calls });

  return (
    <Pressable onPress={() => (editing ? null : group.number ? call(group.number) : null)} disabled={editing}>
      {({ pressed }) => (
        <View style={[styles.row, pressed && { backgroundColor: t.dark ? '#1C1C1E' : '#E5E5EA' }]}>
          {editing ? (
            <Pressable onPress={onDelete} hitSlop={8} style={{ marginRight: 12 }}>
              <Ionicons name="remove-circle" size={24} color={t.red} />
            </Pressable>
          ) : null}
          <View style={{ marginRight: 12 }}>
            <Avatar name={match ? title : group.name || ''} image={match && match.contact.image && match.contact.image.uri} size={40} />
          </View>
          <View style={[styles.rowBody, { borderBottomColor: t.separator }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: missed ? t.red : t.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1} allowFontScaling={false}>
                {title}
                {count > 1 ? ` (${count})` : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
                {group.type === 'outgoing' ? (
                  <Ionicons name="arrow-up-outline" size={13} color={t.secondary} style={{ transform: [{ rotate: '45deg' }], marginRight: 3 }} />
                ) : missed ? (
                  <Ionicons name="arrow-down-outline" size={13} color={t.red} style={{ transform: [{ rotate: '45deg' }], marginRight: 3 }} />
                ) : null}
                <Text style={{ color: t.secondary, fontSize: 15, flexShrink: 1 }} numberOfLines={1} allowFontScaling={false}>
                  {group.type === 'voicemail' ? 'voicemail' : group.type === 'blocked' ? 'blocked' : subtitle}
                </Text>
              </View>
            </View>
            {group.number && isBlocked(group.number) ? <Ionicons name="hand-left" size={14} color={t.red} style={{ marginRight: 6 }} /> : null}
            <Text style={{ color: t.secondary, fontSize: 15, marginRight: 10 }}>{showTime ? new Date(group.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : timeLabel(group.date)}</Text>
            {!editing ? (
              <Pressable onPress={openInfo} hitSlop={10}>
                <Ionicons name="information-circle-outline" size={24} color={t.blue} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function RecentsScreen() {
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { recents, markRecentsSeen, deleteCalls, callLogPerm, refreshCallLog } = useData();
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    markRecentsSeen();
  }, [recents.length, markRecentsSeen]);

  const list = filter === 'missed' ? recents.filter((g) => isMissedType(g.type)) : recents;

  const clearAll = () =>
    Alert.alert(tr('Clear Recents?'), tr('This removes your call history.'), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: filter === 'missed' ? 'Clear Missed Calls' : 'Clear All Recents',
        style: 'destructive',
        onPress: () => {
          deleteCalls(list.flatMap((g) => g.calls));
          setEditing(false);
        },
      },
    ]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshCallLog(false);
    setRefreshing(false);
  };

  const header = (
    <LargeHeader
      title={tr('Recents')}
      left={editing ? <TextButton glass title={tr('Clear')} color={t.red} onPress={clearAll} disabled={!list.length} /> : <TextButton glass title={tr('Edit')} onPress={() => setEditing(true)} disabled={!recents.length} />}
      center={<Segmented options={[{ label: tr('All'), value: 'all' }, { label: tr('Missed'), value: 'missed' }]} value={filter} onChange={setFilter} />}
      right={editing ? <TextButton prominent title={tr('Done')} onPress={() => setEditing(false)} /> : null}
    >
      {callLogPerm === 'denied' ? (
        <View style={[styles.banner, { backgroundColor: t.dark ? '#1C1C1E' : '#F2F2F7' }]}>
          <Ionicons name="time-outline" size={22} color={t.blue} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>{tr('Show your full call history')}</Text>
            <Text style={{ color: t.secondary, fontSize: 13, marginTop: 2 }}>{tr('Allow access so calls made from any app appear here.')}</Text>
          </View>
          <TextButton
            title={tr('Allow')}
            bold
            onPress={async () => {
              await refreshCallLog(true);
            }}
            style={{ marginLeft: 8 }}
          />
          <Pressable onPress={() => Linking.openSettings()} hitSlop={8} style={{ marginLeft: 12 }}>
            <Ionicons name="settings-outline" size={18} color={t.secondary} />
          </Pressable>
        </View>
      ) : null}
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
        stickyHeaderIndices={[0]}
        renderItem={({ item }) => <RecentRow group={item} editing={editing} onDelete={() => deleteCalls(item.calls)} />}
        ListEmptyComponent={
          <EmptyState
            icon={filter === 'missed' ? 'call-outline' : 'time-outline'}
            title={filter === 'missed' ? 'No Missed Calls' : 'No Recents'}
            message={filter === 'missed' ? undefined : 'Calls you make and receive will appear here.'}
          />
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} progressViewOffset={insets.top + 40} />}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom + 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 16, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  banner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 12 },
});
