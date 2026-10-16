import React, { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_SPACE, useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName } from '../phone';
import { Avatar, EmptyState, IconButton, LargeHeader, TextButton } from '../components/ui';
import { useT } from '../i18n';

export default function FavoritesScreen() {
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { favorites, findContact, call, removeFavorite, moveFavorite } = useData();
  const [editing, setEditing] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        removeClippedSubviews
        maxToRenderPerBatch={12}
        updateCellsBatchingPeriod={30}
        data={favorites}
        keyExtractor={(f) => f.id}
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <LargeHeader
            title={tr('Favorites')}
            left={<TextButton glass={!editing} prominent={editing} title={editing ? 'Done' : 'Edit'} onPress={() => setEditing(!editing)} disabled={!favorites.length && !editing} />}
            right={<IconButton glass name="add" size={26} onPress={() => nav.push({ name: 'pickFavorite' })} />}
          />
        }
        renderItem={({ item, index }) => {
          const contact = item.contactId ? findContact(item.contactId) : null;
          const name = contact ? contactName(contact) : item.name;
          return (
            <Pressable onPress={() => (editing ? null : call(item.number))} disabled={editing}>
              {({ pressed }) => (
                <View style={[styles.row, pressed && { backgroundColor: t.dark ? '#1C1C1E' : '#E5E5EA' }]}>
                  {editing ? (
                    <Pressable onPress={() => removeFavorite(item.id)} hitSlop={8} style={{ marginRight: 12 }}>
                      <Ionicons name="remove-circle" size={24} color={t.red} />
                    </Pressable>
                  ) : null}
                  <Avatar name={name} image={contact && contact.image && contact.image.uri} size={44} />
                  <View style={[styles.body, { borderBottomColor: t.separator }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
                        {name}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Ionicons name="call" size={12} color={t.secondary} />
                        <Text style={{ color: t.secondary, fontSize: 14, marginLeft: 4 }}>{item.label}</Text>
                      </View>
                    </View>
                    {editing ? (
                      <View style={{ flexDirection: 'row', gap: 18 }}>
                        <IconButton name="chevron-up" color={index === 0 ? t.tertiary : t.secondary} size={22} onPress={() => moveFavorite(item.id, -1)} />
                        <IconButton name="chevron-down" color={index === favorites.length - 1 ? t.tertiary : t.secondary} size={22} onPress={() => moveFavorite(item.id, 1)} />
                      </View>
                    ) : (
                      <IconButton
                        name="information-circle-outline"
                        onPress={() => nav.push({ name: 'contact', contactId: contact ? contact.id : null, number: item.number })}
                      />
                    )}
                  </View>
                </View>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="star-outline"
            title={tr('No Favorites')}
            message={tr('Add the people you call most for one-tap calling.')}
            action={<TextButton title={tr('Add Favorite')} bold onPress={() => nav.push({ name: 'pickFavorite' })} />}
          />
        }
        contentContainerStyle={{ paddingBottom: TAB_BAR_SPACE + insets.bottom + 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 12, paddingVertical: 10, paddingRight: 16, borderBottomWidth: StyleSheet.hairlineWidth, minHeight: 64 },
});
