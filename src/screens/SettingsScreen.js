import React, { useContext, useEffect, useMemo, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { usePaneSize } from '../device';
import { Image, Linking, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DepthPreview from '../components/DepthPreview';
import DepthEditor from '../components/DepthEditor';
import { posterSettings, posterPatch } from '../depthSettings';
import { DEPTH_DEFAULTS, DEPTH_LIMITS, depthAvailable, useDepth } from '../depth';
import { Pressable } from '../components/Touch';
import { Glass, PerformanceModeContext, PerformanceProfileContext } from '../components/Glass';
import { LinearGradient } from 'expo-linear-gradient';
import { GRADIENTS, gradientFor } from '../gradients';
import { callAppearance } from '../callAppearance';
import { Ionicons } from '@expo/vector-icons';
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
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { getCallWallpaperSource, WALLPAPERS } from '../wallpapers';

function SectionTitle({ children }) {
  const t = useTheme();
  return <Text style={{ color: t.secondary, fontSize: fs(13), marginHorizontal: 32, marginBottom: 6, marginTop: 4, textTransform: 'uppercase' }}>{children}</Text>;
}

function Footer({ children }) {
  const t = useTheme();
  return <Text style={{ color: t.secondary, fontSize: fs(13), marginHorizontal: 32, marginTop: 6, marginBottom: 24, lineHeight: fs(18) }}>{children}</Text>;
}

function Swatch({ colors, name, selected, onPress, width, auto, wallpaper }) {
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
              borderColor: selected ? t.blue : colors.every((c) => c.toUpperCase() === '#FFFFFF') ? t.glassBorder : 'transparent',
              transform: [{ scale: pressed ? 0.95 : 1 }],
            }}
          >
            {wallpaper ? <Image source={wallpaper} resizeMode="cover" style={{ position: 'absolute', left: 2, right: 2, top: 2, bottom: 2, borderRadius: 12 }} /> : null}
            <LinearGradient colors={wallpaper ? ['transparent', 'transparent', 'transparent'] : colors} locations={auto ? undefined : [0, 0.55, 1]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={{ flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}>
              {auto ? <Ionicons name="sparkles" size={22} color="#fff" /> : null}
              {selected ? (
                <View style={{ position: 'absolute', right: 5, top: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </View>
              ) : null}
            </LinearGradient>
          </View>
          <ChromeText style={{ color: selected ? t.blue : t.secondary, fontSize: fs(12), marginTop: 4, fontWeight: selected ? '600' : '400' }}>
            {name}
          </ChromeText>
        </>
      )}
    </Pressable>
  );
}

function CallPreview({ colors, light, wallpaper, custom }) {
  const tr = useT();
  return (
    <View style={{ height: 150, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.65)', margin: 12, marginBottom: 4, overflow: 'hidden', backgroundColor: colors[2] }}>
      {wallpaper ? <Image source={wallpaper} resizeMode={custom ? 'cover' : 'stretch'} fadeDuration={0} style={StyleSheet.absoluteFill} /> : null}
      {!light && custom ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,18,15,0.68)' }]} /> : null}
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
  const performanceMode = useContext(PerformanceModeContext);
  const performanceProfile = useContext(PerformanceProfileContext);
  const t = useTheme();
  const tr = useT();
  const recordingSupport = useMemo(() => {
    try { return Dialer?.getRecordingSupport?.() || null; } catch { return null; }
  }, []);
  const [depthEditor, setDepthEditor] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [wallpaperBusy, setWallpaperBusy] = useState(false);
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
  const tileW = Math.floor((width - 32 - 24 - 30) / 4);
  const bg = settings.callBackground || 'pastel';
  const previewColors = gradientFor('Jane Appleseed', bg);
  const callLook = callAppearance(t, bg);
  const lightCallBackground = callLook.light;
  const selectedWallpaper = settings.appBackground || 'mint';
  const wallpaperSource = getCallWallpaperSource(settings, t.dark);
  const selectGalleryWallpaper = async () => {
    if (wallpaperBusy) return;
    setWallpaperBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      if (!FileSystem.documentDirectory) throw new Error('Private image storage is unavailable.');
      const directory = `${FileSystem.documentDirectory}wallpapers/`;
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
      const mime = (asset.mimeType || '').toLowerCase();
      const mimeExtension = mime.split('/')[1]?.split(';')[0];
      const nameExtension = (asset.fileName || asset.uri).split('.').pop()?.split('?')[0]?.toLowerCase();
      const candidateExtension = mimeExtension || nameExtension;
      const fileExtension = candidateExtension === 'jpeg' ? 'jpg' : /^[a-z0-9]{2,5}$/.test(candidateExtension || '') ? candidateExtension : 'jpg';
      const destination = `${directory}background-${Date.now()}.${fileExtension}`;
      await FileSystem.copyAsync({ from: asset.uri, to: destination });
      updateSettings({ appBackground: 'custom', appBackgroundUri: destination });
    } catch (error) {
      Alert.alert('Couldn’t set background', error?.message || 'Choose another image and try again.');
    } finally {
      setWallpaperBusy(false);
    }
  };

  // Use the supplied portrait for a consistent, private preview instead of
  // pulling a photo from the user's contacts.
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
            value="Performance profile"
            right={<Segmented
              options={[{ label: 'Performance', value: 'performance' }, { label: 'Optimized', value: 'optimized' }]}
              value={performanceProfile.profile}
              onChange={performanceProfile.setProfile}
            />}
          />
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
        <Footer>
          {performanceMode
            ? 'Optimized reduces decorative motion, live blur and list rendering for smoother use. Light-mode surfaces have stronger contrast; calling and contact features remain available.'
            : 'Performance restores the full visual effects from the previous version. Lower-end phones start in Optimized, and you can switch profiles here at any time.'}
        </Footer>

        <SectionTitle>Background</SectionTitle>
        <View style={{ marginHorizontal: 16, padding: 12, borderRadius: 20, backgroundColor: t.glass, borderWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            {WALLPAPERS.map((wallpaper) => {
              const selected = selectedWallpaper === wallpaper.id;
              return (
                <Pressable
                  key={wallpaper.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${wallpaper.title} background`}
                  accessibilityState={{ selected }}
                  onPress={() => updateSettings({ appBackground: wallpaper.id })}
                  style={{ width: tileW, alignItems: 'center', marginBottom: 10 }}
                >
                  {({ pressed }) => (
                    <>
                      <View style={{ width: tileW, height: tileW * 1.35, borderRadius: 14, padding: 2, borderWidth: 2, borderColor: selected ? t.blue : 'transparent', transform: [{ scale: pressed ? 0.96 : 1 }] }}>
                        <Image source={t.dark ? wallpaper.darkSource : wallpaper.source} resizeMode="cover" style={{ flex: 1, width: '100%', borderRadius: 10 }} />
                        {selected ? (
                          <View style={{ position: 'absolute', right: 6, top: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: t.blue, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          </View>
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={{ color: selected ? t.blue : t.secondary, fontSize: fs(11), marginTop: 4, fontWeight: selected ? '600' : '400', maxWidth: tileW }}>{wallpaper.title}</Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
          {settings.appBackground === 'custom' && settings.appBackgroundUri ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 10, gap: 10 }}>
              <Image source={{ uri: settings.appBackgroundUri }} resizeMode="cover" style={{ width: 42, height: 56, borderRadius: 10, borderWidth: 2, borderColor: t.blue }} />
              <Text style={{ color: t.blue, fontSize: fs(13), fontWeight: '600' }}>Your gallery background is selected</Text>
            </View>
          ) : null}
          <Pressable accessibilityRole="button" onPress={selectGalleryWallpaper} disabled={wallpaperBusy}>
            {({ pressed }) => (
              <View style={{ minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: t.fill, borderWidth: StyleSheet.hairlineWidth, borderColor: t.glassBorder, opacity: pressed || wallpaperBusy ? 0.6 : 1 }}>
                <Ionicons name={wallpaperBusy ? 'hourglass-outline' : 'images-outline'} size={18} color={t.blue} />
                <Text style={{ color: t.blue, fontSize: fs(14), fontWeight: '600' }}>{wallpaperBusy ? 'Loading photo…' : 'Choose from Gallery'}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <Footer>Pick one of ten soft pastel wallpapers or use any photo from your gallery. Each colour has a matching dark version. The Pastel call background follows your selected app wallpaper.</Footer>

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
          <CallPreview colors={callLook.plain ? [callLook.background, callLook.background, callLook.background] : previewColors} light={lightCallBackground} wallpaper={wallpaperSource} custom={(bg === 'pastel' || bg === 'auto') && settings.appBackground === 'custom'} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, paddingBottom: 2 }}>
            {GRADIENTS.map((g) => (
              <Swatch key={g.id} wallpaper={getCallWallpaperSource({ ...settings, callBackground: g.id }, t.dark)} width={tileW} name={g.name} colors={g.id === 'plain' && t.dark ? [t.backdropBase, t.backdropBase, t.backdropBase] : g.colors} selected={bg === g.id || (bg === 'auto' && g.id === 'pastel')} onPress={() => updateSettings({ callBackground: g.id })} />
            ))}
          </View>
        </Group>
        <Footer>Call backgrounds share the app’s soft pastel finish, with matching dark versions. Pastel follows your app wallpaper; other presets keep their own colour family.</Footer>

        <SectionTitle>{tr('Call Recording')}</SectionTitle>
        <Group>
          <Cell value="Record Calls Automatically" right={toggle('autoRecord')} />
          <Cell value={tr('Recordings')} color={t.blue} onPress={() => nav.push({ name: 'recordings' })} right={<Ionicons name="chevron-forward" size={18} color={t.tertiary} />} />
        </Group>
        {recordingSupport ? <Footer>{recordingSupport.family} · {recordingSupport.model}{'\n'}{recordingSupport.mode}{'\n'}{recordingSupport.notice}</Footer> : null}
        <Footer>Recording switches the call to speakerphone and says “This call is being recorded” using an offline English voice before capture begins. Keep media volume audible and confirm the other person heard the announcement; Android cannot inject it directly into a cellular call. Headsets are not supported while recording. Some phones block all call capture, and both voices cannot be guaranteed. Test playback on your device.</Footer>

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
