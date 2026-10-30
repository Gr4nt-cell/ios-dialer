import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Dialer, { ROUTE, isRinging, isUssdCode } from '../dialer';
import { runUssdThroughOperator } from '../ussd';
import { depthTransform, useDepth } from '../depth';
import { useIsTablet } from '../device';
import { useCalls } from '../CallContext';
import { useData } from '../DataContext';
import { fs, useTheme } from '../theme';
import { useNav } from '../nav';
import { contactName, contactPhoto, formatNumber, initials, sendMessage } from '../phone';
import { FlatBackdropContext, Glass } from '../components/Glass';
import { gradientFor } from '../gradients';
import { useActionSheet } from '../components/ActionSheet';
import { useT } from '../i18n';
import { ChromeText } from '../components/ui';

// ---------------------------------------------------------------------------
// Look & feel
// ---------------------------------------------------------------------------

const WHITE = '#FFFFFF';

// The control glass: a pale frosted disc with a bright rim and a glossy top,
// the way a media player's transport buttons sit over video. Brighter than the
// old 16% wash, which read as a flat grey circle rather than something with a
// surface to it.
const CONTROL_TINT = 'rgba(245,248,252,0.2)';
const DIM = 'rgba(255,255,255,0.72)';
const LIGHT_TEXT = '#22343A';
const LIGHT_SECONDARY = '#53666D';
const RED = '#FF3B30';
const GREEN = '#30D158';

const KEY = 72; // round control size
const COL = 108; // column width

const QUICK_REPLIES = ['Can’t talk now. What’s up?', 'I’ll call you right back.', 'I’ll call you later.', 'Can’t talk now. Call me later?'];
const DTMF_KEYS = [['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'], ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useTicker(active) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [active]);
}

function clock(connectTime) {
  if (!connectTime) return '';
  const s = Math.max(0, Math.floor((Date.now() - connectTime) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function useIdentity() {
  const { resolve } = useData();
  return (c) => {
    if (!c) return { name: '', label: '', image: null, key: '?' };
    if (c.isConference) return { name: 'Conference', label: `${c.childCount || 2} people`, image: null, key: 'conf' };
    const match = c.number ? resolve(c.number) : null;
    if (match) {
      return {
        name: contactName(match.contact),
        label: match.label,
        image: contactPhoto(match.contact, true),
        key: match.contact.id,
      };
    }
    return {
      name: c.name || (c.number ? formatNumber(c.number) : 'Unknown'),
      label: c.number && c.name ? formatNumber(c.number) : c.number ? 'unknown number' : 'No Caller ID',
      image: null,
      key: c.number || '?',
    };
  };
}

function statusText(c, who) {
  switch (c.state) {
    case 'ringing':
    case 'simulated_ringing':
      return 'incoming call';
    case 'dialing':
    case 'connecting':
    case 'new':
      return 'calling…';
    case 'select_account':
      return 'choose a SIM';
    case 'holding':
      return 'on hold';
    case 'disconnecting':
      return 'ending…';
    case 'active':
      return clock(c.connectTime) || 'connected';
    default:
      return '';
  }
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

// Very slow push-in shared by the photo and its cut-out so they stay aligned.
function useZoom() {
  const zoom = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(zoom, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(zoom, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [zoom]);
  return { transform: [{ scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) }] };
}

// Screen backdrop. Caller photos are rendered in a bounded portrait frame.
function Poster({ palette, light, plain = false }) {
  const { width, height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (plain) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, plain]);

  if (plain) {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: WHITE }]} pointerEvents="none" />;
  }

  const [c1, c2, base] = palette;
  const glow = width * 1.25;
  const a = {
    transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.3, width * 0.1] }) },
      { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [-height * 0.08, height * 0.06] }) },
    ],
  };
  const b = {
    transform: [
      { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [width * 0.2, -width * 0.15] }) },
      { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [height * 0.38, height * 0.26] }) },
    ],
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* the chosen gradient itself, edge to edge */}
      <LinearGradient colors={[c1, c2, base]} locations={[0, 0.55, 1]} start={{ x: 0.15, y: 0 }} end={{ x: 0.85, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* two soft glows drifting over it */}
      <Animated.View style={[{ position: 'absolute', width: glow, height: glow, borderRadius: glow / 2, overflow: 'hidden', opacity: 0.55 }, a]}>
        <LinearGradient colors={[c1, c1 + '00']} style={{ flex: 1 }} start={{ x: 0.5, y: 0.2 }} end={{ x: 0.5, y: 1 }} />
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', width: glow, height: glow, borderRadius: glow / 2, overflow: 'hidden', opacity: 0.5 }, b]}>
        <LinearGradient colors={[c2, c2 + '00']} style={{ flex: 1 }} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} />
      </Animated.View>
      {/* Keep controls readable on dark caller-specific gradients. */}
      {!light ? <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.38)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.5 }} /> : null}
    </View>
  );
}

// The person, drawn in front of their name — the "depth" effect.
function DepthLayer({ uri, zoomStyle, adjust }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [fade, uri]);
  if (!uri) return null;
  // one transform list: the slow push-in first, then the user's offset and size
  const transform = [...((zoomStyle && zoomStyle.transform) || []), ...depthTransform(adjust)];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.Image source={{ uri }} resizeMode="cover" style={[StyleSheet.absoluteFill, { transform, opacity: fade }]} />
    </View>
  );
}

function CallerPhotoFrame({ photo, foreground, zoomStyle, adjust, width, height }) {
  if (!photo) return null;
  return (
    <View style={[styles.photoFrame, { width, height }]} pointerEvents="none">
      <Animated.Image source={{ uri: photo }} resizeMode="cover" style={[StyleSheet.absoluteFill, zoomStyle]} />
      {foreground ? <DepthLayer uri={foreground} zoomStyle={zoomStyle} adjust={adjust} /> : null}
    </View>
  );
}

function BigAvatar({ name, image, size = 104, pulse, light = false }) {
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pulse) return undefined;
    const loop = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse, ring]);
  const letters = initials(name);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {pulse ? (
        <Animated.View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 2,
            borderColor: light ? 'rgba(34,52,58,0.38)' : 'rgba(255,255,255,0.6)',
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
          }}
        />
      ) : null}
      {image ? (
        <Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Glass dark={!light} radius={size / 2} tint={light ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.18)'} tintOpacity={1} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {letters ? (
            <Text style={{ color: light ? LIGHT_TEXT : WHITE, fontSize: size * 0.4, fontWeight: '500' }}>{letters}</Text>
          ) : (
            <Ionicons name="person" size={size * 0.5} color={light ? LIGHT_TEXT : WHITE} />
          )}
        </Glass>
      )}
    </View>
  );
}

function CallButton({ icon, label, onPress, on, disabled, color, size = 76, iconSize, hangup, light = false }) {
  const tint = color || (light ? undefined : on ? '#FFFFFF' : CONTROL_TINT);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={{ alignItems: 'center', width: Math.max(COL, size + 26), opacity: disabled ? 0.35 : 1 }}
    >
      {({ pressed }) => (
        <Glass
          dark={!light}
          vivid
          outline
          soft
          liquid
          radius={size / 2}
          pressed={pressed}
          tint={tint}
          tintOpacity={color ? 0.95 : 1}
          style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons
            name={icon}
            size={iconSize || size * 0.38}
            color={color ? WHITE : on && !light ? '#111' : light ? LIGHT_TEXT : WHITE}
            style={hangup ? { transform: [{ rotate: '135deg' }] } : null}
          />
        </Glass>
      )}
    </Pressable>
  );
}

// Wide red "End" key from the layout.
function EndKey({ onPress, light = false }) {
  const tr = useT();
  return (
    <Pressable onPress={onPress} accessibilityLabel={tr('End')} style={{ width: COL, alignItems: 'center' }}>
      {({ pressed }) => (
        <Glass dark={!light} liquid vivid outline soft radius={26} pressed={pressed} tint={RED} tintOpacity={0.95} style={{ width: COL - 6, height: KEY, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="call" size={32} color={WHITE} style={{ transform: [{ rotate: '135deg' }] }} />
        </Glass>
      )}
    </Pressable>
  );
}

function SmallPill({ icon, label, onPress, light = false }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} style={{ alignItems: 'center', width: 110 }}>
      {({ pressed }) => (
        <Glass dark={!light} liquid vivid outline soft radius={26} pressed={pressed} tint={light ? undefined : CONTROL_TINT} tintOpacity={1} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={21} color={light ? LIGHT_TEXT : WHITE} />
        </Glass>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CallScreen() {
  const tr = useT();
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const sheet = useActionSheet();
  const { live, audio, ended, setMinimized, recording, startRecording, stopRecording } = useCalls();
  const { settings, resolve } = useData();
  const t = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const identify = useIdentity();
  const [keypad, setKeypad] = useState(false);
  const isTablet = useIsTablet();
  const [dtmf, setDtmf] = useState('');
  const [ussdBusy, setUssdBusy] = useState(false);
  const askedPostDial = useRef({});
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [fade]);

  const ringing = live.find(isRinging);
  const others = live.filter((c) => c !== ringing);
  const primary =
    others.find((c) => c.state === 'active') ||
    others.find((c) => ['dialing', 'connecting', 'select_account', 'new', 'pulling', 'audio_processing', 'disconnecting'].includes(c.state)) ||
    others.find((c) => c.state === 'holding') ||
    others[0];
  const held = others.filter((c) => c !== primary && c.state === 'holding');
  const focus = primary || ringing || ended;
  const who = identify(focus);
  const palette = useMemo(() => gradientFor(who.key, settings.callBackground), [who.key, settings.callBackground]);
  const usePhoto = settings.callPhoto !== false && !!who.image;
  const depth = useDepth(usePhoto ? who.image : null, settings.callDepth !== false);
  const photo = usePhoto ? (depth ? depth.base : who.image) : null;
  const plainBackground = usePhoto || settings.callBackground === 'plain' || settings.callBackground === 'auto' || !settings.callBackground;
  const lightBackground = plainBackground || settings.callBackground === 'fastscore';
  const primaryText = lightBackground ? LIGHT_TEXT : WHITE;
  const secondaryText = lightBackground ? LIGHT_SECONDARY : DIM;
  const zoomStyle = useZoom();
  const nameStyle = usePhoto ? styles.posterName : styles.name;
  // depth layer goes right after the name so the person overlaps it
  // on a tablet the dial pad lives in its own column, so the left side never
  // swaps itself out for it
  const padOpen = keypad && !isTablet;
  const photoWidth = Math.min(360, Math.max(220, screenWidth - 48));
  const photoHeight = Math.min(300, Math.max(180, Math.round(screenHeight * 0.32)));
  const photoPanel = usePhoto ? (
    <CallerPhotoFrame
      photo={photo}
      foreground={depth?.foreground}
      zoomStyle={zoomStyle}
      adjust={settings}
      width={photoWidth}
      height={photoHeight}
    />
  ) : null;


  useTicker(live.some((c) => c.state === 'active'));

  useEffect(() => {
    if (!primary) {
      setKeypad(false);
      setDtmf('');
    }
  }, [primary]);

  // "wait" (;) in a dialled number — ask before sending the rest of the tones
  useEffect(() => {
    live.forEach((c) => {
      const key = c.id + ':' + c.postDialWait;
      if (c.postDialWait && !askedPostDial.current[key]) {
        askedPostDial.current[key] = true;
        Alert.alert(tr('Send the following tones?'), c.postDialWait, [
          { text: tr('No'), style: 'cancel', onPress: () => Dialer.postDialContinue(c.id, false) },
          { text: tr('Send'), onPress: () => Dialer.postDialContinue(c.id, true) },
        ]);
      }
    });
  }, [live]);

  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const wrap = (children, extra) => (
    <FlatBackdropContext.Provider value={plainBackground}>
      <Animated.View style={[styles.root, { opacity: fade, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, backgroundColor: plainBackground ? WHITE : '#0B0C10' }, extra]}>
        <StatusBar style={lightBackground ? 'dark' : 'light'} />
        <Poster palette={palette} light={lightBackground} plain={plainBackground} />
        {children}
      </Animated.View>
    </FlatBackdropContext.Provider>
  );

  // ---------- call ended ----------
  if (!live.length && ended) {
    return wrap(
      <>
        <View style={{ alignItems: 'center', marginTop: usePhoto ? 36 : 70 }}>
          {usePhoto ? null : <BigAvatar name={who.name} image={who.image} light={lightBackground} />}
          {usePhoto ? <Text style={[styles.statusTop, lightBackground && { color: secondaryText, textShadowColor: 'transparent' }]}>{ended.disconnectLabel || 'Call Ended'}</Text> : null}
          <Text style={[nameStyle, lightBackground && { color: primaryText, textShadowColor: 'transparent', textShadowRadius: 0 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {who.name}
          </Text>
          {usePhoto ? null : <Text style={[styles.status, lightBackground && { color: secondaryText }]}>{ended.disconnectLabel || 'Call Ended'}</Text>}
        </View>
        {photoPanel}
      </>
    );
  }

  if (!live.length) return <View style={[styles.root, { backgroundColor: '#000' }]} />;

  // ---------- incoming call ----------
  if (ringing && !primary) {
    const reply = () =>
      sheet.show({
        title: tr('Reply with Message'),
        options: [
          ...QUICK_REPLIES.map((m) => ({ text: m, onPress: () => Dialer.reject(ringing.id, m) })),
          {
            text: tr('Custom…'),
            onPress: () => {
              Dialer.reject(ringing.id, null);
              if (ringing.number) sendMessage(ringing.number);
            },
          },
        ],
      });
    return wrap(
      <>
        <View style={{ alignItems: 'center', marginTop: usePhoto ? 30 : 48 }}>
          <Text style={[styles.statusTop, lightBackground && { color: secondaryText, textShadowColor: 'transparent' }]}>{statusText(ringing, who)}</Text>
          <Text style={[nameStyle, lightBackground && { color: primaryText, textShadowColor: 'transparent', textShadowRadius: 0 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {who.name}
          </Text>
          {usePhoto ? null : (
            <View style={{ marginTop: 28 }}>
              <BigAvatar name={who.name} image={who.image} size={120} pulse light={lightBackground} />
            </View>
          )}
        </View>
        {photoPanel}
        <View style={{ flex: 1 }} />
        <View style={styles.pillRow}>
          <SmallPill icon="notifications-off" label={tr('Silence')} onPress={() => Dialer.silenceRinger && Dialer.silenceRinger()} light={lightBackground} />
          <SmallPill icon="chatbubble" label={tr('Message')} onPress={reply} light={lightBackground} />
        </View>
        <View style={styles.answerRow}>
          <CallButton
            icon="call"
            label={tr('Decline')}
            color={RED}
            size={80}
            iconSize={34}
            hangup
            light={lightBackground}
            onPress={() => {
              tap();
              Dialer.reject(ringing.id, null);
            }}
          />
          <CallButton
            icon="call"
            label={tr('Accept')}
            color={GREEN}
            size={80}
            iconSize={34}
            light={lightBackground}
            onPress={() => {
              tap();
              Dialer.answer(ringing.id);
            }}
          />
        </View>
      </>
    );
  }

  // ---------- active / dialling / on hold ----------
  const muted = !!(audio && audio.muted);
  const route = audio ? audio.route : ROUTE.EARPIECE;
  const supported = audio ? audio.supported : ROUTE.EARPIECE | ROUTE.SPEAKER;
  const hasBluetooth = !!(supported & ROUTE.BLUETOOTH);
  const isHeld = primary.state === 'holding';
  const connected = primary.state === 'active' || primary.state === 'holding';
  const twoCalls = held.length > 0;
  const canMerge = twoCalls && (primary.canMerge || held.some((h) => h.canMerge));

  const chooseAudio = () => {
    tap();
    if (!hasBluetooth) {
      Dialer.setAudioRoute(route === ROUTE.SPEAKER ? (supported & ROUTE.WIRED ? ROUTE.WIRED : ROUTE.EARPIECE) : ROUTE.SPEAKER);
      return;
    }
    const mark = (r) => (route === r ? '  ✓' : '');
    const opts = [];
    if (supported & ROUTE.BLUETOOTH) opts.push({ text: `Bluetooth${mark(ROUTE.BLUETOOTH)}`, onPress: () => Dialer.setAudioRoute(ROUTE.BLUETOOTH) });
    if (supported & ROUTE.WIRED) opts.push({ text: `Headphones${mark(ROUTE.WIRED)}`, onPress: () => Dialer.setAudioRoute(ROUTE.WIRED) });
    if (supported & ROUTE.EARPIECE) opts.push({ text: `Phone${mark(ROUTE.EARPIECE)}`, onPress: () => Dialer.setAudioRoute(ROUTE.EARPIECE) });
    opts.push({ text: `Speaker${mark(ROUTE.SPEAKER)}`, onPress: () => Dialer.setAudioRoute(ROUTE.SPEAKER) });
    sheet.show({ title: tr('Audio'), options: opts });
  };

  const minimizeTo = (tab) => {
    setMinimized(true);
    nav.setTab(tab);
  };

  const openContact = () => {
    const match = primary.number ? resolve(primary.number) : null;
    setMinimized(true);
    if (match) nav.push({ name: 'contact', contactId: match.contact.id, number: primary.number });
    else if (primary.number) nav.push({ name: 'newContact', number: primary.number });
  };

  const toggleRecording = () => {
    tap();
    if (recording) stopRecording();
    else startRecording(primary.number);
  };

  const addOrMerge = () => {
    if (canMerge) Dialer.merge(primary.id);
    else minimizeTo('keypad');
  };

  const audioIcon = route === ROUTE.BLUETOOTH ? 'bluetooth' : route === ROUTE.WIRED ? 'headset' : route === ROUTE.SPEAKER ? 'volume-high' : 'volume-medium';
  const audioLabel = route === ROUTE.BLUETOOTH ? 'Bluetooth' : route === ROUTE.WIRED ? 'Headphones' : hasBluetooth ? 'Audio' : 'Speaker';

  const pressDtmf = (d) => {
    tap();
    setDtmf((s) => (s + d).slice(-28));
    Dialer.dtmf(primary.id, d);
  };

  // A USSD code typed here only ever went out as DTMF tones, which the network
  // ignores. Sending it properly hands it to the operator, whose own dialog
  // takes over — so a menu code can be answered rather than just read.
  const sendUssd = async () => {
    const code = dtmf;
    setUssdBusy(true);
    await runUssdThroughOperator(code, primary, tr);
    setUssdBusy(false);
    setDtmf('');
  };

  const body = (
    <>
      {/* top bar */}
      <View style={styles.topRow}>
        <Pressable onPress={() => setMinimized(true)} hitSlop={12}>
          {({ pressed }) => (
          <Glass dark={!lightBackground} liquid vivid outline soft fillScale={0.7} radius={19} pressed={pressed} style={styles.topBtn}>
              <Ionicons name="chevron-down" size={20} color={primaryText} />
            </Glass>
          )}
        </Pressable>
        {primary.isConference ? (
          <Glass dark={!lightBackground} liquid radius={16} style={{ paddingHorizontal: 12, height: 32, justifyContent: 'center' }}>
            <Text style={{ color: primaryText, fontSize: fs(13), fontWeight: '600' }}>{tr('Conference')}</Text>
          </Glass>
        ) : null}
      </View>

      {/* other call on hold */}
      {held.map((h) => {
        const hw = identify(h);
        return (
          <Pressable key={h.id} onPress={() => Dialer.swap()} style={{ marginHorizontal: 20, marginTop: 10 }}>
            <Glass dark={!lightBackground} liquid radius={20} style={styles.heldStrip}>
              <Ionicons name="pause-circle" size={20} color={secondaryText} />
              <Text style={{ color: primaryText, fontSize: fs(15), fontWeight: '600', flex: 1, marginLeft: 8 }} numberOfLines={1}>
                {hw.name}
              </Text>
              <Text style={{ color: secondaryText, fontSize: fs(13) }}>On hold · tap to swap</Text>
            </Glass>
          </Pressable>
        );
      })}

      {/* caller */}
      {padOpen ? (
        <View style={{ alignItems: 'center', marginTop: 34, paddingHorizontal: 24 }}>
          <Text style={[styles.statusTop, lightBackground && { color: secondaryText, textShadowColor: 'transparent' }]}>{who.name}</Text>
          <Text style={[styles.name, lightBackground && { color: primaryText, textShadowColor: 'transparent', textShadowRadius: 0 }, { fontWeight: '300', letterSpacing: 1.5 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {dtmf || ' '}
          </Text>
          {isUssdCode(dtmf) ? (
            <Pressable onPress={sendUssd} disabled={ussdBusy} hitSlop={10} style={{ marginTop: 10 }}>
              {({ pressed }) => (
              <Glass dark={!lightBackground} liquid vivid outline soft radius={18} pressed={pressed} style={{ height: 36, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="arrow-forward-circle" size={17} color={primaryText} />
                  <Text allowFontScaling={false} style={{ color: primaryText, fontSize: fs(15), fontWeight: '600', marginLeft: 7 }}>
                    {ussdBusy ? tr('Running…') : tr('Run Code')}
                  </Text>
                </Glass>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={{ alignItems: 'center', marginTop: twoCalls ? 18 : usePhoto ? 22 : 40 }}>
          <Text style={[styles.statusTop, lightBackground && { color: secondaryText, textShadowColor: 'transparent' }]}>{statusText(primary, who)}</Text>
          <Text style={[nameStyle, lightBackground && { color: primaryText, textShadowColor: 'transparent', textShadowRadius: 0 }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {who.name}
          </Text>
          {!ringing && !twoCalls && !usePhoto ? (
            <View style={{ marginTop: 26 }}>
              <BigAvatar name={who.name} image={who.image} size={110} pulse={!connected} light={lightBackground} />
            </View>
          ) : null}
        </View>
      )}

      {!padOpen ? photoPanel : null}

      {/* call waiting: a liquid-glass pill with Reject and Answer */}
      {ringing ? (
        <View style={{ marginHorizontal: 14, marginTop: 20 }}>
          <Glass dark={!lightBackground} liquid radius={40} style={styles.waitingPill}>
            <View style={{ flex: 1, paddingLeft: 8, paddingRight: 6 }}>
              <Text style={{ color: secondaryText, fontSize: fs(12) }}>{tr('Incoming call')}</Text>
              <Text style={{ color: primaryText, fontSize: fs(18), fontWeight: '600', marginTop: 1 }} numberOfLines={1}>
                {identify(ringing).name}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                tap();
                Dialer.reject(ringing.id, null);
              }}
              hitSlop={6}
            >
              {({ pressed }) => (
                  <Glass dark={!lightBackground} liquid vivid outline soft radius={26} pressed={pressed} tint={RED} tintOpacity={0.92} style={[styles.waitingBtn, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
                  <Ionicons name="call" size={24} color={WHITE} style={{ transform: [{ rotate: '135deg' }] }} />
                  </Glass>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                tap();
                // answering puts the current call on hold where the network allows it
                if (primary.canHold) Dialer.holdAndAnswer(ringing.id);
                else Dialer.endAndAnswer(ringing.id);
              }}
              onLongPress={() => {
                tap();
                Dialer.endAndAnswer(ringing.id);
              }}
              delayLongPress={450}
              hitSlop={6}
              style={{ marginLeft: 10 }}
            >
              {({ pressed }) => (
                  <Glass dark={!lightBackground} liquid vivid outline soft radius={26} pressed={pressed} tint={GREEN} tintOpacity={0.92} style={[styles.waitingBtn, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
                  <Ionicons name="call" size={24} color={WHITE} />
                  </Glass>
              )}
            </Pressable>
          </Glass>
          <Text style={{ color: secondaryText, fontSize: fs(12), textAlign: 'center', marginTop: 8 }}>
            {primary.canHold
              ? tr('Answer puts your current call on hold · hold Answer to end it instead')
              : tr('Answering ends your current call')}
          </Text>
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      {/* SIM picker ("ask every time") / keypad / controls */}
      {primary.state === 'select_account' ? (
        <View style={{ alignItems: 'center', marginBottom: 70 }}>
          {/* one tile per SIM, side by side */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 11, paddingHorizontal: 16 }}>
            {(primary.accounts || []).map((a, i) => (
              <Pressable key={a.key} onPress={() => { tap(); Dialer.selectAccount(primary.id, a.key); }}>
                {({ pressed }) => (
                  <Glass dark={!lightBackground} liquid vivid outline radius={14} pressed={pressed} style={styles.simTile}>
                    <View style={[styles.simBadge, { backgroundColor: t.blue }]}>
                      <Text style={{ color: '#fff', fontSize: fs(10), fontWeight: '800' }}>{i + 1}</Text>
                    </View>
                    <ChromeText style={{ color: t.text, fontSize: fs(12), fontWeight: '600', marginTop: 5 }}>
                      {a.label || `SIM ${i + 1}`}
                    </ChromeText>
                  </Glass>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ) : padOpen ? (
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          {[0, 1, 2, 3].map((row) => (
            <View key={row} style={{ flexDirection: 'row', marginBottom: 12 }}>
              {DTMF_KEYS.slice(row * 3, row * 3 + 3).map(([d, l]) => (
                <Pressable key={d} onPress={() => pressDtmf(d)} style={{ marginHorizontal: 12 }}>
                  {({ pressed }) => (
            <Glass dark={!lightBackground} liquid vivid outline soft radius={36} pressed={pressed} tint={lightBackground ? undefined : CONTROL_TINT} tintOpacity={1} style={styles.dtmfKey}>
              <Text style={{ color: primaryText, fontSize: fs(32), lineHeight: fs(38) }}>{d}</Text>
              {l ? <Text style={{ color: primaryText, fontSize: fs(9), fontWeight: '700', letterSpacing: 2 }}>{l}</Text> : null}
                    </Glass>
                  )}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <CallButton size={KEY} icon="person" label={tr('Contact')} onPress={openContact} disabled={!primary.number || primary.isConference} light={lightBackground} />
            <CallButton size={KEY} icon="chatbubble" label={tr('Message')} onPress={() => sendMessage(primary.number)} disabled={!primary.number} light={lightBackground} />
            <CallButton
              size={KEY}
              icon="radio-button-on"
              label={recording ? clock(recording.startedAt) : 'Record'}
              color={recording ? RED : undefined}
              onPress={toggleRecording}
              disabled={!connected && !recording}
              light={lightBackground}
            />
          </View>
          <View style={styles.gridRow}>
            <CallButton size={KEY} icon={audioIcon} label={audioLabel} on={route !== ROUTE.EARPIECE} onPress={chooseAudio} light={lightBackground} />
            <CallButton
              size={KEY}
              icon={isHeld ? 'play' : 'pause'}
              label={isHeld ? 'Resume' : 'Hold'}
              on={isHeld}
              disabled={!connected || (!primary.canHold && !isHeld)}
              onPress={() => Dialer.hold(primary.id, !isHeld)}
              light={lightBackground}
            />
            <CallButton
              size={KEY}
              icon={muted ? 'mic-off' : 'mic'}
              label={tr('Mute')}
              on={muted}
              onPress={() => {
                tap();
                Dialer.mute(!muted);
              }}
              light={lightBackground}
            />
          </View>
        </View>
      )}

      {/* bottom row: Add Call · End · Keypad (End always in the middle) */}
      {primary.state === 'select_account' ? null : (
      <View style={styles.gridRow}>
        {padOpen || primary.state === 'select_account' ? (
          <View style={{ width: COL }} />
        ) : (
          <CallButton size={KEY} icon={canMerge ? 'git-merge' : 'add'} label={canMerge ? 'Merge' : 'Add Call'} onPress={addOrMerge} light={lightBackground} />
        )}
        {primary.state === 'select_account' ? (
          <View style={{ width: COL }} />
        ) : (
          <EndKey
            light={lightBackground}
            onPress={() => {
              tap();
              Dialer.hangup(primary.id);
            }}
          />
        )}
        {padOpen ? (
          <Pressable onPress={() => setKeypad(false)} hitSlop={12} style={{ width: COL, alignItems: 'center', paddingTop: 18 }}>
            <Glass dark={!lightBackground} liquid radius={18} style={{ paddingHorizontal: 18, height: 36, justifyContent: 'center' }}>
              <Text style={{ color: primaryText, fontSize: fs(15), fontWeight: '600' }}>{tr('Hide')}</Text>
            </Glass>
          </Pressable>
        ) : primary.state === 'select_account' || isTablet ? (
          <View style={{ width: COL }} />
        ) : (
          <CallButton size={KEY} icon="keypad" label={tr('Keypad')} onPress={() => setKeypad(true)} disabled={!connected} light={lightBackground} />
        )}
      </View>
      )}
    </>
  );

  // ---------- tablet: call on the left, dial pad always out on the right ----------
  if (isTablet) {
    return wrap(
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <View style={{ flex: 1, minWidth: 0 }}>{body}</View>
        <View style={styles.padColumn}>
          <Glass dark={!lightBackground} liquid vivid outline radius={32} style={styles.padPanel}>
            <Text style={[styles.statusTop, lightBackground && { color: secondaryText, textShadowColor: 'transparent' }]} numberOfLines={1}>
              {who.name}
            </Text>
            <Text
              style={[styles.name, lightBackground && { color: primaryText, textShadowColor: 'transparent', textShadowRadius: 0 }, { fontWeight: '300', letterSpacing: 1.5, fontSize: fs(30), marginTop: 2 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {dtmf || ' '}
            </Text>

            {isUssdCode(dtmf) ? (
              <Pressable onPress={sendUssd} disabled={ussdBusy} hitSlop={10} style={{ marginTop: 8 }}>
                {({ pressed }) => (
                  <Glass dark={!lightBackground} liquid vivid outline soft radius={18} pressed={pressed} style={styles.runCode}>
                    <Ionicons name="arrow-forward-circle" size={17} color={primaryText} />
                    <Text allowFontScaling={false} style={{ color: primaryText, fontSize: fs(15), fontWeight: '600', marginLeft: 7 }}>
                      {ussdBusy ? tr('Running…') : tr('Run Code')}
                    </Text>
                  </Glass>
                )}
              </Pressable>
            ) : null}

            <View style={{ marginTop: 18 }}>
              {[0, 1, 2, 3].map((row) => (
                <View key={row} style={{ flexDirection: 'row', marginBottom: 12 }}>
                  {DTMF_KEYS.slice(row * 3, row * 3 + 3).map(([d, l]) => (
                    <Pressable key={d} onPress={() => pressDtmf(d)} style={{ marginHorizontal: 10 }}>
                      {({ pressed }) => (
                        <Glass dark={!lightBackground} liquid vivid outline soft radius={36} pressed={pressed} tint={lightBackground ? undefined : CONTROL_TINT} tintOpacity={1} style={styles.dtmfKey}>
                          <Text style={{ color: primaryText, fontSize: fs(32), lineHeight: fs(38) }}>{d}</Text>
                          {l ? <Text style={{ color: primaryText, fontSize: fs(9), fontWeight: '700', letterSpacing: 2 }}>{l}</Text> : null}
                        </Glass>
                      )}
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>

            {dtmf ? (
              <Pressable onPress={() => setDtmf('')} hitSlop={10} style={{ marginTop: 6 }}>
                <Text style={{ color: secondaryText, fontSize: fs(15), fontWeight: '600' }}>{tr('Clear')}</Text>
              </Pressable>
            ) : null}
          </Glass>
        </View>
      </View>
    );
  }

  return wrap(body);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0C10' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  topBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  statusTop: { color: DIM, fontSize: fs(17), fontWeight: '500', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  status: { color: DIM, fontSize: fs(17), marginTop: 6, textAlign: 'center' },
  name: { color: WHITE, fontSize: fs(38), fontWeight: '600', marginTop: 4, textAlign: 'center', paddingHorizontal: 24, letterSpacing: 0.2 },
  posterName: {
    color: WHITE,
    fontSize: fs(52),
    lineHeight: fs(58),
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 20,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowRadius: 10,
  },
  photoFrame: {
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#F2F3F5',
    borderWidth: 1,
    borderColor: 'rgba(40,52,60,0.18)',
  },
  heldStrip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  waitingPill: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 14, paddingRight: 8 },
  waitingBtn: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  grid: { alignItems: 'center' },
  gridRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', marginBottom: 16 },
  answerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 36 },
  pillRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 44, marginBottom: 34 },
  dtmfKey: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  padColumn: { width: 360, paddingRight: 24, paddingLeft: 8, justifyContent: 'center' },
  padPanel: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 18 },
  runCode: { height: 36, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center' },
  simTile: { width: 102, paddingVertical: 9, paddingHorizontal: 7, alignItems: 'center' },
  simBadge: { width: 18, height: 18, borderRadius: 5.5, alignItems: 'center', justifyContent: 'center' },
  simRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
});
