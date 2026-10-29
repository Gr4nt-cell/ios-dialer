import React, { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, formatNumber, prettyLabel } from '../phone';
import { Avatar, EmptyState, IconButton, SearchBar, SheetHeader } from '../components/ui';
import { useT } from '../i18n';
import Dialer from '../dialer';

/**
 * Picks a contact. Two jobs: choosing a favourite (the default), and choosing
 * which existing contact a new number should be added to — `route.mode` of
 * 'addNumber' with `route.number`.
 */
export default function PickFavoriteScreen({ route }) {
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { contacts, addFavorite, isFavorite, refreshContacts } = useData();
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const adding = route && route.mode === 'addNumber' && !!route.number;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      // when adding a number, a contact without one is still a fine home for it
      .filter((c) => adding || (c.phoneNumbers || []).length)
      .filter((c) => !q || contactName(c).toLowerCase().includes(q))
      .sort((a, b) => contactName(a).localeCompare(contactName(b)));
  }, [contacts, query, adding]);

  const addTo = async (contact) => {
    try {
      const ok = Dialer && Dialer.addNumberToContact ? await Dialer.addNumberToContact(String(contact.id), 'mobile', route.number) : false;
      if (!ok) throw new Error('Your phone turned down the change.');
      await refreshContacts(false);
      nav.pop();
      nav.pop(); // and the new-contact form behind it
    } catch (e) {
      Alert.alert(tr('Couldn’t Save Changes'), (e && e.message) || 'Please try again.');
    }
  };

  const pick = (contact, phone) => {
    addFavorite(contact, phone.number, prettyLabel(phone.label));
    nav.pop();
  };

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader
        title={adding ? `${tr('Add to Contact')} · ${formatNumber(route.number)}` : tr('Add Favorite')}
        left={<IconButton glass name="close" onPress={nav.pop} />}
      />
      <View style={{ backgroundColor: t.grouped, paddingTop: 4 }}>
        <SearchBar value={query} onChangeText={setQuery} />
      </View>
      <FlatList
        removeClippedSubviews
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={30}
        data={list}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const phones = item.phoneNumbers || [];
          const open = expanded === item.id;
          return (
            <View>
              <Pressable onPress={() => (adding ? addTo(item) : phones.length === 1 ? pick(item, phones[0]) : setExpanded(open ? null : item.id))}>
                {({ pressed }) => (
                  <View style={[styles.row, pressed && { backgroundColor: t.dark ? '#1C1C1E' : '#E5E5EA' }]}>
                    <Avatar name={contactName(item)} image={item.image && item.image.uri} size={36} />
                    <Text style={{ color: t.text, fontSize: fs(17), flex: 1, marginLeft: 12 }} numberOfLines={1}>
                      {contactName(item)}
                    </Text>
                    {adding ? (
                      <Ionicons name="add-circle" size={20} color={t.green} />
                    ) : phones.length > 1 ? (
                      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.tertiary} />
                    ) : null}
                  </View>
                )}
              </Pressable>
              {open && !adding
                ? phones.map((p, i) => (
                    <Pressable key={p.id || i} onPress={() => pick(item, p)} disabled={isFavorite(p.number)}>
                      <View style={[styles.phone, { borderTopColor: t.separator }]}>
                        <Ionicons name="call" size={14} color={isFavorite(p.number) ? t.tertiary : t.blue} />
                        <Text style={{ color: t.secondary, fontSize: fs(15), width: 70, marginLeft: 8 }}>{prettyLabel(p.label)}</Text>
                        <Text style={{ color: isFavorite(p.number) ? t.tertiary : t.blue, fontSize: fs(16) }}>{formatNumber(p.number)}</Text>
                      </View>
                    </Pressable>
                  ))
                : null}
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.separator, marginLeft: 64 }} />}
        ListEmptyComponent={<EmptyState icon="people-outline" title={tr('No Contacts')} message={tr('Contacts with phone numbers appear here.')} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  phone: { flexDirection: 'row', alignItems: 'center', paddingLeft: 64, paddingRight: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
