import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../components/Touch';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_SPACE, useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, contactPhoto, formatNumber, prettyLabel } from '../phone';
import { load, save } from '../storage';
import { Avatar, EmptyState, IconButton, LargeHeader, SearchBar, TextButton } from '../components/ui';
import { Glass } from '../components/Glass';
import ContactCard from '../components/ContactCard';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
const ROWS = [LETTERS.slice(0, 14), LETTERS.slice(14)];
const COLUMNS = 4;
const SIDE = 16;
const GAP = 12;

// First letter of the name as shown (A–Z, otherwise #).
function letterOf(c) {
  const ch = contactName(c).trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function LetterKey({ letter, selected, available, onPress, size }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={3} style={{ width: size, height: size + 6, alignItems: 'center', justifyContent: 'center' }}>
      {({ pressed }) => (
        <View
          style={{
            width: size - 2,
            height: size - 2,
            borderRadius: (size - 2) / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: selected ? t.blue : pressed ? (t.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent',
          }}
        >
          <Text style={{ color: selected ? '#fff' : available ? t.text : t.tertiary, fontSize: 14, fontWeight: selected ? '700' : '600' }}>{letter}</Text>
        </View>
      )}
    </Pressable>
  );
}

// List row, same size as a Recents row.
function ContactRow({ item, onOpen, onCall }) {
  const t = useTheme();
  const name = contactName(item);
  const first = (item.phoneNumbers || [])[0];
  const subtitle = first ? (first.label ? prettyLabel(first.label) : formatNumber(first.number)) : item.company || '';
  return (
    <Pressable onPress={onOpen} onLongPress={first ? onCall : undefined} delayLongPress={350}>
      {({ pressed }) => (
        <View style={[styles.row, pressed && { backgroundColor: t.dark ? '#1C1C1E' : '#E5E5EA' }]}>
          <View style={{ marginRight: 12 }}>
            <Avatar name={name} image={contactPhoto(item, false)} size={40} />
          </View>
          <View style={[styles.rowBody, { borderBottomColor: t.separator }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
                {name}
              </Text>
              {subtitle ? (
                <Text style={{ color: t.secondary, fontSize: 15, marginTop: 1 }} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {first ? (
              <Pressable onPress={onCall} hitSlop={10}>
                <Ionicons name="call-outline" size={22} color={t.blue} />
              </Pressable>
            ) : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

function ViewToggle({ mode, onChange }) {
  const t = useTheme();
  const opt = (m, icon) => (
    <Pressable onPress={() => onChange(m)} hitSlop={4}>
      <View style={[styles.toggleKey, mode === m && { backgroundColor: t.dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.1)' }]}>
        <Ionicons name={icon} size={17} color={mode === m ? t.text : t.secondary} />
      </View>
    </Pressable>
  );
  return (
    <Glass radius={18} style={styles.toggle}>
      {opt('grid', 'grid-outline')}
      {opt('list', 'list-outline')}
    </Glass>
  );
}

export default function ContactsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { width } = useWindowDimensions();
  const { contacts, contactsPerm, contactsError, refreshContacts, call } = useData();
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState('all');
  const [mode, setModeState] = useState('grid');

  useEffect(() => {
    load('contactsView', 'grid').then((m) => setModeState(m === 'list' ? 'list' : 'grid'));
  }, []);
  const setMode = (m) => {
    Haptics.selectionAsync().catch(() => {});
    setModeState(m);
    save('contactsView', m);
  };

  const sorted = useMemo(() => [...contacts].sort((a, b) => contactName(a).localeCompare(contactName(b))), [contacts]);

  const counts = useMemo(() => {
    const m = {};
    for (const c of contacts) {
      const l = letterOf(c);
      m[l] = (m[l] || 0) + 1;
    }
    return m;
  }, [contacts]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const qDigits = q.replace(/\D/g, '');
      return sorted.filter((c) => {
        const name = `${contactName(c)} ${c.company || ''}`.toLowerCase();
        if (name.includes(q)) return true;
        return qDigits.length >= 3 && (c.phoneNumbers || []).some((p) => (p.number || '').replace(/\D/g, '').includes(qDigits));
      });
    }
    return letter === 'all' ? sorted : sorted.filter((c) => letterOf(c) === letter);
  }, [sorted, query, letter]);

  const cardW = Math.floor((width - SIDE * 2 - GAP * (COLUMNS - 1)) / COLUMNS);
  const cardH = Math.round(cardW * 1.32);
  const keySize = Math.min(30, Math.floor((width - SIDE * 2 - 16) / 14));

  const pick = (l) => {
    Haptics.selectionAsync().catch(() => {});
    setLetter(l);
  };

  const header = (
    <LargeHeader title="Contacts" left={<ViewToggle mode={mode} onChange={setMode} />}
      right={<IconButton glass name="add" size={26} onPress={() => nav.push({ name: 'newContact' })} />}>
      <SearchBar value={query} onChangeText={setQuery} />
      {!query && contacts.length ? (
        <Glass radius={24} strong style={styles.filter}>
          <Pressable onPress={() => pick('all')} style={{ alignSelf: 'flex-start', marginBottom: 4 }}>
            {({ pressed }) => (
              <View
                style={[
                  styles.allChip,
                  { backgroundColor: letter === 'all' ? t.blue : pressed ? (t.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent' },
                ]}
              >
                <Text style={{ color: letter === 'all' ? '#fff' : t.text, fontSize: 15, fontWeight: '600' }}>
                  All <Text style={{ fontWeight: '400', color: letter === 'all' ? 'rgba(255,255,255,0.85)' : t.secondary }}>({contacts.length})</Text>
                </Text>
              </View>
            )}
          </Pressable>
          {ROWS.map((row, i) => (
            <View key={i} style={styles.letterRow}>
              {row.map((l) => (
                <LetterKey key={l} letter={l} size={keySize} selected={letter === l} available={!!counts[l]} onPress={() => pick(l)} />
              ))}
              {/* keep the shorter second row aligned with the first */}
              {row.length < 14 ? Array.from({ length: 14 - row.length }).map((_, k) => <View key={'s' + k} style={{ width: keySize }} />) : null}
            </View>
          ))}
        </Glass>
      ) : null}
      {!query && letter !== 'all' && list.length ? (
        <Text style={{ color: t.secondary, fontSize: 13, paddingHorizontal: SIDE + 4, marginTop: 10 }}>
          {list.length} {list.length === 1 ? 'contact' : 'contacts'} starting with “{letter}”
        </Text>
      ) : null}
      <View style={{ height: 12 }} />
    </LargeHeader>
  );

  if (contactsPerm === 'denied') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        {header}
        <EmptyState
          icon="people-outline"
          title="No Access to Contacts"
          message="Allow access to contacts to see the people you call and message."
          action={<TextButton title="Open Settings" bold onPress={() => Linking.openSettings()} />}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <FlatList
        removeClippedSubviews
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={30}
        data={list}
        key={mode}
        numColumns={mode === 'grid' ? COLUMNS : 1}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={24}
        windowSize={7}
        columnWrapperStyle={mode === 'grid' ? { paddingHorizontal: SIDE, gap: GAP, marginBottom: 14 } : undefined}
        renderItem={({ item }) => {
          const name = contactName(item);
          const first = (item.phoneNumbers || [])[0];
          if (mode === 'list') {
            return <ContactRow item={item} onOpen={() => nav.push({ name: 'contact', contactId: item.id })} onCall={() => first && call(first.number)} />;
          }
          return (
            <ContactCard
              width={cardW}
              height={cardH}
              radius={20}
              name={name}
              image={contactPhoto(item, true)}
              colorKey={item.id}
              onPress={() => nav.push({ name: 'contact', contactId: item.id })}
              onLongPress={first ? () => call(first.number) : undefined}
            />
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="person-circle-outline"
            title={query ? 'No Results' : letter !== 'all' && contacts.length ? `No Contacts – ${letter}` : contactsError ? 'Couldn’t Load Contacts' : 'No Contacts'}
            message={
              query
                ? `No results for “${query}”.`
                : letter !== 'all' && contacts.length
                ? `None of your contacts start with “${letter}”.`
                : contactsError
                ? contactsError
                : 'Tap + to add a contact.'
            }
            action={
              !query && letter !== 'all' && contacts.length ? (
                <TextButton glass title="Show All" onPress={() => setLetter('all')} />
              ) : !query && contactsError ? (
                <TextButton glass title="Try Again" onPress={() => refreshContacts(true)} />
              ) : null
            }
          />
        }
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom + 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filter: { marginHorizontal: SIDE, marginTop: 10, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  allChip: { paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: 'center' },
  letterRow: { flexDirection: 'row', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 16, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 64 },
  toggle: { flexDirection: 'row', height: 36, padding: 3, gap: 2, alignItems: 'center' },
  toggleKey: { width: 34, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
