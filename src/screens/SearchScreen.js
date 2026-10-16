import React, { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_SPACE, useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { cleanNumber, contactName, formatNumber, prettyLabel, timeLabel } from '../phone';
import { Avatar, EmptyState, LargeHeader, SearchBar } from '../components/ui';
import { useT } from '../i18n';

export default function SearchScreen() {
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { contacts, recents, resolve, call } = useData();
  const [q, setQ] = useState('');

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
        <Pressable onPress={() => call(item.number)} style={styles.row}>
          <View style={[styles.iconCircle, { backgroundColor: t.green }]}>
            <Ionicons name="call" size={18} color="#fff" />
          </View>
          <Text style={{ color: t.text, fontSize: 17, marginLeft: 12 }}>Call {formatNumber(item.number)}</Text>
        </Pressable>
      );
    }
    if (item.kind === 'contact') {
      const c = item.contact;
      const phone = (c.phoneNumbers || [])[0];
      return (
        <Pressable onPress={() => nav.push({ name: 'contact', contactId: c.id })} style={styles.row}>
          <Avatar name={contactName(c)} image={c.image && c.image.uri} size={40} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: t.text, fontSize: 17 }} numberOfLines={1}>{contactName(c)}</Text>
            {phone ? <Text style={{ color: t.secondary, fontSize: 14 }}>{prettyLabel(phone.label)} · {formatNumber(phone.number)}</Text> : null}
          </View>
          {phone ? (
            <Pressable onPress={() => call(phone.number)} hitSlop={10}>
              <Ionicons name="call-outline" size={22} color={t.blue} />
            </Pressable>
          ) : null}
        </Pressable>
      );
    }
    const g = item.group;
    const m = resolve(g.number);
    return (
      <Pressable onPress={() => call(g.number)} style={styles.row}>
        <View style={[styles.iconCircle, { backgroundColor: t.fill }]}>
          <Ionicons name="time-outline" size={18} color={t.secondary} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: t.text, fontSize: 17 }} numberOfLines={1}>{m ? contactName(m.contact) : g.name || formatNumber(g.number)}</Text>
          <Text style={{ color: t.secondary, fontSize: 14 }}>{timeLabel(g.date)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <LargeHeader title={tr('Search')}>
        <SearchBar value={q} onChangeText={setQ} placeholder={tr('Contacts, calls or a number')} autoFocus />
      </LargeHeader>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={renderItem}
        renderSectionHeader={({ section }) =>
          section.title ? <Text style={{ color: t.text, fontSize: 20, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, backgroundColor: t.bg }}>{section.title}</Text> : null
        }
        ListEmptyComponent={q ? <EmptyState icon="search" title={tr('No Results')} message={`Nothing matches “${q}”.`} /> : <EmptyState icon="search" title={tr('Search')} message={tr('Find people, recent calls, or type a number to call it.')} />}
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom + 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
