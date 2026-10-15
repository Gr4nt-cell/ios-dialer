import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Linking, Pressable, ScrollView, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, gradientFor } from '../gradients';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { cleanNumber, contactName, formatNumber } from '../phone';
import { Cell, Group, IconButton, Segmented, SheetHeader, TextButton } from '../components/ui';
import { useCalls } from '../CallContext';
import Dialer from '../dialer';

function SectionTitle({ children }) {
  const t = useTheme();
  return <Text style={{ color: t.secondary, fontSize: 13, marginHorizontal: 32, marginBottom: 6, marginTop: 4, textTransform: 'uppercase' }}>{children}</Text>;
}

function Footer({ children }) {
  const t = useTheme();
  return <Text style={{ color: t.secondary, fontSize: 13, marginHorizontal: 32, marginTop: 6, marginBottom: 24, lineHeight: 18 }}>{children}</Text>;
}

function Swatch({ colors, name, selected, onPress, width, auto }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ width, alignItems: 'center', marginBottom: 12 }}>
      {({ pressed }) => (
        <>
          <View
            style={{
              width,
              height: width * 1.5,
              borderRadius: 16,
              padding: 2,
              borderWidth: 2.5,
              borderColor: selected ? t.blue : 'transparent',
              transform: [{ scale: pressed ? 0.95 : 1 }],
            }}
          >
            <LinearGradient colors={colors} locations={auto ? undefined : [0, 0.55, 1]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={{ flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              {auto ? <Ionicons name="sparkles" size={22} color="#fff" /> : null}
              {selected ? (
                <View style={{ position: 'absolute', right: 5, top: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              ) : null}
            </LinearGradient>
          </View>
          <Text style={{ color: selected ? t.blue : t.secondary, fontSize: 12, marginTop: 4, fontWeight: selected ? '600' : '400' }} numberOfLines={1}>
            {name}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function CallPreview({ colors }) {
  return (
    <LinearGradient colors={[colors[0], colors[1], colors[2]]} locations={[0, 0.5, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 150, borderRadius: 18, margin: 12, marginBottom: 4, padding: 14, justifyContent: 'space-between' }}>
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }} />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>calling mobile…</Text>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700' }}>Jane Appleseed</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22 }}>
        {['volume-medium', 'pause', 'mic-off-outline'].map((n) => (
          <View key={n} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={n} size={16} color="#fff" />
          </View>
        ))}
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="call" size={16} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </View>
      </View>
    </LinearGradient>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { settings, updateSettings, blocked, block, unblock, resolve, callLogPerm, refreshCallLog, contactsPerm, refreshContacts } = useData();
  const { available, isDefault, requestDefault } = useCalls();
  const [vm, setVm] = useState(settings.voicemailNumber);
  const [newBlock, setNewBlock] = useState('');
  const [overlay, setOverlay] = useState(() => ({
    allowed: Dialer && Dialer.canDrawOverlays ? Dialer.canDrawOverlays() : false,
    ...(Dialer && Dialer.getOverlayPrefs ? Dialer.getOverlayPrefs() : { island: true, rear: true }),
  }));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && Dialer && Dialer.canDrawOverlays) setOverlay((o) => ({ ...o, allowed: Dialer.canDrawOverlays() }));
    });
    return () => sub.remove();
  }, []);
  const setOverlayPref = (patch) => {
    const next = { ...overlay, ...patch };
    setOverlay(next);
    if (Dialer && Dialer.setOverlayPrefs) Dialer.setOverlayPrefs(!!next.island, !!next.rear);
  };
  const { width } = useWindowDimensions();
  const tileW = Math.floor((width - 32 - 24 - 30) / 4);
  const bg = settings.callBackground || 'auto';
  const previewColors = bg === 'auto' ? gradientFor('Jane Appleseed') : gradientFor('', bg);

  const toggle = (key) => <Switch value={!!settings[key]} onValueChange={(v) => updateSettings({ [key]: v })} trackColor={{ true: t.green }} thumbColor="#fff" />;

  const permRow = (label, status, onAsk) => (
    <Cell
      value={label}
      onPress={status === 'granted' ? undefined : onAsk}
      right={
        status === 'granted' ? (
          <Ionicons name="checkmark-circle" size={20} color={t.green} />
        ) : status === 'unavailable' ? (
          <Text style={{ color: t.secondary, fontSize: 15 }}>Needs app build</Text>
        ) : (
          <Text style={{ color: t.blue, fontSize: 15 }}>Allow</Text>
        )
      }
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.grouped }}>
      <SheetHeader title="Settings" right={<IconButton prominent name="checkmark" onPress={nav.pop} />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 10 }}>
        <SectionTitle>Default Phone App</SectionTitle>
        <Group>
          <Cell
            value={isDefault ? 'Phone is your default' : 'Set as Default Phone App'}
            color={isDefault ? undefined : t.blue}
            onPress={
              !available || isDefault
                ? undefined
                : async () => {
                    const ok = await requestDefault();
                    if (!ok && Dialer) Dialer.openDefaultAppsSettings();
                  }
            }
            right={isDefault ? <Ionicons name="checkmark-circle" size={20} color={t.green} /> : null}
          />
          {isDefault && Dialer ? <Cell value="Change Default Apps" color={t.blue} onPress={() => Dialer.openDefaultAppsSettings()} /> : null}
        </Group>
        <Footer>
          {available
            ? 'As the default, Phone shows its own screen for incoming and outgoing calls, and blocked numbers apply to the whole phone.'
            : 'Install the app build (not Expo Go) to use Phone as your default.'}
        </Footer>

        <SectionTitle>Appearance</SectionTitle>
        <Group>
          <Cell value="Theme" right={<Segmented options={[{ label: 'System', value: 'system' }, { label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }]} value={settings.theme || 'system'} onChange={(v) => updateSettings({ theme: v })} />} />
          <Cell value="Layout" right={<Segmented options={[{ label: 'Unified', value: 'unified' }, { label: 'Classic', value: 'classic' }]} value={settings.layout || 'unified'} onChange={(v) => updateSettings({ layout: v })} />} />
          <Cell value="Glass" right={<Segmented options={[{ label: 'Clear', value: 'clear' }, { label: 'Tinted', value: 'tinted' }]} value={settings.glass || 'clear'} onChange={(v) => updateSettings({ glass: v })} />} />
        </Group>
        <Footer>Unified puts favorites and recents together in Calls with a search button; Classic shows separate Favorites, Recents and Voicemail tabs. Tinted makes glass more opaque and easier to read. The call screen always stays dark.</Footer>

        <SectionTitle>Dynamic Island</SectionTitle>
        <Group>
          <Cell
            value="Display over Other Apps"
            onPress={overlay.allowed || !Dialer ? undefined : () => Dialer.openOverlaySettings()}
            right={overlay.allowed ? <Ionicons name="checkmark-circle" size={20} color={t.green} /> : <Text style={{ color: t.blue, fontSize: 15 }}>Allow</Text>}
          />
          <Cell value="Show Calls Around Camera" right={<Switch value={overlay.island !== false} onValueChange={(v) => setOverlayPref({ island: v })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
          <Cell value="Show Calls on Rear Screen" right={<Switch value={overlay.rear !== false} onValueChange={(v) => setOverlayPref({ rear: v })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
        </Group>
        <Footer>While you're on a call in another app, a pill around the selfie camera shows the timer — tap it for mute, speaker and end, or to answer an incoming call. On phones with a rear or cover screen that apps can use, the call and its buttons appear there too. Both need "Display over other apps".</Footer>

        <SectionTitle>Call Screen</SectionTitle>
        <Group>
          <Cell value="Contact Photos" right={toggle('callPhoto')} />
          <Cell value="Depth Effect" right={<Switch value={settings.callDepth !== false && settings.callPhoto !== false} disabled={settings.callPhoto === false} onValueChange={(v) => updateSettings({ callDepth: v })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
        </Group>
        <Footer>Shows a contact’s picture full screen while you’re on a call with them. Depth Effect places the person in front of their name, the way a poster looks.</Footer>

        <SectionTitle>Call Background</SectionTitle>
        <Group>
          <CallPreview colors={previewColors} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, paddingBottom: 2 }}>
            <Swatch auto width={tileW} name="Automatic" colors={['#3A5BD9', '#D04A8C', '#2EE6A6', '#FF8A3D']} selected={bg === 'auto'} onPress={() => updateSettings({ callBackground: 'auto' })} />
            {GRADIENTS.map((g) => (
              <Swatch key={g.id} width={tileW} name={g.name} colors={g.colors} selected={bg === g.id} onPress={() => updateSettings({ callBackground: g.id })} />
            ))}
          </View>
        </Group>
        <Footer>Used for callers without a photo. Automatic gives every contact their own colours.</Footer>

        <SectionTitle>Call Recording</SectionTitle>
        <Group>
          <Cell value="Record Calls Automatically" right={toggle('autoRecord')} />
          <Cell value="Recordings" color={t.blue} onPress={() => nav.push({ name: 'recordings' })} right={<Ionicons name="chevron-forward" size={18} color={t.tertiary} />} />
        </Group>
        <Footer>Tap Record on the call screen to record a call. Android only lets the phone’s own system app hear the other side directly, so on most phones turn on Speaker while recording to capture both voices clearly. Recording laws differ by country — let people know when you record.</Footer>

        <SectionTitle>Sounds & Haptics</SectionTitle>
        <Group>
          <Cell value="Dial Pad Tones" right={toggle('dialTones')} />
          <Cell value="Keypad Haptics" right={toggle('haptics')} />
        </Group>
        <Footer>Plays a tone and a light tap for each key you press.</Footer>

        <SectionTitle>Voicemail</SectionTitle>
        <Group>
          <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontSize: 17, width: 110 }}>Number</Text>
            <TextInput
              value={vm}
              onChangeText={setVm}
              onEndEditing={() => updateSettings({ voicemailNumber: cleanNumber(vm) })}
              onBlur={() => updateSettings({ voicemailNumber: cleanNumber(vm) })}
              placeholder="Carrier default"
              placeholderTextColor={t.secondary}
              keyboardType="phone-pad"
              style={{ flex: 1, color: t.text, fontSize: 17, paddingVertical: 14, textAlign: 'right' }}
            />
          </View>
        </Group>
        <Footer>Leave empty to use your SIM’s voicemail number.</Footer>

        <SectionTitle>USSD Codes</SectionTitle>
        <Group>
          <Cell value="Show Replies in App" right={toggle('ussdInApp')} />
        </Group>
        <Footer>Codes like *124# show the network’s reply here. Turn off to always use the network’s own dialog, which works best for long menus.</Footer>

        <SectionTitle>Blocked Contacts</SectionTitle>
        <Group>
          {blocked.map((n) => {
            const match = resolve(n);
            return (
              <Cell
                key={n}
                value={match ? contactName(match.contact) : formatNumber(n)}
                right={<TextButton title="Unblock" color={t.red} onPress={() => unblock(n)} />}
              >
                {match ? <Text style={{ color: t.secondary, fontSize: 13 }}>{formatNumber(n)}</Text> : null}
              </Cell>
            );
          })}
          <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              value={newBlock}
              onChangeText={setNewBlock}
              placeholder="Add number to block"
              placeholderTextColor={t.secondary}
              keyboardType="phone-pad"
              style={{ flex: 1, color: t.text, fontSize: 17, paddingVertical: 14 }}
            />
            <TextButton
              title="Block"
              disabled={!cleanNumber(newBlock)}
              onPress={() => {
                block(cleanNumber(newBlock));
                setNewBlock('');
              }}
            />
          </View>
        </Group>
        <Footer>{isDefault ? 'Blocked numbers can’t call or text this phone.' : 'Blocked numbers are flagged in Recents. Make Phone your default to block them system-wide.'}</Footer>

        <SectionTitle>Access</SectionTitle>
        <Group>
          {permRow('Contacts', contactsPerm, () => refreshContacts(true))}
          {permRow('Call History', callLogPerm, () => refreshCallLog(true))}
          <Cell value="Open App Settings" color={t.blue} onPress={() => Linking.openSettings()} />
        </Group>
        <Footer>If a permission was turned off, re-enable it in app settings.</Footer>
      </ScrollView>
    </View>
  );
}
