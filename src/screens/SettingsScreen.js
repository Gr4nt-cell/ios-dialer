import React, { useEffect, useMemo, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { Linking, ScrollView, Switch, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../components/Touch';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, gradientFor } from '../gradients';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { cleanNumber, contactName, contactPhoto, formatNumber } from '../phone';
import { Cell, Group, IconButton, Segmented, SheetHeader, TextButton } from '../components/ui';
import { LANGS, deviceLanguage, useT } from '../i18n';
import LanguageWheel from '../components/LanguageWheel';
import DepthPreview from '../components/DepthPreview';
import { DEPTH_DEFAULTS, depthAvailable } from '../depth';
import { useCalls } from '../CallContext';
import Dialer from '../dialer';
import { useActionSheet } from '../components/ActionSheet';

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

// − value + control for the island size settings
function Stepper({ value, onChange, min, max, step = 1, format }) {
  const t = useTheme();
  const btn = (icon, next, disabled) => (
    <Pressable onPress={() => !disabled && onChange(next)} hitSlop={6} disabled={disabled}>
      {({ pressed }) => (
        <View style={{ width: 32, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.fill : t.dark ? '#2C2C2E' : '#EFEFF4', opacity: disabled ? 0.4 : 1 }}>
          <Ionicons name={icon} size={16} color={t.text} />
        </View>
      )}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn('remove', Math.max(min, value - step), value <= min)}
      <Text style={{ color: t.secondary, fontSize: 15, minWidth: 54, textAlign: 'center' }}>{format ? format(value) : value}</Text>
      {btn('add', Math.min(max, value + step), value >= max)}
    </View>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const tr = useT();
  const [langOpen, setLangOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const { settings, updateSettings, blocked, block, unblock, resolve, callLogPerm, refreshCallLog, contactsPerm, refreshContacts, contacts } = useData();
  const { available, isDefault, requestDefault } = useCalls();
  const [vm, setVm] = useState(settings.voicemailNumber);
  const [newBlock, setNewBlock] = useState('');
  const [overlay, setOverlay] = useState(() => ({
    allowed: Dialer && Dialer.canDrawOverlays ? Dialer.canDrawOverlays() : false,
    service: Dialer && Dialer.islandServiceEnabled ? Dialer.islandServiceEnabled() : false,
    ...(Dialer && Dialer.getOverlayPrefs ? Dialer.getOverlayPrefs() : { island: true, rear: true }),
  }));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && Dialer && Dialer.canDrawOverlays)
        setOverlay((o) => ({ ...o, allowed: Dialer.canDrawOverlays(), service: Dialer.islandServiceEnabled ? Dialer.islandServiceEnabled() : false }));
    });
    return () => sub.remove();
  }, []);
  const [islandSize, setIslandSizeState] = useState(() => {
    try {
      return Dialer && Dialer.getIslandSize ? Dialer.getIslandSize() : { height: 0, width: 0, dx: 0, dy: 0 };
    } catch {
      return { height: 0, width: 0, dx: 0, dy: 0 };
    }
  });
  const setIslandSize = (patch) => {
    const next = { ...islandSize, ...patch };
    setIslandSizeState(next);
    try {
      if (Dialer && Dialer.setIslandSize) {
        Dialer.setIslandSize(next.height | 0, next.width | 0, next.dx | 0, next.dy | 0);
        if (Dialer.previewIsland) Dialer.previewIsland();
      }
    } catch {
      // ignore
    }
  };
  const setOverlayPref = (patch) => {
    const next = { ...overlay, ...patch };
    setOverlay(next);
    if (Dialer && Dialer.setOverlayPrefs) Dialer.setOverlayPrefs(next.island !== false, !!next.rear);
  };
  const { width } = useWindowDimensions();
  const tileW = Math.floor((width - 32 - 24 - 30) / 4);
  const bg = settings.callBackground || 'auto';
  const previewColors = bg === 'auto' ? gradientFor('Jane Appleseed') : gradientFor('', bg);

  const depthOn = settings.callPhoto !== false;
  // preview with a built-in sample portrait (AI-generated, not a real person), so none of
  // your contacts' photos appear in Settings
  const sample = useMemo(() => {
    let image = null;
    try {
      image = Dialer && Dialer.previewPhotoUri ? Dialer.previewPhotoUri() : null;
    } catch {
      image = null;
    }
    return { image, name: 'Ama Mensah' };
  }, []);

  const current = settings.language || 'system';
  const activeLang = current === 'system' ? deviceLanguage() : current;

  const toggle = (key) => <Switch value={!!settings[key]} onValueChange={(v) => updateSettings({ [key]: v })} trackColor={{ true: t.green }} thumbColor="#fff" />;

  // ---------- privacy (stored natively, so it applies even before the app is open) ----------
  const sheet = useActionSheet();
  const readPrivacy = () => {
    try {
      return Dialer && Dialer.getPrivacy ? Dialer.getPrivacy() : {};
    } catch {
      return {};
    }
  };
  const [privacy, setPrivacyState] = useState(readPrivacy);
  const setPrivacy = (key, value) => {
    try {
      if (typeof value === 'boolean') Dialer.setPrivacyBool(key, value);
      else if (typeof value === 'number') Dialer.setPrivacyInt(key, value);
      else Dialer.setPrivacyString(key, String(value));
    } catch {
      // ignore
    }
    setPrivacyState(readPrivacy());
  };
  const pToggle = (key) => (
    <Switch value={!!privacy[key]} onValueChange={(v) => setPrivacy(key, v)} trackColor={{ true: t.green }} thumbColor="#fff" />
  );
  const KEEP = [
    { value: 0, label: tr('Forever') },
    { value: 7, label: tr('7 days') },
    { value: 30, label: tr('30 days') },
    { value: 90, label: tr('90 days') },
    { value: 365, label: tr('1 year') },
  ];
  const keepLabel = (v) => (KEEP.find((k) => k.value === v) || KEEP[0]).label;
  const chooseKeep = () =>
    sheet.show({ title: tr('Keep Recordings'), options: KEEP.map((k) => ({ text: k.label + ((privacy.recordingDays || 0) === k.value ? '  ✓' : ''), onPress: () => setPrivacy('recordingDays', k.value) })) });
  const wipe = () =>
    Alert.alert(tr('Delete All Recordings?'), tr('Every call recording on this phone will be deleted. This can’t be undone.'), [
      { text: tr('Cancel'), style: 'cancel' },
      { text: tr('Delete All'), style: 'destructive', onPress: () => Dialer && Dialer.deleteAllPrivateData && Dialer.deleteAllPrivateData() },
    ]);
  const chev = <Ionicons name="chevron-forward" size={18} color={t.tertiary} />;
  const valueRight = (txt) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ color: t.secondary, fontSize: 16 }}>{txt}</Text>
      {chev}
    </View>
  );

  const permRow = (label, status, onAsk) => (
    <Cell
      value={label}
      onPress={status === 'granted' ? undefined : onAsk}
      right={
        status === 'granted' ? (
          <Ionicons name="checkmark-circle" size={20} color={t.green} />
        ) : status === 'unavailable' ? (
          <Text style={{ color: t.secondary, fontSize: 15 }}>{tr('Needs app build')}</Text>
        ) : (
          <Text style={{ color: t.blue, fontSize: 15 }}>{tr('Allow')}</Text>
        )
      }
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <SheetHeader title={tr('Settings')} right={<IconButton prominent name="checkmark" onPress={nav.pop} />} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 10 }}>
        <SectionTitle>{tr('Default Phone App')}</SectionTitle>
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

        <SectionTitle>{tr('Appearance')}</SectionTitle>
        <Group>
          <Cell value="Theme" right={<Segmented options={[{ label: tr('System'), value: 'system' }, { label: tr('Light'), value: 'light' }, { label: tr('Dark'), value: 'dark' }]} value={settings.theme || 'system'} onChange={(v) => updateSettings({ theme: v })} />} />
          <Cell
            value="Liquid Glass"
            right={
              <Switch
                value={settings.liquidGlass !== false}
                onValueChange={(v) => updateSettings({ liquidGlass: v })}
                trackColor={{ true: t.green }}
                thumbColor="#fff"
              />
            }
          />
          {settings.liquidGlass !== false ? (
            <Cell value="Glass" right={<Segmented options={[{ label: tr('Clear'), value: 'clear' }, { label: tr('Tinted'), value: 'tinted' }]} value={settings.glass || 'clear'} onChange={(v) => updateSettings({ glass: v })} />} />
          ) : null}
          <Cell
            value={tr('Language')}
            onPress={() => setLangOpen(true)}
            right={
              <Text style={{ color: t.secondary, fontSize: 15 }}>
                {(LANGS.find((l) => l.code === activeLang) || LANGS[0]).name}
              </Text>
            }
          />
        </Group>
        <Footer>Liquid Glass off replaces the frosted panels with solid cards, which is easier to read and lighter to draw. Tinted makes glass more opaque. The call screen always stays dark.</Footer>

        <SectionTitle>{tr('Dynamic Island')}</SectionTitle>
        <Group>
          <Cell value="Show Calls Around Camera" right={<Switch value={overlay.island !== false} onValueChange={(v) => setOverlayPref({ island: v })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
          <Cell
            value="Turn On Call Island"
            onPress={overlay.service || !Dialer ? undefined : () => Dialer.openAccessibilitySettings()}
            right={overlay.service ? <Ionicons name="checkmark-circle" size={20} color={t.green} /> : <Text style={{ color: t.blue, fontSize: 15 }}>{tr('Open')}</Text>}
          />
          {overlay.service ? (
            <>
              <Cell
                value="Thickness"
                right={
                  <Stepper
                    value={islandSize.height}
                    min={0}
                    max={40}
                    onChange={(v) => setIslandSize({ height: v > 0 && v < 12 ? (islandSize.height === 0 ? 12 : 0) : v })}
                    format={(v) => (v === 0 ? 'Auto' : `${v}`)}
                  />
                }
              />
              <Cell value="Width" right={<Stepper value={islandSize.width} min={-16} max={40} step={2} onChange={(v) => setIslandSize({ width: v })} format={(v) => (v > 0 ? `+${v}` : `${v}`)} />} />
              <Cell value="Move Up / Down" right={<Stepper value={islandSize.dy} min={-15} max={40} onChange={(v) => setIslandSize({ dy: v })} format={(v) => (v > 0 ? `↓ ${v}` : v < 0 ? `↑ ${-v}` : '0')} />} />
              <Cell value="Move Left / Right" right={<Stepper value={islandSize.dx} min={-60} max={60} step={2} onChange={(v) => setIslandSize({ dx: v })} format={(v) => (v > 0 ? `→ ${v}` : v < 0 ? `← ${-v}` : '0')} />} />
              <Cell value="Preview Island" color={t.blue} onPress={() => Dialer && Dialer.previewIsland && Dialer.previewIsland()} />
              <Cell value="Reset Size" color={t.red} onPress={() => setIslandSize({ height: 0, width: 0, dx: 0, dy: 0 })} />
            </>
          ) : null}
          {!overlay.service ? (
            <Cell value="Allow Restricted Settings" onPress={Dialer ? () => Dialer.openAppInfo() : undefined} right={<Text style={{ color: t.blue, fontSize: 15 }}>{tr('App Info')}</Text>} />
          ) : null}
        </Group>
        <Footer>
          {overlay.service
            ? 'During a call, a pill around the selfie camera shows the timer. Tap it for mute, speaker and end (or answer and decline), tap the name to open the call. Changing the size shows a preview for a few seconds; sizes are in dp, Auto fits it to your camera.'
            : 'To put calls around the selfie camera, turn on "Call Island" under Accessibility › Downloaded apps. If Android says it\'s a restricted setting, tap App Info, then ⋮ › Allow restricted settings, and try again. The island only draws the call; it doesn\'t read your screen.'}
        </Footer>

        <SectionTitle>{tr('Rear Screen')}</SectionTitle>
        <Group>
          <Cell
            value="Display over Other Apps"
            onPress={overlay.allowed || !Dialer ? undefined : () => Dialer.openOverlaySettings()}
            right={overlay.allowed ? <Ionicons name="checkmark-circle" size={20} color={t.green} /> : <Text style={{ color: t.blue, fontSize: 15 }}>{tr('Allow')}</Text>}
          />
          <Cell value="Show Calls on Rear Screen" right={<Switch value={overlay.rear !== false} onValueChange={(v) => setOverlayPref({ rear: v })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
        </Group>
        <Footer>On phones with a rear or cover screen that apps can use, calls and their buttons appear there. Needs "Display over other apps".</Footer>

        <SectionTitle>{tr('Call Screen')}</SectionTitle>
        <Group>
          <Cell value="Contact Photos" right={toggle('callPhoto')} />
          <Cell value="Depth Effect" right={<Switch value={settings.callDepth !== false && settings.callPhoto !== false} disabled={settings.callPhoto === false} onValueChange={(v) => updateSettings({ callDepth: v })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
        </Group>
        <Footer>Shows a contact’s picture full screen while you’re on a call with them. Depth Effect places the person in front of their name, the way a poster looks.</Footer>

        {depthOn ? (
          <>
            <SectionTitle>{tr('Depth Adjustment')}</SectionTitle>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <DepthPreview
                image={sample.image}
                name={sample.name}
                settings={settings}
                enabled={settings.callDepth !== false}
                limits={{ x: 60, y: 80 }}
                onAdjust={updateSettings}
              />
              <Text style={{ color: t.tertiary, fontSize: 12, marginTop: 8 }}>{tr('Drag the preview to move the person')}</Text>
            </View>
            <Group>
              <Cell
                value={tr('Size')}
                right={
                  <Stepper
                    value={settings.depthScale ?? DEPTH_DEFAULTS.depthScale}
                    min={100}
                    max={170}
                    step={5}
                    onChange={(v) => updateSettings({ depthScale: v })}
                    format={(v) => `${v}%`}
                  />
                }
              />
              <Cell
                value={tr('Move Up / Down')}
                right={
                  <Stepper
                    value={settings.depthY ?? DEPTH_DEFAULTS.depthY}
                    min={-80}
                    max={80}
                    step={4}
                    onChange={(v) => updateSettings({ depthY: v })}
                    format={(v) => (v > 0 ? `↓ ${v}` : v < 0 ? `↑ ${-v}` : '0')}
                  />
                }
              />
              <Cell
                value={tr('Move Left / Right')}
                right={
                  <Stepper
                    value={settings.depthX ?? DEPTH_DEFAULTS.depthX}
                    min={-60}
                    max={60}
                    step={4}
                    onChange={(v) => updateSettings({ depthX: v })}
                    format={(v) => (v > 0 ? `→ ${v}` : v < 0 ? `← ${-v}` : '0')}
                  />
                }
              />
              <Cell value={tr('Reset')} color={t.blue} onPress={() => updateSettings({ ...DEPTH_DEFAULTS })} />
            </Group>
            <Footer>
              {sample.image
                ? 'Line the person up against their name. The preview uses one of your contact photos and the same cut-out the call screen uses.'
                : depthAvailable()
                ? 'Add a photo to a contact to see the cut-out here. The controls still apply on a call.'
                : 'Depth cut-outs need the installed app build; the controls still apply on a call.'}
            </Footer>
          </>
        ) : null}

        <SectionTitle>{tr('Call Background')}</SectionTitle>
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

        <SectionTitle>{tr('Call Recording')}</SectionTitle>
        <Group>
          <Cell value="Record Calls Automatically" right={toggle('autoRecord')} />
          <Cell value={tr('Recordings')} color={t.blue} onPress={() => nav.push({ name: 'recordings' })} right={<Ionicons name="chevron-forward" size={18} color={t.tertiary} />} />
        </Group>
        <Footer>Tap Record on the call screen to record a call. Android only lets the phone’s own system app hear the other side directly, so on most phones turn on Speaker while recording to capture both voices clearly. Recording laws differ by country — let people know when you record.</Footer>

        <SectionTitle>{tr('Privacy')}</SectionTitle>
        <Group>
          <Cell value={tr('Hide Caller on Lock Screen')} right={pToggle('hideOnLockScreen')} />
          <Cell value={tr('Block Screenshots')} right={pToggle('blockScreenshots')} />
          <Cell value={tr('Keep Recordings')} onPress={chooseKeep} right={valueRight(keepLabel(privacy.recordingDays || 0))} />
          <Cell value={tr('Privacy Policy')} color={t.blue} onPress={() => nav.push({ name: 'privacyPolicy' })} right={chev} />
          <Cell value={tr('Delete All Recordings')} color={t.red} onPress={wipe} />
        </Group>
        <Footer>
          {tr(
            'Your calls stay on this phone. Recordings are kept in the app’s private storage, which other apps can’t read; they are never uploaded and are left out of phone backups. The app has no internet access.'
          )}
        </Footer>

        <SectionTitle>{tr('Sounds & Haptics')}</SectionTitle>
        <Group>
          <Cell value="Dial Pad Tones" right={toggle('dialTones')} />
          <Cell value="Keypad Haptics" right={toggle('haptics')} />
        </Group>
        <Footer>{tr('Plays a tone and a light tap for each key you press.')}</Footer>

        <SectionTitle>{tr('Voicemail')}</SectionTitle>
        <Group>
          <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontSize: 17, width: 110 }}>{tr('Number')}</Text>
            <TextInput
              value={vm}
              onChangeText={setVm}
              onEndEditing={() => updateSettings({ voicemailNumber: cleanNumber(vm) })}
              onBlur={() => updateSettings({ voicemailNumber: cleanNumber(vm) })}
              placeholder={tr('Carrier default')}
              placeholderTextColor={t.secondary}
              keyboardType="phone-pad"
              style={{ flex: 1, color: t.text, fontSize: 17, paddingVertical: 14, textAlign: 'right' }}
            />
          </View>
        </Group>
        <Footer>{tr('Leave empty to use your SIM’s voicemail number.')}</Footer>

        <SectionTitle>{tr('Blocked Contacts')}</SectionTitle>
        <Group>
          {blocked.map((n) => {
            const match = resolve(n);
            return (
              <Cell
                key={n}
                value={match ? contactName(match.contact) : formatNumber(n)}
                right={<TextButton title={tr('Unblock')} color={t.red} onPress={() => unblock(n)} />}
              >
                {match ? <Text style={{ color: t.secondary, fontSize: 13 }}>{formatNumber(n)}</Text> : null}
              </Cell>
            );
          })}
          <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
            <TextInput
              value={newBlock}
              onChangeText={setNewBlock}
              placeholder={tr('Add number to block')}
              placeholderTextColor={t.secondary}
              keyboardType="phone-pad"
              style={{ flex: 1, color: t.text, fontSize: 17, paddingVertical: 14 }}
            />
            <TextButton
              title={tr('Block')}
              disabled={!cleanNumber(newBlock)}
              onPress={() => {
                block(cleanNumber(newBlock));
                setNewBlock('');
              }}
            />
          </View>
        </Group>
        <Footer>{isDefault ? 'Blocked numbers can’t call or text this phone.' : 'Blocked numbers are flagged in Recents. Make Phone your default to block them system-wide.'}</Footer>

        <SectionTitle>{tr('Access')}</SectionTitle>
        <Group>
          {permRow('Contacts', contactsPerm, () => refreshContacts(true))}
          {permRow('Call History', callLogPerm, () => refreshCallLog(true))}
          <Cell value="Open App Settings" color={t.blue} onPress={() => Linking.openSettings()} />
        </Group>
        <Footer>{tr('If a permission was turned off, re-enable it in app settings.')}</Footer>
      </ScrollView>

      <LanguageWheel
        visible={langOpen}
        options={LANGS}
        value={activeLang}
        onChange={(code) => updateSettings({ language: code })}
        onClose={() => setLangOpen(false)}
      />
    </View>
  );
}
