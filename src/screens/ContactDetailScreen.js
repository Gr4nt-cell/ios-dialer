import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Touch';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Contacts from 'expo-contacts/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { isMissedType, useData } from '../DataContext';
import { useNav } from '../nav';
import { contactName, contactPhoto, durationLabel, formatNumber, numberKey, prettyLabel, sendMessage, timeLabel } from '../phone';
import { Avatar, Cell, Group, IconButton, TextButton } from '../components/ui';
import { BlurTargetView, Glass } from '../components/Glass';
import CallPicker, { callAccounts } from '../components/CallPicker';
import { useActionSheet } from '../components/ActionSheet';
import Dialer from '../dialer';
import { loadRecordings } from './RecordingsScreen';

function Action({ icon, label, onPress, disabled, color }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ flex: 1 }}>
      {({ pressed }) => (
        <Glass radius={18} pressed={pressed} style={[styles.action, { opacity: disabled ? 0.4 : 1 }]}>
          <Ionicons name={icon} size={22} color={color || t.text} />
          <Text style={{ color: t.text, fontSize: 12, marginTop: 4 }}>{label}</Text>
        </Glass>
      )}
    </Pressable>
  );
}

function openWhatsApp(contactId, number, kind) {
  if (!Dialer || !Dialer.openWhatsApp) {
    Linking.openURL('https://wa.me/' + (number || '').replace(/\D/g, '')).catch(() => {});
    return;
  }
  const res = Dialer.openWhatsApp(contactId || null, number, kind);
  if (res === 'notInstalled') Alert.alert('WhatsApp Not Installed', 'Install WhatsApp to message or call this contact there.');
  else if (res === 'error') Alert.alert('Couldn’t Open WhatsApp');
}

function SmallIcon({ name, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ marginLeft: 8 }}>
      {({ pressed }) => (
        <Glass radius={17} pressed={pressed} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={name} size={17} color={t.green} />
        </Glass>
      )}
    </Pressable>
  );
}

function callTypeLabel(type) {
  switch (type) {
    case 'outgoing':
      return 'Outgoing Call';
    case 'missed':
      return 'Missed Call';
    case 'rejected':
      return 'Declined Call';
    case 'blocked':
      return 'Blocked Call';
    case 'voicemail':
      return 'Voicemail';
    default:
      return 'Incoming Call';
  }
}

export default function ContactDetailScreen({ route }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const data = useData();
  const sheet = useActionSheet();
  const { findContact, resolve, call, isFavorite, addFavorite, removeFavoriteByNumber, isBlocked, block, unblock, deleteContact, refreshContacts, recents } = data;

  const contact = route.contactId ? findContact(route.contactId) : route.number ? (resolve(route.number) || {}).contact || null : null;
  const phones = contact ? contact.phoneNumbers || [] : route.number ? [{ id: 'n', number: route.number, label: 'phone' }] : [];
  const emails = contact ? contact.emails || [] : [];
  const [photoBusy, setPhotoBusy] = useState(false);
  const image = contactPhoto(contact, true);
  const primary = phones[0] ? phones[0].number : route.number;
  const name = contact ? contactName(contact) : primary ? formatNumber(primary) : 'Unknown';

  const history = useMemo(() => {
    if (route.calls) return route.calls;
    const keys = new Set(phones.map((p) => numberKey(p.number)));
    return recents.filter((g) => keys.has(g.key)).flatMap((g) => g.calls).slice(0, 10);
  }, [route.calls, phones, recents]);

  const phoneKeys = phones.map((p) => numberKey(p.number)).join(',');

  // With several numbers, mark the one you called most recently.
  const lastCalled = useMemo(() => {
    if (phones.length < 2) return null;
    const keys = new Set(phoneKeys.split(','));
    let best = null;
    for (const g of recents) {
      if (!keys.has(g.key)) continue;
      for (const c of g.calls) {
        if (c.type === 'outgoing' && (!best || c.date > best.date)) best = { key: g.key, date: c.date };
      }
    }
    return best;
  }, [phones.length, phoneKeys, recents]);
  const recordingCount = useMemo(() => {
    const keys = new Set(phoneKeys.split(','));
    return loadRecordings().filter((r) => keys.has(numberKey(r.number))).length;
  }, [phoneKeys]);

  const blocked = primary ? phones.some((p) => isBlocked(p.number)) : false;
  const favorite = primary ? phones.some((p) => isFavorite(p.number)) : false;

  // ---------- blurred number / SIM pickers ----------
  const blurTarget = useRef(null);
  const [picker, setPicker] = useState(null);

  // number chosen → straight to "Call Using" when the phone has more than one SIM
  const startCall = (p) => {
    const accounts = callAccounts();
    if (accounts.length >= 2) setPicker({ mode: 'sim', number: p.number, accounts });
    else {
      setPicker(null);
      call(p.number);
    }
  };

  const pickNumberFor = (action) => {
    if (!phones.length) return;
    if (phones.length === 1) {
      if (action === 'message') sendMessage(phones[0].number);
      else startCall(phones[0]);
      return;
    }
    setPicker({ mode: 'numbers', action, phones, lastKey: lastCalled && lastCalled.key });
  };

  const onPickNumber = (p) => {
    if (picker && picker.action === 'favorite') {
      setPicker(null);
      addFavorite(contact, p.number, prettyLabel(p.label));
      return;
    }
    if (picker && picker.action === 'message') {
      setPicker(null);
      sendMessage(p.number);
    } else startCall(p);
  };

  const onPickSim = (a) => {
    const number = picker && picker.number;
    setPicker(null);
    if (number) call(number, a.key);
  };

  const chooseNumber = (title, onPick) => {
    if (phones.length <= 1) return primary && onPick(phones[0] || { number: primary, label: 'phone' });
    sheet.show({
      title,
      options: phones.map((p) => ({ text: `${prettyLabel(p.label)}  ${formatNumber(p.number)}`, onPress: () => onPick(p) })),
    });
  };

  const share = () => {
    const lines = [name, ...phones.map((p) => `${prettyLabel(p.label)}: ${p.number}`), ...emails.map((e) => `${e.label || 'email'}: ${e.email}`)];
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  const whatsApp = () =>
    chooseNumber('WhatsApp', (p) =>
      sheet.show({
        title: `WhatsApp · ${formatNumber(p.number)}`,
        options: [
          { text: 'Message', onPress: () => openWhatsApp(contact && contact.id, p.number, 'chat') },
          { text: 'Voice Call', onPress: () => openWhatsApp(contact && contact.id, p.number, 'voice') },
          { text: 'Video Call', onPress: () => openWhatsApp(contact && contact.id, p.number, 'video') },
        ],
      })
    );

  const applyPhoto = async (uri) => {
    if (!Dialer || !Dialer.setContactPhoto) {
      Alert.alert('Not Available', 'Install the app build to change contact photos.');
      return;
    }
    setPhotoBusy(true);
    try {
      const ok = await Dialer.setContactPhoto(String(contact.id), uri, null);
      if (!ok) Alert.alert('Couldn’t Save Photo', 'This contact is stored in an account that doesn’t allow photos to be changed.');
      await refreshContacts(false);
    } catch (e) {
      Alert.alert('Couldn’t Save Photo', String((e && e.message) || e));
    } finally {
      setPhotoBusy(false);
    }
  };

  const pick = async (camera) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Camera Access Needed', 'Allow camera access to take a contact photo.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      }
      const opts = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.92 };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled || !res.assets || !res.assets[0]) return;
      await applyPhoto(res.assets[0].uri);
    } catch (e) {
      Alert.alert('Couldn’t Open Photos', String((e && e.message) || e));
    }
  };

  const editPhoto = () => {
    if (!contact) return;
    const options = [
      { text: 'Choose Photo', onPress: () => pick(false) },
      { text: 'Take Photo', onPress: () => pick(true) },
    ];
    if (image) options.push({ text: 'Remove Photo', destructive: true, onPress: () => applyPhoto(null) });
    sheet.show({ title: 'Contact Photo', options });
  };

  const toggleFavorite = () => {
    if (favorite) phones.forEach((p) => removeFavoriteByNumber(p.number));
    else if (phones.length > 1) setPicker({ mode: 'numbers', action: 'favorite', phones, lastKey: lastCalled && lastCalled.key });
    else if (phones.length === 1) addFavorite(contact, phones[0].number, prettyLabel(phones[0].label));
  };

  const toggleBlock = () => {
    if (blocked) {
      phones.forEach((p) => unblock(p.number));
      return;
    }
    Alert.alert('Block this Caller', 'You won’t get calls or texts from this number. With this app as your default phone app, the block applies to the whole phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block Contact', style: 'destructive', onPress: () => phones.forEach((p) => block(p.number)) },
    ]);
  };

  const confirmDelete = () =>
    Alert.alert('Delete Contact', `Delete ${name} from your contacts?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteContact(contact.id);
          nav.pop();
        },
      },
    ]);

  const edit = async () => {
    try {
      await Contacts.presentFormAsync(contact.id);
    } catch {
      // ignore
    }
    refreshContacts(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.grouped }}>
      <BlurTargetView ref={blurTarget} style={{ flex: 1, backgroundColor: t.grouped }}>
      <View style={[styles.nav, { paddingTop: insets.top }]}>
        <IconButton glass name="chevron-back" onPress={nav.pop} />
        {contact ? <TextButton glass title="Edit" onPress={edit} /> : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        <View style={{ alignItems: 'center', paddingTop: 4, paddingBottom: 18 }}>
          <Pressable onPress={editPhoto} disabled={!contact || photoBusy}>
            {({ pressed }) => (
              <View style={{ opacity: pressed ? 0.7 : 1 }}>
                <Avatar name={contact ? name : ''} image={image} size={100} />
                {photoBusy ? (
                  <View style={[StyleSheet.absoluteFill, { borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }]}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
          {contact ? (
            <Pressable onPress={editPhoto} hitSlop={8} style={{ marginTop: 8 }}>
              <Text style={{ color: t.blue, fontSize: 15 }}>{image ? 'Edit Photo' : 'Add Photo'}</Text>
            </Pressable>
          ) : null}
          <Text style={{ color: t.text, fontSize: 28, fontWeight: '600', marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>{name}</Text>
          {contact && (contact.company || contact.jobTitle) ? (
            <Text style={{ color: t.secondary, fontSize: 15, marginTop: 2 }}>{[contact.jobTitle, contact.company].filter(Boolean).join(' · ')}</Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 18 }}>
          <Action icon="chatbubble" label="message" disabled={!primary} onPress={() => pickNumberFor('message')} />
          <Action icon="call" label="call" disabled={!primary} onPress={() => pickNumberFor('call')} />
          <Action icon="logo-whatsapp" label="WhatsApp" color="#25D366" disabled={!primary} onPress={whatsApp} />
          <Action icon="share-outline" label="share" disabled={!primary} onPress={share} />
        </View>

        {history.length ? (
          <Group style={{ marginBottom: 18 }}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Text style={{ color: t.text, fontSize: 15, fontWeight: '600', marginBottom: 6 }}>
                {new Date(history[0].date).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              {history.slice(0, 6).map((c) => (
                <View key={c.id} style={{ flexDirection: 'row', paddingVertical: 3 }}>
                  <Text style={{ color: t.secondary, fontSize: 15, width: 90 }}>{timeLabel(c.date)}</Text>
                  <Text style={{ color: isMissedType(c.type) ? t.red : t.text, fontSize: 15, flex: 1 }}>{callTypeLabel(c.type)}</Text>
                  {c.duration ? <Text style={{ color: t.secondary, fontSize: 15 }}>{durationLabel(c.duration)}</Text> : null}
                </View>
              ))}
            </View>
          </Group>
        ) : null}

        {phones.length ? (
          <Group style={{ marginBottom: 18 }}>
            {phones.map((p, i) => (
              <Cell
                key={p.id || i}
                label={prettyLabel(p.label)}
                value={formatNumber(p.number)}
                color={t.blue}
                onPress={() => startCall(p)}
                onLongPress={() => Clipboard.setStringAsync(p.number).then(() => Alert.alert('Copied', formatNumber(p.number)))}
                right={isBlocked(p.number) ? <Ionicons name="hand-left" size={16} color={t.red} /> : null}
              >
                {lastCalled && lastCalled.key === numberKey(p.number) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                    <Ionicons name="arrow-up-outline" size={12} color={t.green} style={{ transform: [{ rotate: '45deg' }], marginRight: 3 }} />
                    <Text style={{ color: t.green, fontSize: 12, fontWeight: '600' }}>Last called · {timeLabel(lastCalled.date)}</Text>
                  </View>
                ) : null}
              </Cell>
            ))}
          </Group>
        ) : null}

        {primary ? (
          <Group style={{ marginBottom: 18 }}>
            {phones.map((p, i) => (
              <Cell
                key={'wa' + (p.id || i)}
                label="WhatsApp"
                value={formatNumber(p.number)}
                onPress={() => openWhatsApp(contact && contact.id, p.number, 'chat')}
                right={
                  <View style={{ flexDirection: 'row' }}>
                    <SmallIcon name="chatbubble" onPress={() => openWhatsApp(contact && contact.id, p.number, 'chat')} />
                    <SmallIcon name="call" onPress={() => openWhatsApp(contact && contact.id, p.number, 'voice')} />
                    <SmallIcon name="videocam" onPress={() => openWhatsApp(contact && contact.id, p.number, 'video')} />
                  </View>
                }
              />
            ))}
          </Group>
        ) : null}

        <Group style={{ marginBottom: 18 }}>
          {primary ? <Cell value="Send Message" color={t.blue} onPress={() => pickNumberFor('message')} /> : null}
          {primary ? <Cell value="Share Contact" color={t.blue} onPress={share} /> : null}
          {recordingCount ? (
            <Cell value={`Call Recordings (${recordingCount})`} color={t.blue} onPress={() => nav.push({ name: 'recordings', numbers: phones.map((p) => p.number) })} />
          ) : null}
          {primary ? <Cell value={favorite ? 'Remove from Favorites' : 'Add to Favorites'} color={t.blue} onPress={toggleFavorite} /> : null}
          {!contact && primary ? <Cell value="Create New Contact" color={t.blue} onPress={() => nav.push({ name: 'newContact', number: primary })} /> : null}
        </Group>

        {primary ? (
          <Group style={{ marginBottom: 18 }}>
            <Cell value={blocked ? 'Unblock this Caller' : 'Block this Caller'} color={t.red} onPress={toggleBlock} />
          </Group>
        ) : null}

        {contact ? (
          <Group>
            <Cell value="Delete Contact" color={t.red} onPress={confirmDelete} />
          </Group>
        ) : null}
      </ScrollView>
      </BlurTargetView>
      <CallPicker picker={picker} target={blurTarget} onClose={() => setPicker(null)} onPickNumber={onPickNumber} onPickSim={onPickSim} />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, minHeight: 48 },
  action: { paddingVertical: 11, alignItems: 'center' },
});
