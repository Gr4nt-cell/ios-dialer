import React, { useState } from 'react';
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
import { useNav } from '../nav';
import { Avatar, IconButton, SheetHeader } from '../components/ui';

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

export default function NewContactScreen({ route }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { refreshContacts } = useData();
  const [firstName, setFirst] = useState('');
  const [lastName, setLast] = useState('');
  const [company, setCompany] = useState('');
  const [phones, setPhones] = useState(route.number ? [{ label: 'mobile', value: route.number }] : []);
  const [emails, setEmails] = useState([]);
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState(null);
  const sheet = useActionSheet();

  const pick = async (camera) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
      }
      const opts = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.92 };
      const res = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (!res.canceled && res.assets && res.assets[0]) setPhoto(res.assets[0].uri);
    } catch {
      // ignore
    }
  };

  const choosePhoto = () => {
    const options = [
      { text: 'Choose Photo', onPress: () => pick(false) },
      { text: 'Take Photo', onPress: () => pick(true) },
    ];
    if (photo) options.push({ text: 'Remove Photo', destructive: true, onPress: () => setPhoto(null) });
    sheet.show({ title: 'Contact Photo', options });
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
      const id = await Contacts.addContactAsync(data);
      if (photo && id && Dialer && Dialer.setContactPhoto) {
        try {
          await Dialer.setContactPhoto(String(id), photo, null);
        } catch {
          // contact is saved; photo is optional
        }
      }
      await refreshContacts(false);
      nav.pop();
    } catch (e) {
      Alert.alert('Couldn’t Save Contact', e && e.message ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.grouped }}>
      <SheetHeader title="New Contact" left={<IconButton glass name="close" onPress={nav.pop} />} right={<IconButton prominent name="checkmark" onPress={save} disabled={!canSave || saving} />} />
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
          <View style={[styles.group, { backgroundColor: t.card }]}>
            <View style={[styles.fieldRow, { borderBottomColor: t.separator }]}>
              <Field value={firstName} onChangeText={setFirst} placeholder="First name" autoFocus={!route.number} />
            </View>
            <View style={[styles.fieldRow, { borderBottomColor: t.separator }]}>
              <Field value={lastName} onChangeText={setLast} placeholder="Last name" />
            </View>
            <View style={[styles.fieldRow, { borderBottomWidth: 0 }]}>
              <Field value={company} onChangeText={setCompany} placeholder="Company" />
            </View>
          </View>
          <MultiRows items={phones} setItems={setPhones} labels={PHONE_LABELS} placeholder="Phone" keyboardType="phone-pad" addTitle="add phone" />
          <MultiRows items={emails} setItems={setEmails} labels={EMAIL_LABELS} placeholder="Email" keyboardType="email-address" addTitle="add email" />
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
