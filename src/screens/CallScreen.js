import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Dialer, { ROUTE, isRinging } from '../dialer';
import { useCalls } from '../CallContext';
import { useData } from '../DataContext';
import { useTheme } from '../theme';
import { useNav } from '../nav';
import { contactName, contactPhoto, formatNumber, initials, sendMessage } from '../phone';
import { Glass } from '../components/Glass';
import { gradientFor } from '../gradients';
import { useActionSheet } from '../components/ActionSheet';

// ---------------------------------------------------------------------------
// Look & feel
// ---------------------------------------------------------------------------

const WHITE = '#FFFFFF';
const DIM = 'rgba(255,255,255,0.72)';
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
      return who.label ? `incoming call · ${who.label}` : 'incoming call';
    case 'dialing':
    case 'connecting':
    case 'new':
      return who.label && who.label !== 'unknown number' ? `calling ${who.label}…` : 'calling…';
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

// Cut-out of the person in a contact photo, cached per photo (see DialerModule.prepareDepth).
const depthCache = new Map();

function useDepth(image, enabled) {
  const [depth, setDepth] = useState(() => (image && depthCache.get(image)) || null);
  useEffect(() => {
    let alive = true;
    if (!image || !enabled || !Dialer || !Dialer.prepareDepth) {
      setDepth(null);
      return undefined;
    }
    if (depthCache.has(image)) {
      setDepth(depthCache.get(image));
      return undefined;
    }
    setDepth(null);
    Dialer.prepareDepth(image)
      .then((r) => {
        if (r && r.base && r.foreground) depthCache.set(image, r);
        if (alive) setDepth(r && r.base && r.foreground ? r : null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [image, enabled]);
  return depth;
}

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

// Background: the caller's photo (sharp, full screen) or drifting gradient glows.
function Poster({ photo, palette, zoomStyle }) {
  const { width, height } = useWindowDimensions();
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (photo) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [drift, photo]);

  if (photo) {
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />
        <Animated.Image source={{ uri: photo }} resizeMode="cover" style={[StyleSheet.absoluteFill, zoomStyle]} />
        <LinearGradient colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} style={{ position: 'absolute', left: 0, right: 0, top: 0, height: height * 0.3 }} />
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.82)']} locations={[0, 0.4, 1]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.55 }} />
      </View>
    );
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
      {/* keep the buttons readable */}
      <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.38)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: height * 0.5 }} />
    </View>
  );
}

// The person, drawn in front of their name — the "depth" effect.
function DepthLayer({ uri, zoomStyle }) {
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, [fade, uri]);
  if (!uri) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.Image source={{ uri }} resizeMode="cover" style={[StyleSheet.absoluteFill, zoomStyle, { opacity: fade }]} />
    </View>
  );
}

function BigAvatar({ name, image, size = 104, pulse }) {
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
            borderColor: 'rgba(255,255,255,0.6)',
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.55] }) }],
          }}
        />
      ) : null}
      {image ? (
        <Image source={{ uri: image }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Glass dark radius={size / 2} tint="rgba(255,255,255,0.18)" tintOpacity={1} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {letters ? (
            <Text style={{ color: WHITE, fontSize: size * 0.4, fontWeight: '500' }}>{letters}</Text>
          ) : (
            <Ionicons name="person" size={size * 0.5} color={WHITE} />
          )}
        </Glass>
      )}
    </View>
  );
}

function CallButton({ icon, label, onPress, on, disabled, color, size = 76, iconSize, hangup }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ alignItems: 'center', width: Math.max(COL, size + 26), opacity: disabled ? 0.35 : 1 }}>
      {({ pressed }) => (
        <>
          <Glass
            dark
            radius={size / 2}
            pressed={pressed}
            tint={color || (on ? '#FFFFFF' : 'rgba(255,255,255,0.16)')}
            tintOpacity={color ? 0.95 : 1}
            style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons
              name={icon}
              size={iconSize || size * 0.38}
              color={on && !color ? '#111' : WHITE}
              style={hangup ? { transform: [{ rotate: '135deg' }] } : null}
            />
          </Glass>
          {label ? (
            <Text style={{ color: WHITE, fontSize: 13, marginTop: 7, fontWeight: '500' }} numberOfLines={1}>
              {label}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

// Wide red "End" key from the layout.
function EndKey({ onPress }) {
  return (
    <Pressable onPress={onPress} style={{ width: COL, alignItems: 'center' }}>
      {({ pressed }) => (
        <>
          <Glass dark radius={26} pressed={pressed} tint={RED} tintOpacity={0.95} style={{ width: COL - 6, height: KEY, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="call" size={32} color={WHITE} style={{ transform: [{ rotate: '135deg' }] }} />
          </Glass>
          <Text style={{ color: WHITE, fontSize: 13, marginTop: 7, fontWeight: '500' }}>End</Text>
        </>
      )}
    </Pressable>
  );
}

function SmallPill({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', width: 110 }}>
      {({ pressed }) => (
        <>
          <Glass dark radius={26} pressed={pressed} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={21} color={WHITE} />
          </Glass>
          <Text style={{ color: WHITE, fontSize: 13, marginTop: 6 }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CallScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const sheet = useActionSheet();
  const { live, audio, ended, setMinimized, recording, startRecording, stopRecording } = useCalls();
  const { settings, resolve } = useData();
  const t = useTheme();
  const identify = useIdentity();
  const [keypad, setKeypad] = useState(false);
  const [dtmf, setDtmf] = useState('');
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
  const zoomStyle = useZoom();
  const nameStyle = usePhoto ? styles.posterName : styles.name;
  // depth layer goes right after the name so the person overlaps it
  const front = usePhoto && depth && !keypad ? <DepthLayer uri={depth.foreground} zoomStyle={zoomStyle} /> : null;

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
        Alert.alert('Send the following tones?', c.postDialWait, [
          { text: 'No', style: 'cancel', onPress: () => Dialer.postDialContinue(c.id, false) },
          { text: 'Send', onPress: () => Dialer.postDialContinue(c.id, true) },
        ]);
      }
    });
  }, [live]);

  const tap = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

  const wrap = (children, extra) => (
    <Animated.View style={[styles.root, { opacity: fade, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28 }, extra]}>
      <StatusBar style="light" />
      <Poster photo={photo} palette={palette} zoomStyle={zoomStyle} />
      {children}
    </Animated.View>
  );

  // ---------- call ended ----------
  if (!live.length && ended) {
    return wrap(
      <>
        <View style={{ alignItems: 'center', marginTop: usePhoto ? 36 : 70 }}>
          {usePhoto ? null : <BigAvatar name={who.name} image={who.image} />}
          {usePhoto ? <Text style={styles.statusTop}>{ended.disconnectLabel || 'Call Ended'}</Text> : null}
          <Text style={nameStyle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {who.name}
          </Text>
          {usePhoto ? null : <Text style={styles.status}>{ended.disconnectLabel || 'Call Ended'}</Text>}
        </View>
        {front}
      </>
    );
  }

  if (!live.length) return <View style={[styles.root, { backgroundColor: '#000' }]} />;

  // ---------- incoming call ----------
  if (ringing && !primary) {
    const reply = () =>
      sheet.show({
        title: 'Reply with Message',
        options: [
          ...QUICK_REPLIES.map((m) => ({ text: m, onPress: () => Dialer.reject(ringing.id, m) })),
          {
            text: 'Custom…',
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
          <Text style={styles.statusTop}>{statusText(ringing, who)}</Text>
          <Text style={nameStyle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {who.name}
          </Text>
          {usePhoto ? null : (
            <View style={{ marginTop: 28 }}>
              <BigAvatar name={who.name} image={who.image} size={120} pulse />
            </View>
          )}
        </View>
        {front}
        <View style={{ flex: 1 }} />
        <View style={styles.pillRow}>
          <SmallPill icon="notifications-off" label="Silence" onPress={() => Dialer.silenceRinger && Dialer.silenceRinger()} />
          <SmallPill icon="chatbubble" label="Message" onPress={reply} />
        </View>
        <View style={styles.answerRow}>
          <CallButton
            icon="call"
            label="Decline"
            color={RED}
            size={80}
            iconSize={34}
            hangup
            onPress={() => {
              tap();
              Dialer.reject(ringing.id, null);
            }}
          />
          <CallButton
            icon="call"
            label="Accept"
            color={GREEN}
            size={80}
            iconSize={34}
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
    sheet.show({ title: 'Audio', options: opts });
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

  return wrap(
    <>
      {/* top bar */}
      <View style={styles.topRow}>
        <Pressable onPress={() => setMinimized(true)} hitSlop={12}>
          {({ pressed }) => (
            <Glass dark radius={19} pressed={pressed} style={styles.topBtn}>
              <Ionicons name="chevron-down" size={20} color={WHITE} />
            </Glass>
          )}
        </Pressable>
        {primary.isConference ? (
          <Glass dark radius={16} style={{ paddingHorizontal: 12, height: 32, justifyContent: 'center' }}>
            <Text style={{ color: WHITE, fontSize: 13, fontWeight: '600' }}>Conference</Text>
          </Glass>
        ) : null}
      </View>

      {/* other call on hold */}
      {held.map((h) => {
        const hw = identify(h);
        return (
          <Pressable key={h.id} onPress={() => Dialer.swap()} style={{ marginHorizontal: 20, marginTop: 10 }}>
            <Glass dark radius={20} style={styles.heldStrip}>
              <Ionicons name="pause-circle" size={20} color={DIM} />
              <Text style={{ color: WHITE, fontSize: 15, fontWeight: '600', flex: 1, marginLeft: 8 }} numberOfLines={1}>
                {hw.name}
              </Text>
              <Text style={{ color: DIM, fontSize: 13 }}>On hold · tap to swap</Text>
            </Glass>
          </Pressable>
        );
      })}

      {/* caller */}
      {keypad ? (
        <View style={{ alignItems: 'center', marginTop: 34, paddingHorizontal: 24 }}>
          <Text style={styles.statusTop}>{who.name}</Text>
          <Text style={[styles.name, { fontWeight: '300', letterSpacing: 1.5 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>
            {dtmf || ' '}
          </Text>
        </View>
      ) : (
        <View style={{ alignItems: 'center', marginTop: twoCalls ? 18 : usePhoto ? 22 : 40 }}>
          <Text style={styles.statusTop}>{statusText(primary, who)}</Text>
          <Text style={nameStyle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>
            {who.name}
          </Text>
          {!ringing && !twoCalls && !usePhoto ? (
            <View style={{ marginTop: 26 }}>
              <BigAvatar name={who.name} image={who.image} size={110} pulse={!connected} />
            </View>
          ) : null}
        </View>
      )}

      {front}

      {/* call waiting card */}
      {ringing ? (
        <Glass dark radius={28} style={styles.waiting}>
          <Text style={{ color: DIM, fontSize: 13 }}>Incoming call</Text>
          <Text style={{ color: WHITE, fontSize: 22, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>
            {identify(ringing).name}
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', marginTop: 14 }}>
            <CallButton size={56} icon="close" label="End & Accept" color={RED} onPress={() => Dialer.endAndAnswer(ringing.id)} />
            <CallButton size={56} icon="call" hangup label="Decline" color="rgba(255,255,255,0.24)" onPress={() => Dialer.reject(ringing.id, null)} />
            {primary.canHold ? <CallButton size={56} icon="pause" label="Hold & Accept" color={GREEN} onPress={() => Dialer.holdAndAnswer(ringing.id)} /> : null}
          </View>
        </Glass>
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
                  <Glass radius={14} pressed={pressed} style={styles.simTile}>
                    <View style={[styles.simBadge, { backgroundColor: t.blue }]}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{i + 1}</Text>
                    </View>
                    <Text style={{ color: t.text, fontSize: 12, fontWeight: '600', marginTop: 5 }} numberOfLines={1}>
                      {a.label || `SIM ${i + 1}`}
                    </Text>
                  </Glass>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      ) : keypad ? (
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          {[0, 1, 2, 3].map((row) => (
            <View key={row} style={{ flexDirection: 'row', marginBottom: 12 }}>
              {DTMF_KEYS.slice(row * 3, row * 3 + 3).map(([d, l]) => (
                <Pressable key={d} onPress={() => pressDtmf(d)} style={{ marginHorizontal: 12 }}>
                  {({ pressed }) => (
                    <Glass dark radius={36} pressed={pressed} tint="rgba(255,255,255,0.16)" tintOpacity={1} style={styles.dtmfKey}>
                      <Text style={{ color: WHITE, fontSize: 32, lineHeight: 38 }}>{d}</Text>
                      {l ? <Text style={{ color: WHITE, fontSize: 9, fontWeight: '700', letterSpacing: 2 }}>{l}</Text> : null}
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
            <CallButton size={KEY} icon="person" label="Contact" onPress={openContact} disabled={!primary.number || primary.isConference} />
            <CallButton size={KEY} icon="chatbubble" label="Message" onPress={() => sendMessage(primary.number)} disabled={!primary.number} />
            <CallButton
              size={KEY}
              icon="radio-button-on"
              label={recording ? clock(recording.startedAt) : 'Record'}
              color={recording ? RED : undefined}
              onPress={toggleRecording}
              disabled={!connected && !recording}
            />
          </View>
          <View style={styles.gridRow}>
            <CallButton size={KEY} icon={audioIcon} label={audioLabel} on={route !== ROUTE.EARPIECE} onPress={chooseAudio} />
            <CallButton
              size={KEY}
              icon={isHeld ? 'play' : 'pause'}
              label={isHeld ? 'Resume' : 'Hold'}
              on={isHeld}
              disabled={!connected || (!primary.canHold && !isHeld)}
              onPress={() => Dialer.hold(primary.id, !isHeld)}
            />
            <CallButton
              size={KEY}
              icon={muted ? 'mic-off' : 'mic-off-outline'}
              label="Mute"
              on={muted}
              onPress={() => {
                tap();
                Dialer.mute(!muted);
              }}
            />
          </View>
        </View>
      )}

      {/* bottom row: Add Call · End · Keypad (End always in the middle) */}
      {primary.state === 'select_account' ? null : (
      <View style={styles.gridRow}>
        {keypad || primary.state === 'select_account' ? (
          <View style={{ width: COL }} />
        ) : (
          <CallButton size={KEY} icon={canMerge ? 'git-merge' : 'add'} label={canMerge ? 'Merge' : 'Add Call'} onPress={addOrMerge} />
        )}
        {primary.state === 'select_account' ? (
          <View style={{ width: COL }} />
        ) : (
          <EndKey
            onPress={() => {
              tap();
              Dialer.hangup(primary.id);
            }}
          />
        )}
        {keypad ? (
          <Pressable onPress={() => setKeypad(false)} hitSlop={12} style={{ width: COL, alignItems: 'center', paddingTop: 18 }}>
            <Glass dark radius={18} style={{ paddingHorizontal: 18, height: 36, justifyContent: 'center' }}>
              <Text style={{ color: WHITE, fontSize: 15, fontWeight: '600' }}>Hide</Text>
            </Glass>
          </Pressable>
        ) : primary.state === 'select_account' ? (
          <View style={{ width: COL }} />
        ) : (
          <CallButton size={KEY} icon="keypad" label="Keypad" onPress={() => setKeypad(true)} disabled={!connected} />
        )}
      </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0C10' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  topBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  statusTop: { color: DIM, fontSize: 17, fontWeight: '500', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 },
  status: { color: DIM, fontSize: 17, marginTop: 6, textAlign: 'center' },
  name: { color: WHITE, fontSize: 38, fontWeight: '600', marginTop: 4, textAlign: 'center', paddingHorizontal: 24, letterSpacing: 0.2 },
  posterName: {
    color: WHITE,
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 20,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowRadius: 10,
  },
  heldStrip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  waiting: { alignItems: 'center', marginHorizontal: 16, marginTop: 22, padding: 14 },
  grid: { alignItems: 'center' },
  gridRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', marginBottom: 16 },
  answerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 36 },
  pillRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 44, marginBottom: 34 },
  dtmfKey: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  simTile: { width: 102, paddingVertical: 9, paddingHorizontal: 7, alignItems: 'center' },
  simBadge: { width: 18, height: 18, borderRadius: 5.5, alignItems: 'center', justifyContent: 'center' },
  simRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
});
