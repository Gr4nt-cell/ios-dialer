import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking, Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DataProvider, useData } from './src/DataContext';
import { CallProvider, useCalls } from './src/CallContext';
import { ActionSheetProvider } from './src/components/ActionSheet';
import { NavContext } from './src/nav';
import { useTheme } from './src/theme';
import { load, save } from './src/storage';
import { contactName, parseTelUrl } from './src/phone';
import TabBar, { CLASSIC_TABS, UNIFIED_TABS } from './src/components/TabBar';
import { BlurTargetView, GlassModeContext, GlassTargetContext } from './src/components/Glass';
import FavoritesScreen from './src/screens/FavoritesScreen';
import RecentsScreen from './src/screens/RecentsScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import KeypadScreen from './src/screens/KeypadScreen';
import VoicemailScreen from './src/screens/VoicemailScreen';
import ContactDetailScreen from './src/screens/ContactDetailScreen';
import NewContactScreen from './src/screens/NewContactScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PickFavoriteScreen from './src/screens/PickFavoriteScreen';
import UssdScreen from './src/screens/UssdScreen';
import RecordingsScreen from './src/screens/RecordingsScreen';
import CallScreen from './src/screens/CallScreen';
import CallsScreen from './src/screens/CallsScreen';
import SearchScreen from './src/screens/SearchScreen';

const ROUTES = {
  contact: ContactDetailScreen,
  newContact: NewContactScreen,
  settings: SettingsScreen,
  pickFavorite: PickFavoriteScreen,
  ussd: UssdScreen,
  recordings: RecordingsScreen,
};

// In-app "Dynamic Island": a black pill around the selfie camera while a call is minimised.
function ReturnToCall() {
  const insets = useSafeAreaInsets();
  const { live, minimized, setMinimized } = useCalls();
  const { resolve } = useData();
  const [, tick] = useState(0);
  const call = live.find((c) => c.state === 'active') || live[0];
  useEffect(() => {
    if (!call || !minimized) return undefined;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [call, minimized]);
  if (!live.length || !minimized || !call) return null;
  const match = call.number ? resolve(call.number) : null;
  const name = match ? contactName(match.contact) : call.name || call.number || 'Call';
  let status = 'Calling…';
  if (call.state === 'ringing') status = 'Incoming';
  else if (call.state === 'holding') status = 'On hold';
  else if (call.state === 'active' && call.connectTime) {
    const s = Math.max(0, Math.floor((Date.now() - call.connectTime) / 1000));
    status = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  const top = Math.max(4, Math.round((insets.top - 34) / 2));
  // The status bar takes every touch inside its strip, so the pill reaches a little below it.
  const height = Math.max(34, insets.top - top + 14);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top, left: 0, right: 0, alignItems: 'center', zIndex: 50, elevation: 50 }}>
      <Pressable onPress={() => setMinimized(false)} hitSlop={{ bottom: 12, left: 8, right: 8 }}>
        {({ pressed }) => (
          <View style={[islandStyle, { height, borderRadius: Math.min(height / 2, 22), transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            <Ionicons name="call" size={14} color="#30D158" />
            <Text style={{ color: '#30D158', fontSize: 13, fontWeight: '700', marginLeft: 5, flex: 1 }} numberOfLines={1}>
              {status}
            </Text>
            <View style={{ width: 40 }} />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' }} numberOfLines={1}>
              {name}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const islandStyle = { flexDirection: 'row', alignItems: 'center', backgroundColor: '#000', width: 220, height: 34, borderRadius: 17, paddingHorizontal: 12 };

function Main() {
  const t = useTheme();
  const { missedCount, settings } = useData();
  const blurTarget = useRef(null);
  const unified = settings.layout !== 'classic';
  const tabs = unified ? UNIFIED_TABS : CLASSIC_TABS;
  const { showScreen, live, setMinimized } = useCalls();
  const [tab, setTabState] = useState('keypad');
  const [stack, setStack] = useState([]);
  const [prefill, setPrefill] = useState(null);
  const keyCounter = useRef(0);

  useEffect(() => {
    load('lastTab', 'keypad').then((saved) => setTabState((cur) => (cur === 'keypad' ? saved : cur)));
  }, []);

  const setTab = useCallback((next) => {
    setTabState(next);
    save('lastTab', next);
  }, []);

  const push = useCallback((route) => {
    keyCounter.current += 1;
    setStack((s) => [...s, { ...route, key: String(keyCounter.current) }]);
  }, []);

  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);

  // Opened from a tel: link (another app, browser, etc.)
  useEffect(() => {
    const handle = (url) => {
      const number = parseTelUrl(url);
      if (number) {
        setStack([]);
        setTabState('keypad');
        setPrefill({ value: number, ts: Date.now() });
      }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const nav = useMemo(() => ({ push, pop, setTab }), [push, pop, setTab]);

  // map tabs between layouts (e.g. "recents" ⇄ "calls")
  const shownTab = unified
    ? { favorites: 'calls', recents: 'calls', voicemail: 'calls' }[tab] || tab
    : { calls: 'recents' }[tab] || tab;

  let screen;
  switch (shownTab) {
    case 'calls':
      screen = <CallsScreen />;
      break;
    case 'search':
      screen = <SearchScreen />;
      break;
    case 'favorites':
      screen = <FavoritesScreen />;
      break;
    case 'recents':
      screen = <RecentsScreen />;
      break;
    case 'contacts':
      screen = <ContactsScreen />;
      break;
    case 'voicemail':
      screen = <VoicemailScreen />;
      break;
    default:
      screen = <KeypadScreen prefill={prefill} />;
  }

  return (
    <NavContext.Provider value={nav}>
      <GlassModeContext.Provider value={settings.glass === 'tinted' ? 'tinted' : 'clear'}>
      <GlassTargetContext.Provider value={blurTarget}>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <BlurTargetView ref={blurTarget} style={{ flex: 1, backgroundColor: t.bg }}>
          {screen}
        </BlurTargetView>
        <TabBar tabs={tabs} active={shownTab} onChange={setTab} badges={{ recents: missedCount, calls: missedCount }} />
        <ReturnToCall />
      </View>
      {stack.map((route) => {
        const Screen = ROUTES[route.name];
        if (!Screen) return null;
        return (
          <Modal key={route.key} visible animationType="slide" onRequestClose={pop} statusBarTranslucent navigationBarTranslucent>
            <SafeAreaProvider>
              <View style={{ flex: 1, backgroundColor: t.grouped }}>
                <Screen route={route} />
              </View>
            </SafeAreaProvider>
          </Modal>
        );
      })}
      {showScreen ? (
        <Modal visible animationType="fade" onRequestClose={() => live.length && setMinimized(true)} statusBarTranslucent navigationBarTranslucent>
          <SafeAreaProvider>
            <CallScreen />
          </SafeAreaProvider>
        </Modal>
      ) : null}
      </GlassTargetContext.Provider>
      </GlassModeContext.Provider>
    </NavContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DataProvider>
        <CallProvider>
          <ActionSheetProvider>
            <Main />
          </ActionSheetProvider>
        </CallProvider>
      </DataProvider>
    </SafeAreaProvider>
  );
}
