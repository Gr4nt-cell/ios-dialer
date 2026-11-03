import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { getTabBarClipSpace, usePaneSize, useBottomSpace } from '../device';
import { Pressable } from '../components/Touch';
import { scrollTick } from '../haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { useData } from '../DataContext';
import * as Contacts from 'expo-contacts/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useNav } from '../nav';
import { contactName, contactPhoto, formatNumber, prettyLabel } from '../phone';
import { load, save } from '../storage';
import { Avatar, EmptyState, IconButton, LargeHeader, SearchBar, TextButton } from '../components/ui';
import { EXTENDED_BLUR, Glass, PerformanceModeContext } from '../components/Glass';
import ContactCard from '../components/ContactCard';
import { useT } from '../i18n';
import Dialer from '../dialer';
import { contactsToCsv, contactsToVCard, parseContactsFile } from '../contactFiles';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
const COLUMNS = 4;
const SIDE = 16;
const GAP = 12;
const ALL_KEY_WIDTH = 48;
const MAX_CONTACT_FILE_SIZE = 20 * 1024 * 1024;
const CONTACT_EXPORT_FIELDS = [
  Contacts.Fields.FirstName,
  Contacts.Fields.MiddleName,
  Contacts.Fields.LastName,
  Contacts.Fields.NamePrefix,
  Contacts.Fields.NameSuffix,
  Contacts.Fields.Name,
  Contacts.Fields.Nickname,
  Contacts.Fields.Company,
  Contacts.Fields.JobTitle,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Emails,
  Contacts.Fields.Addresses,
  Contacts.Fields.Birthday,
  Contacts.Fields.UrlAddresses,
  ...(Platform.OS === 'android' ? [Contacts.Fields.Note] : []),
].filter(Boolean);

async function requestContactsAccess() {
  const current = await Contacts.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Contacts.requestPermissionsAsync();
  return requested.granted;
}

function confirmContactImport(count, filename) {
  return new Promise((resolve) => {
    Alert.alert(
      'Import contacts?',
      `Add ${count} contact${count === 1 ? '' : 's'} from ${filename} to this device?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Import', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

function csvFileDate() {
  return new Date().toISOString().slice(0, 10);
}

function ContactAction({ icon, label, detail, disabled, busy, onPress }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={[styles.contactActionButton, (disabled || busy) && { opacity: 0.5 }]}
    >
      {({ pressed }) => (
        <Glass radius={16} pressed={pressed} style={styles.contactAction}>
          <Ionicons name={busy ? 'hourglass-outline' : icon} size={16} color={t.blue} />
          <Text style={{ color: t.text, fontSize: fs(10), lineHeight: fs(12), fontWeight: '600', textAlign: 'center' }} numberOfLines={2}>
            {label}
          </Text>
          {detail ? <Text style={{ color: t.secondary, fontSize: fs(9), lineHeight: fs(10) }}>{detail}</Text> : null}
        </Glass>
      )}
    </Pressable>
  );
}

// First letter of the name as shown (A–Z, otherwise #).
function letterOf(c) {
  const ch = contactName(c).trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function nameKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findDuplicateGroups(contacts) {
  const parents = contacts.map((_, index) => index);
  const find = (index) => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const join = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parents[rootB] = rootA;
  };
  const seen = new Map();
  const signatures = contacts.map((contact, index) => {
    const values = [];
    const normalized = nameKey(contactName(contact));
    if (normalized.length >= 3) values.push(`name:${normalized}`);
    for (const entry of contact.phoneNumbers || []) {
      const number = String(entry.number || '').replace(/\D/g, '');
      if (number.length >= 7) values.push(`phone:${number}`);
    }
    for (const entry of contact.emails || []) {
      const email = String(entry.email || '').trim().toLowerCase();
      if (email) values.push(`email:${email}`);
    }
    for (const value of values) {
      if (seen.has(value)) join(index, seen.get(value));
      else seen.set(value, index);
    }
    return values;
  });

  const components = new Map();
  contacts.forEach((contact, index) => {
    const root = find(index);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push({ contact, signatures: signatures[index] });
  });

  return [...components.values()]
    .filter((items) => items.length > 1)
    .map((items) => {
      const common = new Set(items[0].signatures);
      for (const item of items.slice(1)) {
        const current = new Set(item.signatures);
        for (const signature of [...common]) {
          if (!current.has(signature)) common.delete(signature);
        }
      }
      const reason = [...common].some((value) => value.startsWith('phone:'))
        ? 'Same phone number'
        : [...common].some((value) => value.startsWith('email:'))
          ? 'Same email address'
          : 'Same name';
      const people = items.map((item) => item.contact).sort((a, b) => contactName(a).localeCompare(contactName(b)));
      return {
        id: people.map((person) => person.id).sort().join(':'),
        people,
        reason,
      };
    })
    .sort((a, b) => contactName(a.people[0]).localeCompare(contactName(b.people[0])));
}

function DuplicateGroupCard({ group, onMerge }) {
  const t = useTheme();
  return (
    <Glass strong radius={22} style={styles.duplicateCard}>
      <Text style={{ color: t.secondary, fontSize: fs(13), fontWeight: '600', marginBottom: 8 }}>{group.reason}</Text>
      {group.people.map((person) => {
        const phone = (person.phoneNumbers || [])[0]?.number;
        const email = (person.emails || [])[0]?.email;
        const detail = phone ? formatNumber(phone) : email || 'No phone or email';
        return (
          <View key={person.id} style={styles.duplicatePerson}>
            <Avatar name={contactName(person)} image={contactPhoto(person, false)} size={38} />
            <View style={{ flex: 1, marginLeft: 11 }}>
              <Text style={{ color: t.text, fontSize: fs(15), fontWeight: '600' }} numberOfLines={1}>{contactName(person)}</Text>
              <Text style={{ color: t.secondary, fontSize: fs(13), marginTop: 2 }} numberOfLines={1}>{detail}</Text>
            </View>
          </View>
        );
      })}
      <TextButton glass title="Merge these contacts" onPress={onMerge} />
    </Glass>
  );
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
          <Text style={{ color: selected ? '#fff' : available ? t.text : t.tertiary, fontSize: fs(14), fontWeight: selected ? '700' : '600' }}>{letter}</Text>
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
  return (
    <Pressable onPress={onOpen} onLongPress={first ? onCall : undefined} delayLongPress={350}>
      {({ pressed }) => (
        <Glass strong vivid radius={18} pressed={pressed} style={styles.row}>
          <View style={{ marginRight: 12 }}>
            <Avatar name={name} image={contactPhoto(item, false)} size={40} />
          </View>
          <View style={[styles.rowBody, { borderBottomColor: t.separator }]}>
            <Text style={{ color: t.text, fontSize: fs(17), fontWeight: '600', flex: 1 }} numberOfLines={1}>
              {name}
            </Text>
          </View>
        </Glass>
      )}
    </Pressable>
  );
}

function ViewToggle({ mode, onChange }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => onChange(mode === 'grid' ? 'list' : 'grid')}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={`Switch to ${mode === 'grid' ? 'list' : 'grid'} view`}
    >
      {({ pressed }) => (
        <Glass radius={18} pressed={pressed} style={styles.toggle}>
          <Ionicons name={mode === 'grid' ? 'grid-outline' : 'list-outline'} size={17} color={t.text} />
        </Glass>
      )}
    </Pressable>
  );
}

export default function ContactsScreen() {
  const performanceMode = useContext(PerformanceModeContext);
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tabBarSpace = useBottomSpace();
  const dockClipSpace = getTabBarClipSpace(tabBarSpace, insets.bottom);
  const nav = useNav();
  const { width } = usePaneSize();
  const { contacts, contactsPerm, contactsError, refreshContacts, call } = useData();
  const [query, setQuery] = useState('');
  const [letter, setLetter] = useState('all');
  const [mode, setModeState] = useState('grid');
  const [duplicateReview, setDuplicateReview] = useState(false);
  const [contactFileAction, setContactFileAction] = useState(null);

  useEffect(() => {
    load('contactsView', 'grid').then((m) => setModeState(m === 'list' ? 'list' : 'grid'));
  }, []);
  const setMode = (m) => {
    scrollTick();
    setModeState(m);
    save('contactsView', m);
  };

  const sorted = useMemo(() => [...contacts].sort((a, b) => contactName(a).localeCompare(contactName(b))), [contacts]);
  const duplicateGroups = useMemo(() => findDuplicateGroups(contacts), [contacts]);

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
  const keySize = Math.max(15, Math.min(28, Math.floor((width - SIDE * 2 - 16 - ALL_KEY_WIDTH - 8) / 14)));

  const pick = (l) => {
    scrollTick();
    setLetter(l);
  };

  const mergeGroup = (group) => {
    Alert.alert(
      'Merge these contacts?',
      'Android will show them as one contact. Existing numbers, email addresses, photos, and other details are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          onPress: async () => {
            try {
              const merged = await Dialer.mergeContacts(group.people.map((person) => String(person.id)));
              if (!merged) {
                Alert.alert('Couldn’t merge contacts', 'The contacts were not changed. Check contact access and try again.');
                return;
              }
              await refreshContacts(true);
              setDuplicateReview(false);
            } catch {
              Alert.alert('Couldn’t merge contacts', 'The contacts were not changed. Check contact access and try again.');
            }
          },
        },
      ],
    );
  };

  const importContacts = async () => {
    if (contactFileAction) return;
    setContactFileAction('import');
    try {
      if (!(await requestContactsAccess())) {
        Alert.alert('Contacts access needed', 'Allow contact access to import contacts.');
        return;
      }
      const selection = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (selection.canceled || !selection.assets?.[0]) return;
      const file = selection.assets[0];
      if (file.size && file.size > MAX_CONTACT_FILE_SIZE) {
        throw new Error('This contacts file is larger than the 20 MB import limit.');
      }
      const content = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = parseContactsFile(file.name, file.mimeType, content);
      if (!parsed.length) {
        Alert.alert('No contacts found', 'Choose a .vcf or .csv file containing contact names, phone numbers, or email addresses.');
        return;
      }
      if (!(await confirmContactImport(parsed.length, file.name))) return;

      let imported = 0;
      let failed = 0;
      for (const contact of parsed) {
        try {
          if (Platform.OS !== 'android') delete contact.note;
          await Contacts.addContactAsync(contact);
          imported += 1;
        } catch {
          failed += 1;
        }
      }
      await refreshContacts(false);
      Alert.alert(
        failed ? 'Import finished with errors' : 'Contacts imported',
        failed ? `Imported ${imported}; ${failed} could not be added.` : `Added ${imported} contact${imported === 1 ? '' : 's'}.`
      );
    } catch (error) {
      Alert.alert('Couldn’t import contacts', error?.message || 'Choose a valid .vcf or .csv file and try again.');
    } finally {
      setContactFileAction(null);
    }
  };

  const exportContacts = async (format) => {
    if (contactFileAction) return;
    setContactFileAction('export');
    try {
      if (!(await requestContactsAccess())) {
        Alert.alert('Contacts access needed', 'Allow contact access to export your contacts.');
        return;
      }
      const { data: exportableContacts } = await Contacts.getContactsAsync({
        fields: CONTACT_EXPORT_FIELDS,
        pageSize: 0,
        sort: Contacts.SortTypes.FirstName,
      });
      if (!exportableContacts.length) {
        Alert.alert('No contacts to export', 'This device does not have any contacts available to export.');
        return;
      }
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device cannot share exported contact files right now.');
        return;
      }
      if (!FileSystem.cacheDirectory) throw new Error('Temporary file storage is unavailable on this device.');
      const isVCard = format === 'vcf';
      const filename = `contacts-${csvFileDate()}.${format}`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      const contents = isVCard ? contactsToVCard(exportableContacts) : contactsToCsv(exportableContacts);
      await FileSystem.writeAsStringAsync(fileUri, contents, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(fileUri, {
        mimeType: isVCard ? 'text/vcard' : 'text/csv',
        UTI: isVCard ? 'public.vcard' : 'public.comma-separated-values-text',
        dialogTitle: `Export contacts as ${format.toUpperCase()}`,
      });
    } catch (error) {
      Alert.alert('Couldn’t export contacts', error?.message || 'Please try again.');
    } finally {
      setContactFileAction(null);
    }
  };

  const chooseExportFormat = () => {
    Alert.alert('Export contacts', 'Choose a file format.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'vCard (.vcf)', onPress: () => exportContacts('vcf') },
      { text: 'CSV (.csv)', onPress: () => exportContacts('csv') },
    ]);
  };

  const header = (
    <LargeHeader
      compact
      center={<Text style={{ color: t.text, fontSize: fs(21), fontWeight: '700' }}>{duplicateReview ? 'Review Duplicates' : tr('Contacts')}</Text>}
      left={duplicateReview ? <IconButton glass name="arrow-back" size={24} onPress={() => setDuplicateReview(false)} /> : <ViewToggle mode={mode} onChange={setMode} />}
      right={duplicateReview ? null : <IconButton glass name="add" size={26} onPress={() => nav.push({ name: 'newContact' })} />}
    >
      {!duplicateReview ? <SearchBar value={query} onChangeText={setQuery} /> : null}
      {!duplicateReview ? (
        <View style={styles.contactActions}>
          <ContactAction
            icon="git-merge-outline"
            label="Review duplicate contacts"
            detail={String(duplicateGroups.length)}
            disabled={!!contactFileAction || Platform.OS !== 'android' || contactsPerm !== 'granted' || !Dialer?.mergeContacts}
            onPress={() => setDuplicateReview(true)}
          />
          <ContactAction
            icon="download-outline"
            label="Import contact"
            busy={contactFileAction === 'import'}
            disabled={!!contactFileAction}
            onPress={importContacts}
          />
          <ContactAction
            icon="share-outline"
            label="Export contacts"
            busy={contactFileAction === 'export'}
            disabled={!!contactFileAction}
            onPress={chooseExportFormat}
          />
        </View>
      ) : null}
      {!duplicateReview && !query && contacts.length ? (
        <Glass radius={22} strong blur={EXTENDED_BLUR} vivid intensity={90} style={styles.filter}>
          <View style={styles.letterPicker}>
            <Pressable
              onPress={() => pick('all')}
              hitSlop={3}
              accessibilityRole="button"
              accessibilityLabel={`Show all ${contacts.length} contacts`}
            >
            {({ pressed }) => (
              <View
                style={[
                  styles.allChip,
                  { backgroundColor: letter === 'all' ? t.blue : pressed ? (t.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent' },
                ]}
              >
                <Text style={{ color: letter === 'all' ? '#fff' : t.text, fontSize: fs(12), fontWeight: '700' }}>{tr('All')}</Text>
                <Text style={{ color: letter === 'all' ? 'rgba(255,255,255,0.85)' : t.secondary, fontSize: fs(9), fontWeight: '500' }}>
                  {contacts.length}
                </Text>
              </View>
            )}
            </Pressable>
            <View style={styles.letterRows}>
              {[LETTERS.slice(0, 13), LETTERS.slice(13)].map((row, index) => (
                <View key={index} style={styles.letterRow}>
                  {row.map((l) => (
                    <LetterKey key={l} letter={l} size={keySize} selected={letter === l} available={!!counts[l]} onPress={() => pick(l)} />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </Glass>
      ) : null}
      {!duplicateReview && !query && letter !== 'all' && list.length ? (
        <Text style={{ color: t.secondary, fontSize: fs(13), paddingHorizontal: SIDE + 4, marginTop: 10 }}>
          {list.length} {list.length === 1 ? 'contact' : 'contacts'} starting with “{letter}”
        </Text>
      ) : null}
      <View style={{ height: 12 }} />
    </LargeHeader>
  );

  if (contactsPerm === 'denied') {
    return (
      <View style={{ flex: 1, paddingBottom: dockClipSpace, overflow: 'hidden' }}>
        {header}
        <EmptyState
          icon="people-outline"
          title={tr('No Access to Contacts')}
          message="Allow access to contacts to see the people you call and message."
          action={<TextButton title={tr('Open Settings')} bold onPress={() => Linking.openSettings()} />}
        />
      </View>
    );
  }

  if (duplicateReview) {
    return (
      <View style={{ flex: 1, paddingBottom: dockClipSpace, overflow: 'hidden' }}>
        {header}
        <FlatList
          removeClippedSubviews
          maxToRenderPerBatch={performanceMode ? 6 : 12}
          updateCellsBatchingPeriod={performanceMode ? 50 : 30}
          initialNumToRender={performanceMode ? 10 : 20}
          windowSize={performanceMode ? 5 : 7}
          data={duplicateGroups}
          keyExtractor={(group) => group.id}
          renderItem={({ item }) => <DuplicateGroupCard group={item} onMerge={() => mergeGroup(item)} />}
          ListEmptyComponent={
            <EmptyState
              icon="git-merge-outline"
              title="No Possible Duplicates"
              message="No contacts share a name, phone number, or email address."
            />
          }
          contentContainerStyle={{ paddingBottom: 20, paddingTop: 8 }}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingBottom: dockClipSpace, overflow: 'hidden' }}>
      {header}
      <FlatList
        removeClippedSubviews
        maxToRenderPerBatch={performanceMode ? 6 : 12}
        updateCellsBatchingPeriod={performanceMode ? 50 : 30}
        data={list}
        key={mode}
        numColumns={mode === 'grid' ? COLUMNS : 1}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={performanceMode ? 12 : 24}
        windowSize={performanceMode ? 5 : 7}
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
                <TextButton glass title={tr('Show All')} onPress={() => setLetter('all')} />
              ) : !query && contactsError ? (
                <TextButton glass title={tr('Try Again')} onPress={() => refreshContacts(true)} />
              ) : null
            }
          />
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  filter: { marginHorizontal: SIDE, marginTop: 8, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 5 },
  contactActions: { flexDirection: 'row', gap: 8, marginHorizontal: SIDE, marginTop: 8, marginBottom: 4 },
  contactActionButton: { flex: 1, minWidth: 0 },
  contactAction: { minHeight: 58, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 5, gap: 3 },
  duplicateCard: { marginHorizontal: SIDE, marginBottom: 12, padding: 14 },
  duplicatePerson: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  letterPicker: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  allChip: { width: ALL_KEY_WIDTH, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 1 },
  letterRows: { flex: 1 },
  letterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, marginHorizontal: 12, marginVertical: 4 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 16, minHeight: 64 },
  toggle: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
