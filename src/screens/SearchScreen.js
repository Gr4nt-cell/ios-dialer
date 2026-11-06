import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { useBottomSpace } from '../device';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { cleanNumber, contactName, formatNumber, prettyLabel, timeLabel } from '../phone';
import { Avatar, EmptyState, LargeHeader, SearchBar } from '../components/ui';
import { useT } from '../i18n';
import { Glass, PerformanceModeContext } from '../components/Glass';

export default function SearchScreen() {
  const performanceMode = useContext(PerformanceModeContext);
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useBottomSpace();
  const nav = useNav();
  const { contacts, recents, resolve, call, searchHistory, rememberSearch, clearSearchHistory } = useData();
  const [q, setQ] = useState('');
  const queryRef = useRef('');
  const lastCommitted = useRef('');
  const commitSearch = () => {
    const query = queryRef.current.trim().replace(/\s+/g, ' ');
    if (query && query !== lastCommitted.current) {
      rememberSearch(query);
      lastCommitted.current = query;
    }
  };
  const changeQuery = (query) => {
    if (!query.trim()) commitSearch();
    queryRef.current = query;
    lastCommitted.current = '';
    setQ(query);
  };
  const repeatSearch = (query) => {
    queryRef.current = query;
    lastCommitted.current = query;
    setQ(query);
    rememberSearch(query);
  };
  useEffect(() => () => {
    if (queryRef.current.trim()) rememberSearch(queryRef.current);
  }, [rememberSearch]);
  const callFromSearch = (number) => { commitSearch(); call(number); };

  const sections = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const digits = query.replace(/\D/g, '');
    const people = contacts
      .filter((c) => {
        const name = `${contactName(c)} ${c.company || ''}`.toLowerCase();
        return name.includes(query) || (digits.length >= 3 && (c.phoneNumbers || []).some((p) => (p.number || '').replace(/\D/g, '').includes(digits)));
      })
      .slice(0, 30)
      .map((c) => ({ kind: 'contact', id: 'c' + c.id, contact: c }));
    const calls = recents
      .filter((g) => {
        const m = resolve(g.number);
        const name = (m ? contactName(m.contact) : g.name || '').toLowerCase();
        return name.includes(query) || (digits.length >= 3 && (g.number || '').replace(/\D/g, '').includes(digits));
      })
      .slice(0, 20)
      .map((g) => ({ kind: 'call', id: 'r' + g.id, group: g }));
    const out = [];
    if (digits.length >= 3 && digits.length === query.replace(/[\s+()-]/g, '').length) {
      out.push({ title: '', data: [{ kind: 'dial', id: 'dial', number: cleanNumber(q) }] });
    }
    if (people.length) out.push({ title: tr('Contacts'), data: people });
    if (calls.length) out.push({ title: tr('Recent Calls'), data: calls });
    return out;
  }, [q, contacts, recents, resolve]);

  const renderItem = ({ item }) => {
    if (item.kind === 'dial') {
      return (
        <Pressable onPress={() => callFromSearch(item.number)}>
          {({ pressed }) => (
            <Glass strong vivid radius={18} pressed={pressed} style={styles.row}>
              <View style={[styles.iconCircle, { backgroundColor: t.green }]}>
                <Ionicons name="call" size={18} color="#fff" />
              </View>
              <Text style={{ color: t.text, fontSize: fs(17), marginLeft: 12 }}>Call {formatNumber(item.number)}</Text>
            </Glass>
          )}
        </Pressable>
      );
    }
    if (item.kind === 'contact') {
      const c = item.contact;
      const phone = (c.phoneNumbers || [])[0];
      return (
        <Pressable onPress={() => { commitSearch(); nav.push({ name: 'contact', contactId: c.id }); }}>
          {({ pressed }) => (
            <Glass strong vivid radius={18} pressed={pressed} style={styles.row}>
              <Avatar name={contactName(c)} image={c.image && c.image.uri} size={40} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: t.text, fontSize: fs(17) }} numberOfLines={1}>{contactName(c)}</Text>
                {phone ? <Text style={{ color: t.secondary, fontSize: fs(14) }}>{prettyLabel(phone.label)} · {formatNumber(phone.number)}</Text> : null}
              </View>
              {phone ? (
                <Pressable onPress={() => callFromSearch(phone.number)} hitSlop={10}>
                  <Ionicons name="call-outline" size={22} color={t.blue} />
                </Pressable>
              ) : null}
            </Glass>
          )}
        </Pressable>
      );
    }
    const g = item.group;
    const m = resolve(g.number);
    return (
      <Pressable onPress={() => callFromSearch(g.number)}>
        {({ pressed }) => (
          <Glass strong vivid radius={18} pressed={pressed} style={styles.row}>
            <View style={[styles.iconCircle, { backgroundColor: t.fill }]}>
              <Ionicons name="time-outline" size={18} color={t.secondary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: t.text, fontSize: fs(17) }} numberOfLines={1}>{m ? contactName(m.contact) : g.name || formatNumber(g.number)}</Text>
              <Text style={{ color: t.secondary, fontSize: fs(14) }}>{timeLabel(g.date)}</Text>
            </View>
          </Glass>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <LargeHeader title={tr('Search')}>
        <SearchBar value={q} onChangeText={changeQuery} onSubmitEditing={commitSearch} onBlur={commitSearch} placeholder={tr('Contacts, calls or a number')} autoFocus />
      </LargeHeader>
      <SectionList
        removeClippedSubviews
        maxToRenderPerBatch={performanceMode ? 6 : 12}
        updateCellsBatchingPeriod={performanceMode ? 50 : 30}
        initialNumToRender={performanceMode ? 8 : 16}
        windowSize={performanceMode ? 5 : 7}
        sections={sections}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={renderItem}
        ListHeaderComponent={searchHistory.length ? (
          <View style={styles.history}>
            <View style={styles.historyHeading}>
              <Text style={{ color: t.text, fontSize: fs(17), fontWeight: '700', flex: 1 }}>{tr('Recent Searches')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={tr('Clear search history')} hitSlop={10} onPress={() => { queryRef.current = ''; lastCommitted.current = ''; setQ(''); clearSearchHistory(); }}>
                <Text style={{ color: t.blue, fontSize: fs(15) }}>{tr('Clear')}</Text>
              </Pressable>
            </View>
            {[0, 1, 2].map((row) => (
              <View key={row} style={styles.historyRow}>
                {[0, 1, 2].map((column) => {
                  const query = searchHistory[row * 3 + column];
                  return query ? (
                    <Pressable key={column} style={styles.historyCell} accessibilityRole="button" accessibilityLabel={tr('Search again for {query}').replace('{query}', query)} onPress={() => repeatSearch(query)}>
                      {({ pressed }) => (
                        <Glass radius={22} liquid strong vivid soft pressed={pressed} style={styles.historyChip}>
                          <Ionicons name="time-outline" size={16} color={t.secondary} />
                          <Text numberOfLines={2} style={{ color: t.text, fontSize: fs(14), flexShrink: 1, textAlign: 'center' }}>{query}</Text>
                        </Glass>
                      )}
                    </Pressable>
                  ) : <View key={column} style={styles.historyCell} />;
                })}
              </View>
            ))}
          </View>
        ) : null}
        renderSectionHeader={({ section }) =>
          section.title ? <Text style={{ color: t.text, fontSize: fs(20), fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, backgroundColor: t.dark ? t.bg : 'transparent' }}>{section.title}</Text> : null
        }
        ListEmptyComponent={q ? <EmptyState icon="search" title={tr('No Results')} message={`Nothing matches “${q}”.`} /> : <EmptyState icon="search" title={tr('Search')} message={tr('Find people, recent calls, or type a number to call it.')} />}
        contentContainerStyle={{ paddingBottom: tabBarSpace + insets.bottom + 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  history: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10 },
  historyHeading: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 10 },
  historyRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  historyCell: { flex: 1, minWidth: 0 },
  historyChip: { minHeight: 62, paddingHorizontal: 8, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', gap: 5 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 12, marginVertical: 4 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
