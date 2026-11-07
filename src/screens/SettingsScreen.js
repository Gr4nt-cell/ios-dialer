import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { usePaneSize } from '../device';
import { Image, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DepthPreview from '../components/DepthPreview';
import DepthEditor from '../components/DepthEditor';
import { posterSettings, posterPatch } from '../depthSettings';
import { DEPTH_DEFAULTS, DEPTH_LIMITS, depthAvailable, useDepth } from '../depth';
import { Pressable } from '../components/Touch';
import { Glass } from '../components/Glass';
import WallpaperGrid from '../components/WallpaperGrid';
import { LinearGradient } from 'expo-linear-gradient';
import { gradientFor } from '../gradients';
import { callAppearance } from '../callAppearance';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fs, useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { cleanNumber, contactName, contactPhoto, formatNumber } from '../phone';
import { Cell, ChromeText, Group, IconButton, Segmented, SheetHeader, TextButton } from '../components/ui';
import { LANGS, deviceLanguage, useT } from '../i18n';
import LanguageWheel from '../components/LanguageWheel';
import { useCalls } from '../CallContext';
import Dialer from '../dialer';
import { useActionSheet } from '../components/ActionSheet';
import { appBackgroundId, callBackgroundId, getCallWallpaperSource, WALLPAPERS } from '../wallpapers';

function SectionTitle({ children }) {
  const t = useTheme();
  return <Text style={{ color: t.secondary, fontSize: fs(13), marginHorizontal: 32, marginBottom: 6, marginTop: 4, textTransform: 'uppercase' }}>{children}</Text>;
}

function Footer({ children }) {
  const t = useTheme();
  return <Text style={{ color: t.secondary, fontSize: fs(13), marginHorizontal: 32, marginTop: 6, marginBottom: 24, lineHeight: fs(18) }}>{children}</Text>;
}


function CallPreview({ colors, light, wallpaper, custom }) {
  const t = useTheme();
  const tr = useT();
  return (
    <View style={{ height: 150, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', margin: 12, marginBottom: 4, overflow: 'hidden', backgroundColor: light ? colors[2] : '#000000' }}>
      {wallpaper ? <Image source={wallpaper} resizeMode={custom ? 'cover' : 'stretch'} fadeDuration={0} style={StyleSheet.absoluteFill} /> : null}
      {!light && wallpaper ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.68)' }]} /> : null}
      <View style={{ flex: 1, padding: 14, justifyContent: 'space-between' }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ color: light ? '#53685F' : '#A9BBB3', fontSize: fs(12) }}>{tr('calling mobile…')}</Text>
          <Text style={{ color: light ? '#1D2428' : '#fff', fontSize: fs(24), fontWeight: '700' }}>Jane Appleseed</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22 }}>
          {['volume-medium', 'pause', 'mic'].map((n) => (
            <Glass key={n} dark={!light} liquid vivid outline soft radius={17} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={n} size={16} color={light ? '#1D2428' : '#fff'} />
            </Glass>
          ))}
          <Glass dark={!light} liquid vivid outline soft radius={17} tint="#FF3B30" tintOpacity={0.95} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="call" size={16} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </Glass>
        </View>
      </View>
    </View>
  );
}

function Stepper({ value, onChange, min, max, step = 1, format }) {
  const t = useTheme();
  const btn = (icon, next, disabled) => (
    <Pressable onPress={() => !disabled && onChange(next)} hitSlop={6} disabled={disabled}>
      {({ pressed }) => (
        <View style={{ width: 32, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.fill : t.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder, opacity: disabled ? 0.4 : 1 }}>
          <Ionicons name={icon} size={16} color={t.text} />
        </View>
      )}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn('remove', Math.max(min, value - step), value <= min)}
      <Text style={{ color: t.secondary, fontSize: fs(15), minWidth: 54, textAlign: 'center' }}>{format ? format(value) : value}</Text>
      {btn('add', Math.min(max, value + step), value >= max)}
    </View>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const tr = useT();
  const [depthEditor, setDepthEditor] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [announcer, setAnnouncer] = useState(() => {
    try { return Dialer?.getCallAnnouncer?.() || { enabled: false, speakNumbers: false }; } catch { return { enabled: false, speakNumbers: false }; }
  });
  const [testingAnnouncer, setTestingAnnouncer] = useState(false);
  const [announcementVoices, setAnnouncementVoices] = useState(() => {
    try { return Dialer?.getAnnouncementVoices?.() || { callerVoice: 'female' }; }
    catch { return { callerVoice: 'female' }; }
  });
  const chooseAnnouncementVoice = (kind, voice) => {
    if (Dialer?.setAnnouncementVoice?.(kind, voice)) setAnnouncementVoices((previous) => ({ ...previous, [kind]: voice }));
    else Alert.alert(tr('Voice'), 'Install the updated Android app to choose an announcement voice.');
  };
  const voiceSelector = (kind) => <Segmented options={[{ label: tr('Female'), value: 'female' }, { label: tr('Male'), value: 'male' }]} value={announcementVoices[kind]} onChange={(voice) => chooseAnnouncementVoice(kind, voice)} />;
  const updateAnnouncer = (patch) => {
    const next = { ...announcer, ...patch };
    try {
      if (!Dialer?.setCallAnnouncer) throw new Error('Install the updated Android build to use the call announcer.');
      Dialer.setCallAnnouncer(next.enabled, next.speakNumbers);
      setAnnouncer(next);
    } catch (error) { Alert.alert(tr('Call Announcer'), error.message); }
  };
  const testAnnouncer = async () => {
    if (testingAnnouncer) return;
    setTestingAnnouncer(true);
    try {
      if (!Dialer?.testCallAnnouncer) throw new Error('Install the updated Android build to test the call announcer.');
      const result = await Dialer.testCallAnnouncer();
      if (!result.ok) Alert.alert(tr('Call Announcer'), result.error || 'The bundled announcement could not play.');
    } catch (error) { Alert.alert(tr('Call Announcer'), error.message); }
    finally { setTestingAnnouncer(false); }
  };
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
  const { width } = usePaneSize();
  const bg = callBackgroundId(settings.callBackground);
  const previewColors = gradientFor('Jane Appleseed', bg);
  const callLook = callAppearance(t, bg);
  const lightCallBackground = callLook.light;
  const wallpaperSource = getCallWallpaperSource(settings, t.dark);
  const sample = useMemo(() => {
    let image = null;
    try {
      image = Dialer && Dialer.previewPhotoUri ? Dialer.previewPhotoUri() : null;
    } catch {
      image = null;
    }
    return { image, name: 'Ella Mensah' };
  }, []);

  const depthOn = settings.depth !== false && settings.callPhoto !== false;
  const sampleDepth = useDepth(depthOn ? sample.image : null, depthOn);
  const depthStatus =
    !sample.image ? 'No photo to work from — add one to a contact.'
    : sampleDepth.status === 'ready' ? 'Cut-out ready. Drag the preview, or use the controls below.'
    : sampleDepth.status === 'wait' ? 'Preparing the cut-out… if this stays, Play services is still fetching the subject-detection model.'
    : sampleDepth.status === 'none' ? 'No clear subject in this photo, so it keeps the plain circle. Try a contact photo with a person in the foreground.'
    : depthAvailable() ? `Couldn’t make a cut-out${sampleDepth.detail ? ` (${sampleDepth.detail})` : ''}.`
    : 'Cut-outs need the installed app build; the controls still apply on a call.';

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
      Dialer?.setPrivacyBool?.(key, value);
    } catch {
      // ignore
    }
    setPrivacyState(readPrivacy());
  };
  const pToggle = (key) => (
    <Switch value={!!privacy[key]} onValueChange={(v) => setPrivacy(key, v)} trackColor={{ true: t.green }} thumbColor="#fff" />
  );
  const chev = <Ionicons name="chevron-forward" size={18} color={t.tertiary} />;
  const valueRight = (txt) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ color: t.secondary, fontSize: fs(16) }}>{txt}</Text>
      {chev}
    </View>
  );

  const readFullScreen = () => {
    try {
      return Dialer && Dialer.canFullScreen ? !!Dialer.canFullScreen() : true;
    } catch {
      return true;
    }
  };
  const [fullScreenOk, setFullScreenOk] = useState(readFullScreen);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setFullScreenOk(readFullScreen());
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [ring, setRing] = useState(() => {
    try {
      return Dialer && Dialer.getAppRingtone ? Dialer.getAppRingtone() : null;
    } catch {
      return null;
    }
  });
  const chooseRingtone = async () => {
    try {
      if (Dialer && Dialer.pickRingtone) setRing(await Dialer.pickRingtone());
    } catch {
      // ignore
    }
  };

  const permRow = (label, status, onAsk) => (
    <Cell
      value={label}
      onPress={status === 'granted' ? undefined : onAsk}
      right={
        status === 'granted' ? (
          <Ionicons name="checkmark-circle" size={20} color={t.green} />
        ) : status === 'unavailable' ? (
          <Text style={{ color: t.secondary, fontSize: fs(15) }}>{tr('Needs app build')}</Text>
        ) : (
          <Text style={{ color: t.blue, fontSize: fs(15) }}>{tr('Allow')}</Text>
        )
      }
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <DepthEditor visible={depthEditor} onClose={() => setDepthEditor(false)} settings={posterSettings(settings)} updateSettings={(p) => updateSettings(posterPatch(p))} contacts={sample.image ? [{ name: sample.name, largeImage: { uri: sample.image } }] : []} />
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
              <Text style={{ color: t.secondary, fontSize: fs(15) }}>
                {(LANGS.find((l) => l.code === activeLang) || LANGS[0]).name}
              </Text>
            }
          />
        </Group>
        <Footer>Glass rendering adapts automatically to your device. Static highlights and lighter shadows keep the same design responsive on lower-end phones.</Footer>

        <SectionTitle>App Background</SectionTitle>
        <Group>
          <View style={{ padding: 12 }}>
            <WallpaperGrid dark={t.dark} selectedId={appBackgroundId(settings.appBackground)} onSelect={(id) => updateSettings({ appBackground: id })} items={WALLPAPERS} />
          </View>
        </Group>

        <SectionTitle>{tr('Dynamic Island')}</SectionTitle>
        <Group>
          <Cell value="Show Calls Around Camera" right={<Switch value={overlay.island !== false} onValueChange={(v) => setOverlayPref({ island: v })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
          <Cell
            value="Turn On Call Island"
            onPress={overlay.service || !Dialer ? undefined : () => Dialer.openAccessibilitySettings()}
            right={overlay.service ? <Ionicons name="checkmark-circle" size={20} color={t.green} /> : <Text style={{ color: t.blue, fontSize: fs(15) }}>{tr('Open')}</Text>}
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
            <Cell value="Allow Restricted Settings" onPress={Dialer ? () => Dialer.openAppInfo() : undefined} right={<Text style={{ color: t.blue, fontSize: fs(15) }}>{tr('App Info')}</Text>} />
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
            right={overlay.allowed ? <Ionicons name="checkmark-circle" size={20} color={t.green} /> : <Text style={{ color: t.blue, fontSize: fs(15) }}>{tr('Allow')}</Text>}
          />
          <Cell value="Show Calls on Rear Screen" right={<Switch value={overlay.rear !== false} onValueChange={(v) => setOverlayPref({ rear: v })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
        </Group>
        <Footer>On phones with a rear or cover screen that apps can use, calls and their buttons appear there. Needs "Display over other apps".</Footer>

        <SectionTitle>{tr('Call Screen')}</SectionTitle>
        <Group>
          <Cell value="Contact Photos" right={toggle('callPhoto')} />
          <Cell value="Adjust Depth & Live Preview" color={t.blue} onPress={() => setDepthEditor(true)} right={<Ionicons name="chevron-forward" size={18} color={t.tertiary} />} />
          <Cell
            value="Depth Effect"
            right={
              <Switch
                value={settings.depth !== false && settings.callPhoto !== false}
                disabled={settings.callPhoto === false}
                onValueChange={(v) => updateSettings({ depth: v })}
                trackColor={{ true: t.green }}
                thumbColor="#fff"
              />
            }
          />
        </Group>
        <Footer>Depth Effect places a full-resolution cutout over the caller’s name, with softly fading shoulders. Adjust size, position, fade and typography in the live preview.</Footer>

        {depthOn ? (
          <>
            <SectionTitle>{tr('Depth Adjustment')}</SectionTitle>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <DepthPreview
                image={sample.image}
                name={sample.name}
                settings={settings}
                enabled
                onAdjust={updateSettings}
              />
              <Text style={{ color: t.tertiary, fontSize: fs(12), marginTop: 8 }}>{tr('Drag the preview to move the person')}</Text>
            </View>
            <Group>
              <Cell
                value={tr('Sprout')}
                right={
                  <Stepper
                    value={settings.depthSprout ?? DEPTH_DEFAULTS.depthSprout}
                    min={DEPTH_LIMITS.sprout.min}
                    max={DEPTH_LIMITS.sprout.max}
                    step={DEPTH_LIMITS.sprout.step}
                    onChange={(v) => updateSettings({ depthSprout: v })}
                    format={(v) => `${v}%`}
                  />
                }
              />
              <Cell
                value={tr('Size')}
                right={
                  <Stepper
                    value={settings.depthScale ?? DEPTH_DEFAULTS.depthScale}
                    min={DEPTH_LIMITS.scale.min}
                    max={DEPTH_LIMITS.scale.max}
                    step={DEPTH_LIMITS.scale.step}
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
                    min={DEPTH_LIMITS.offset.min}
                    max={DEPTH_LIMITS.offset.max}
                    step={DEPTH_LIMITS.offset.step}
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
                    min={DEPTH_LIMITS.offset.min}
                    max={DEPTH_LIMITS.offset.max}
                    step={DEPTH_LIMITS.offset.step}
                    onChange={(v) => updateSettings({ depthX: v })}
                    format={(v) => (v > 0 ? `→ ${v}` : v < 0 ? `← ${-v}` : '0')}
                  />
                }
              />
              <Cell value={tr('Reset')} color={t.blue} onPress={() => updateSettings({ ...DEPTH_DEFAULTS })} />
            </Group>
            <Footer>{depthStatus}</Footer>
          </>
        ) : null}

        <SectionTitle>{tr('Call Background')}</SectionTitle>
        <Group>
          <CallPreview colors={callLook.plain ? [callLook.background, callLook.background, callLook.background] : previewColors} light={lightCallBackground} wallpaper={wallpaperSource} custom={false} />
          <Cell value={tr('Use App Background')} right={<Switch value={bg === 'pastel'} onValueChange={(follow) => updateSettings({ callBackground: follow ? 'pastel' : `wallpaper:${appBackgroundId(settings.appBackground)}` })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
          <View style={{ padding: 12 }}>
            <WallpaperGrid dark={t.dark} selectedId={bg === 'pastel' ? `wallpaper:${appBackgroundId(settings.appBackground)}` : bg} onSelect={(id) => updateSettings({ callBackground: id })} items={WALLPAPERS.map((item) => ({ ...item, id: `wallpaper:${item.id}` }))} />
          </View>
        </Group>
        <Footer>Four lightweight backgrounds are available for the app and call screen, with separate selections. Dark mode always stays AMOLED black.</Footer>

        <SectionTitle>{tr('Call Announcer')}</SectionTitle>
        <Group>
          <Cell value={tr('Voice')} right={voiceSelector('callerVoice')} />
          <Cell value={tr('Announce Incoming Calls')} right={<Switch value={!!announcer.enabled} onValueChange={(enabled) => updateAnnouncer({ enabled })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
          <Cell value={tr('Speak Unsaved Numbers')} right={<Switch value={!!announcer.speakNumbers} disabled={!announcer.enabled} onValueChange={(speakNumbers) => updateAnnouncer({ speakNumbers })} trackColor={{ true: t.green }} thumbColor="#fff" />} />
          <Cell value={tr(testingAnnouncer ? 'Testing…' : 'Test Announcer')} color={t.blue} onPress={testAnnouncer} />
        </Group>
        <Footer>{tr('Bundled male and female neural voices read saved contact names offline, without Google speech services or a separate voice app. English pronunciation is used; some names may sound different. Repeat announcements are cached on this phone. Respects silent mode, Do Not Disturb and lock-screen privacy.')}</Footer>

        <Footer>{tr('Caller announcements repeat three times and stop when the call is answered or dismissed.')}</Footer>

        <SectionTitle>{tr('Privacy')}</SectionTitle>
        <Group>
          <Cell value={tr('Hide Caller on Lock Screen')} right={pToggle('hideOnLockScreen')} />
          <Cell value={tr('Block Screenshots')} right={pToggle('blockScreenshots')} />
          <Cell value={tr('Privacy Policy')} color={t.blue} onPress={() => nav.push({ name: 'privacyPolicy' })} right={chev} />
        </Group>
        <Footer>
          {tr(
            'Calls, contacts, settings and favourites stay on this phone. The app has no internet access.'
          )}
        </Footer>

        <SectionTitle>{tr('Safety')}</SectionTitle>
        <Group>
          <Cell
            value={tr('Report a Child Safety Concern')}
            color={t.red}
            onPress={() =>
              sheet.show({
                title: tr('Report a Child Safety Concern'),
                options: [
                  {
                    text: tr('Email the Developer'),
                    onPress: () =>
                      Linking.openURL(
                        'mailto:gstephen116@gmail.com?subject=' + encodeURIComponent('Child safety concern – Phone app')
                      ).catch(() => {}),
                  },
                  { text: tr('Report Abuse Material (NCMEC CyberTipline)'), onPress: () => Linking.openURL('https://report.cybertip.org').catch(() => {}) },
                  {
                    text: tr('Child in Danger? Call Emergency Services'),
                    onPress: () =>
                      Alert.alert(
                        tr('Child in Danger'),
                        tr('If a child is in immediate danger, call your local emergency number (for example 112, 191 or 999) or the police straight away.')
                      ),
                  },
                ],
              })
            }
            right={chev}
          />
          <Cell
            value={tr('Child Safety Standards')}
            color={t.blue}
            onPress={() => Linking.openURL('https://github.com/Gr4nt-cell/ios-dialer/blob/main/CHILD_SAFETY.md').catch(() => {})}
            right={chev}
          />
        </Group>
        <Footer>{tr('The app has zero tolerance for child sexual abuse and exploitation. Reports go to the developer or straight to the authorities.')}</Footer>

        <SectionTitle>{tr('Ringtone')}</SectionTitle>
        <Group>
          <Cell
            value={tr('Ringtone')}
            onPress={chooseRingtone}
            right={valueRight(ring && ring.custom ? ring.title || tr('Custom') : tr('Phone default'))}
          />
          <Cell value={tr('Test Ringtone')} color={t.blue} onPress={() => Dialer && Dialer.testRingtone && Dialer.testRingtone()} />
          {ring && ring.custom ? (
            <Cell value={tr('Use Phone Default')} color={t.red} onPress={() => Dialer && Dialer.resetAppRingtone && setRing(Dialer.resetAppRingtone())} />
          ) : null}
        </Group>
        <Footer>{tr('Calls ring with the phone’s ringtone (or a contact’s own). If calls ring silently or the wrong tone plays, as on some Samsung phones, pick a ringtone here and use Test Ringtone to check it.')}</Footer>

        <SectionTitle>{tr('Sounds & Haptics')}</SectionTitle>
        <Group>
          <Cell value="Dial Pad Tones" right={toggle('dialTones')} />
          <Cell value="Keypad Haptics" right={toggle('haptics')} />
        </Group>
        <Footer>{tr('Plays a tone and a light tap for each key you press.')}</Footer>

        <SectionTitle>{tr('Voicemail')}</SectionTitle>
        <Group>
          <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontSize: fs(17), width: 110 }}>{tr('Number')}</Text>
            <TextInput
              value={vm}
              onChangeText={setVm}
              onEndEditing={() => updateSettings({ voicemailNumber: cleanNumber(vm) })}
              onBlur={() => updateSettings({ voicemailNumber: cleanNumber(vm) })}
              placeholder={tr('Carrier default')}
              placeholderTextColor={t.secondary}
              keyboardType="phone-pad"
              style={{ flex: 1, color: t.text, fontSize: fs(17), paddingVertical: 14, textAlign: 'right' }}
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
                {match ? <Text style={{ color: t.secondary, fontSize: fs(13) }}>{formatNumber(n)}</Text> : null}
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
              style={{ flex: 1, color: t.text, fontSize: fs(17), paddingVertical: 14 }}
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
          {permRow(tr('Full-Screen Incoming Calls'), fullScreenOk ? 'granted' : 'denied', () => Dialer && Dialer.openFullScreenSettings && Dialer.openFullScreenSettings())}
          <Cell value="Open App Settings" color={t.blue} onPress={() => Linking.openSettings()} />
        </Group>
        <Footer>{tr('If a permission was turned off, re-enable it in app settings. Full-screen incoming calls lets a call wake the screen and show over the lock screen; on Xiaomi also allow “Show on lock screen” and “Display pop-up windows while running in the background” in the app’s settings.')}</Footer>
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
