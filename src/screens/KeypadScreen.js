import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../components/Touch';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_BAR_SPACE, useTheme } from '../theme';
import { useData } from '../DataContext';
import { useNav } from '../nav';
import { cleanNumber, contactName, formatNumber, t9Search } from '../phone';
import { playTone, preloadTones } from '../sounds';
import { IconButton } from '../components/ui';
import { Glass } from '../components/Glass';
import Dialer, { isImeiCode, isSecretCode, isUssdCode } from '../dialer';
import { useCalls } from '../CallContext';
import { load, save } from '../storage';

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

const LONG_PRESS_SWAP = { '0': '+', '*': ',', '#': ';' };

function Key({ digit, letters, size, onDown, onLong }) {
  const t = useTheme();
  return (
    <Pressable testID={`key-${digit}`} onPressIn={() => onDown(digit)} onLongPress={() => onLong(digit)} delayLongPress={450}>
      {({ pressed }) => (
        <Glass
          radius={size / 2}
          pressed={pressed}
          tint={t.dark ? 'rgba(255,255,255,0.13)' : 'rgba(120,120,128,0.09)'}
          tintOpacity={1}
          style={[styles.key, { width: size, height: size }]}
        >
          <Text
            style={{
              color: t.keyText,
              fontSize: digit === '*' ? size * 0.5 : size * 0.42,
              fontWeight: '400',
              lineHeight: digit === '*' ? size * 0.56 : size * 0.48,
              marginTop: digit === '*' ? size * 0.1 : 0,
            }}
          >
            {digit}
          </Text>
          {digit === '1' ? (
            <Ionicons name="recording-outline" size={size * 0.17} color={t.keyText} style={{ marginTop: -2 }} />
          ) : letters ? (
            <Text style={{ color: t.keyText, fontSize: size * 0.13, fontWeight: '700', letterSpacing: 2, marginTop: -1 }}>{letters}</Text>
          ) : null}
        </Glass>
      )}
    </Pressable>
  );
}

export default function KeypadScreen({ prefill }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const nav = useNav();
  const { call, callVoicemail, settings, recents, contacts, resolve } = useData();
  const { available, isDefault, requestDefault } = useCalls();
  const [hideBanner, setHideBanner] = useState(true);
  const [num, setNum] = useState('');
  const numRef = useRef('');

  const update = (fn) => {
    setNum((prev) => {
      const next = typeof fn === 'function' ? fn(prev) : fn;
      numRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    preloadTones();
    load('hideDefaultBanner', false).then(setHideBanner);
  }, []);

  useEffect(() => {
    if (prefill && prefill.value) update(cleanNumber(prefill.value));
  }, [prefill]);

  // 10% smaller keys than before, packed closer together like the iPhone keypad
  const base = Math.max(64, Math.min(82, Math.floor((width - 110) / 3), Math.floor((height - insets.top - TAB_BAR_SPACE - 300) / 4.6)));
  const size = Math.round(base * 0.9);
  const gapX = Math.round(size * 0.17);
  const gapY = Math.max(10, Math.round(size * 0.2));

  const feedback = (key) => {
    if (settings.dialTones) playTone(key);
    if (settings.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  const onDown = (key) => {
    feedback(key);
    update((n) => (n.length >= 40 ? n : n + key));
  };

  const onLong = (key) => {
    const current = numRef.current;
    if (key === '1' && current === '1') {
      update('');
      callVoicemail();
      return;
    }
    const swap = LONG_PRESS_SWAP[key];
    if (!swap) return;
    if (settings.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    update((n) => (n.endsWith(key) ? n.slice(0, -1) + swap : n + swap));
  };

  const backspace = () => {
    if (settings.haptics) Haptics.selectionAsync().catch(() => {});
    update((n) => n.slice(0, -1));
  };

  const onCall = () => {
    if (!num) {
      const lastOut = recents.find((g) => g.type === 'outgoing');
      if (lastOut) update(cleanNumber(lastOut.number));
      return;
    }
    if (settings.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (isSecretCode(num)) {
      const ok = Dialer && Dialer.sendSpecialCode(num);
      if (!ok) Alert.alert('Can’t Run Code', 'Set Phone as your default phone app to use this code.');
      update('');
      return;
    }
    if (isImeiCode(num)) {
      Alert.alert('IMEI', 'Android doesn’t share the IMEI with phone apps. You’ll find it in Settings › About phone.');
      update('');
      return;
    }
    if (isUssdCode(num)) {
      if (settings.ussdInApp && Dialer) nav.push({ name: 'ussd', code: num });
      else call(num);
      update('');
      return;
    }
    call(num);
    setTimeout(() => update(''), 600);
  };

  const onNumberLongPress = async () => {
    const clip = await Clipboard.getStringAsync().catch(() => '');
    const buttons = [];
    if (num) buttons.push({ text: 'Copy', onPress: () => Clipboard.setStringAsync(num) });
    if (cleanNumber(clip)) buttons.push({ text: 'Paste', onPress: () => update(cleanNumber(clip).slice(0, 40)) });
    if (!buttons.length) return;
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(num ? formatNumber(num) : 'Clipboard', undefined, buttons);
  };

  const exact = num ? resolve(num) : null;
  const suggestions = useMemo(() => (exact ? [] : t9Search(contacts, num, 5)), [contacts, num, exact]);
  const top = suggestions[0];
  const display = formatNumber(num);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: TAB_BAR_SPACE + insets.bottom }}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        <IconButton glass name="settings-outline" onPress={() => nav.push({ name: 'settings' })} />
      </View>

      {available && !isDefault && !hideBanner ? (
        <View style={[styles.banner, { backgroundColor: t.dark ? '#1C1C1E' : '#F2F2F7' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>Make Phone your default</Text>
            <Text style={{ color: t.secondary, fontSize: 13, marginTop: 2 }}>Use this call screen for every call.</Text>
          </View>
          <Pressable
            testID="set-default"
            onPress={async () => {
              const ok = await requestDefault();
              if (!ok && Dialer) Dialer.openDefaultAppsSettings();
            }}
            hitSlop={6}
            style={[styles.bannerButton, { backgroundColor: t.blue }]}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Set Default</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setHideBanner(true);
              save('hideDefaultBanner', true);
            }}
            hitSlop={10}
            style={{ marginLeft: 10 }}
          >
            <Ionicons name="close" size={18} color={t.secondary} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.displayArea}>
        <Pressable onLongPress={onNumberLongPress} delayLongPress={400} style={{ alignSelf: 'stretch' }}>
          <Text style={[styles.number, { color: t.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.45}>
            {display || ' '}
          </Text>
        </Pressable>
        <View style={styles.subArea}>
          {exact ? (
            <Text style={{ color: t.secondary, fontSize: 16 }} numberOfLines={1}>
              {contactName(exact.contact)}  ·  {exact.label}
            </Text>
          ) : top ? (
            <Pressable onPress={() => update(cleanNumber(top.number))} hitSlop={6}>
              <Text style={{ color: t.text, fontSize: 16 }} numberOfLines={1}>
                {contactName(top.contact)} <Text style={{ color: t.secondary }}>{top.label}</Text>
                {suggestions.length > 1 ? <Text style={{ color: t.blue }}>{'   '}{suggestions.length - 1} more</Text> : null}
              </Text>
            </Pressable>
          ) : num ? (
            <Pressable onPress={() => nav.push({ name: 'newContact', number: num })} hitSlop={6}>
              <Text style={{ color: t.blue, fontSize: 16 }}>Add Number</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: 'center' }}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={{ flexDirection: 'row', marginBottom: gapY }}>
            {KEYS.slice(row * 3, row * 3 + 3).map(([d, l]) => (
              <View key={d} style={{ marginHorizontal: gapX }}>
                <Key digit={d} letters={l} size={size} onDown={onDown} onLong={onLong} />
              </View>
            ))}
          </View>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: size, marginHorizontal: gapX }} />
          <Pressable testID="call-button" onPress={onCall} style={{ marginHorizontal: gapX }}>
            {({ pressed }) => (
              <Glass radius={size / 2} pressed={pressed} tint={t.green} tintOpacity={1} style={[styles.key, { width: size, height: size }]}>
                <Ionicons name="call" size={size * 0.42} color="#fff" />
              </Glass>
            )}
          </Pressable>
          <View style={{ width: size, marginHorizontal: gapX, alignItems: 'center' }}>
            {num ? (
              <Pressable onPress={backspace} onLongPress={() => update('')} hitSlop={14}>
                {({ pressed }) => <Ionicons name="backspace" size={size * 0.36} color={t.dark ? '#5C5C60' : '#C2C2C6'} style={{ opacity: pressed ? 0.5 : 1 }} />}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { height: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  banner: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, padding: 12, borderRadius: 14 },
  bannerButton: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, marginLeft: 8 },
  displayArea: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 28, paddingBottom: 14 },
  number: { fontSize: 40, fontWeight: '400', textAlign: 'center', letterSpacing: 0.5 },
  subArea: { height: 26, justifyContent: 'center', marginTop: 4 },
  key: { alignItems: 'center', justifyContent: 'center' },
});
