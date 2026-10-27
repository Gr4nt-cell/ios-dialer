import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts/legacy';
import * as ImagePicker from 'expo-image-picker';
import Dialer from '../dialer';
import { useActionSheet } from '../components/ActionSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useData } from '../DataContext';
import { contactPhoto, prettyLabel } from '../phone';
import { useNav } from '../nav';
import { Avatar, IconButton, SheetHeader } from '../components/ui';
import { useT } from '../i18n';

const PHONE_LABELS = ['mobile', 'home', 'work', 'main', 'other'];
const EMAIL_LABELS = ['home', 'work', 'other'];

function Field({ value, onChangeText, placeholder, keyboardType, autoFocus }) {
  const t = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={t.secondary}
      keyboardType={keyboardType}
      autoFocus={autoFocus}
      autoCapitalize={keyboardType ? 'none' : 'words'}
      style={{ color: t.text, fontSize: 17, paddingVertical: 12, flex: 1 }}
    />
  );
}

function MultiRows({ items, setItems, labels, placeholder, keyboardType, addTitle }) {
  const t = useTheme();
  const update = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  return (
    <View style={[styles.group, { backgroundColor: t.card }]}>
      {items.map((it, i) => (
        <View key={i} style={[styles.multiRow, { borderBottomColor: t.separator }]}>
          <Pressable onPress={() => setItems(items.filter((_, j) => j !== i))} hitSlop={8}>
            <Ionicons name="remove-circle" size={22} color={t.red} />
          </Pressable>
          <Pressable
            onPress={() => update(i, { label: labels[(labels.indexOf(it.label) + 1) % labels.length] })}
            style={{ flexDirection: 'row', alignItems: 'center', width: 86, marginLeft: 10 }}
          >
            <Text style={{ color: t.blue, fontSize: 15 }}>{it.label}</Text>
            <Ionicons name="chevron-forward" size={14} color={t.tertiary} />
          </Pressable>
          <Field value={it.value} onChangeText={(v) => update(i, { value: v })} placeholder={placeholder} keyboardType={keyboardType} />
        </View>
      ))}
      <Pressable onPress={() => setItems([...items, { label: labels[items.length % labels.length], value: '' }])}>
        {({ pressed }) => (
          <View style={[styles.multiRow, { borderBottomWidth: 0, opacity: pressed ? 0.5 : 1 }]}>
            <Ionicons name="add-circle" size={22} color={t.green} />
            <Text style={{ color: t.text, fontSize: 17, marginLeft: 10 }}>{addTitle}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/**
 * New contact, and the editor for an existing one: pass route.contactId to
 * edit. Editing in the app rather than handing off to the system contacts
 * form keeps people here, and keeps the look consistent.
 */
export default function NewContactScreen({ route }) {
  const tr = useT();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { refreshContacts, findContact } = useData();
  const editing = !!route.contactId;
  const existing = useMemo(() => (route.contactId ? findContact(route.contactId) : null), [route.contactId, findContact]);

  const [firstName, setFirst] = useState(() => (existing && existing.firstName) || '');
  const [lastName, setLast] = useState(() => (existing && existing.lastName) || '');
  const [company, setCompany] = useState(() => (existing && existing.company) || '');
  const [phones, setPhones] = useState(() => {
    if (existing && existing.phoneNumbers && existing.phoneNumbers.length)
      return existing.phoneNumbers.map((n) => ({ label: prettyLabel(n.label) || 'mobile', value: n.number || '' }));
    return route.number ? [{ label: 'mobile', value: route.number }] : [];
  });
  const [emails, setEmails] = useState(() =>
    existing && existing.emails ? existing.emails.map((e) => ({ label: prettyLabel(e.label) || 'home', value: e.email || '' })) : []
  );
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState(() => (existing ? contactPhoto(existing, true) : null));
  // a photo the user swapped in during this edit, so an untouched one is left alone
  const [photoChanged, setPhotoChanged] = useState(false);
  const sheet = useActionSheet();

  const pick = async (camera) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
      }
      const opts = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.92 };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!res.canceled && res.assets && res.assets[0]) {
        setPhoto(res.assets[0].uri);
        setPhotoChanged(true);
      }
    } catch {
      // ignore
    }
  };

  const choosePhoto = () => {
    const options = [
      { text: tr('Choose Photo'), onPress: () => pick(false) },
      { text: tr('Take Photo'), onPress: () => pick(true) },
    ];
    if (photo)
      options.push({
        text: tr('Remove Photo'),
        destructive: true,
        onPress: () => {
          setPhoto(null);
          setPhotoChanged(true);
        },
      });
    sheet.show({ title: tr('Contact Photo'), options });
  };

  const canSave = !!(firstName.trim() || lastName.trim() || company.trim() || phones.some((p) => p.value.trim()));

  const save = async () => {
    setSaving(true);
    try {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') throw new Error('Contacts permission is needed to save.');
      const first = firstName.trim();
      const last = lastName.trim();
      // Android's native side rejects any field that is present but undefined, so only send filled-in ones.
      const data = { name: [first, last].filter(Boolean).join(' ') || company.trim() };
      if (first) data.firstName = first;
      if (last) data.lastName = last;
      if (company.trim()) data.company = company.trim();
      const numbers = phones.filter((p) => p.value.trim()).map((p) => ({ label: p.label, number: p.value.trim() }));
      if (numbers.length) data.phoneNumbers = numbers;
      const mails = emails.filter((e) => e.value.trim()).map((e) => ({ label: e.label, email: e.value.trim() }));
      if (mails.length) data.emails = mails;

      let id = route.contactId;
      if (Dialer && Dialer.saveContact) {
        // The content provider writes both the new contact and the edit; the
        // whole set is sent each time, so a row deleted in the form goes.
        const saved = await Dialer.saveContact({
          id: id ? String(id) : null,
          firstName: first,
          lastName: last,
          company: company.trim(),
          phoneNumbers: numbers,
          emails: mails,
        });
        if (!saved || saved === '-1') throw new Error('Your phone turned down the change. A contact synced from an account that blocks edits has to be changed in that account’s app.');
        id = saved;
      } else if (editing) {
        await Contacts.updateContactAsync({ ...data, id, phoneNumbers: numbers, emails: mails, company: company.trim() });
      } else {
        id = await Contacts.addContactAsync(data);
      }

      if ((!editing ? !!photo : photoChanged) && id && Dialer && Dialer.setContactPhoto) {
        try {
          await Dialer.setContactPhoto(String(id), photo, null);
        } catch {
          // the contact itself is saved; the photo is a separate write
        }
      }
      await refreshContacts(false);
      nav.pop();
    } catch (e) {
      Alert.alert(editing ? tr('Couldn’t Save Changes') : tr('Couldn’t Save Contact'), e && e.message ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader
        title={editing ? tr('Edit Contact') : tr('New Contact')}
        left={<IconButton glass name="close" onPress={nav.pop} />}
        right={<IconButton prominent name="checkmark" onPress={save} disabled={!canSave || saving} />}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <Pressable onPress={choosePhoto}>
              <Avatar name={`${firstName} ${lastName}`} image={photo} size={110} />
            </Pressable>
            <Pressable onPress={choosePhoto} hitSlop={8} style={{ marginTop: 10 }}>
              <Text style={{ color: t.blue, fontSize: 15 }}>{photo ? 'Edit Photo' : 'Add Photo'}</Text>
            </Pressable>
          </View>
          {route.number && !editing ? (
            <Pressable onPress={() => nav.push({ name: 'pickContact', mode: 'addNumber', number: route.number })}>
              {({ pressed }) => (
                <View style={[styles.group, styles.multiRow, { backgroundColor: t.card, borderBottomWidth: 0, opacity: pressed ? 0.5 : 1 }]}>
                  <Ionicons name="person-add" size={22} color={t.blue} />
                  <Text style={{ color: t.blue, fontSize: 17, marginLeft: 10 }}>{tr('Add to Existing Contact')}</Text>
                </View>
              )}
            </Pressable>
          ) : null}
          <View style={[styles.group, { backgroundColor: t.card }]}>
            <View style={[styles.fieldRow, { borderBottomColor: t.separator }]}>
              <Field value={firstName} onChangeText={setFirst} placeholder={tr('First name')} autoFocus={!route.number && !editing} />
            </View>
            <View style={[styles.fieldRow, { borderBottomColor: t.separator }]}>
              <Field value={lastName} onChangeText={setLast} placeholder={tr('Last name')} />
            </View>
            <View style={[styles.fieldRow, { borderBottomWidth: 0 }]}>
              <Field value={company} onChangeText={setCompany} placeholder={tr('Company')} />
            </View>
          </View>
          <MultiRows items={phones} setItems={setPhones} labels={PHONE_LABELS} placeholder={tr('Phone')} keyboardType="phone-pad" addTitle="add phone" />
          <MultiRows items={emails} setItems={setEmails} labels={EMAIL_LABELS} placeholder={tr('Email')} keyboardType="email-address" addTitle="add email" />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginHorizontal: 16, borderRadius: 12, marginBottom: 20, overflow: 'hidden' },
  fieldRow: { paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  multiRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth },
});
