import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, AppState, PermissionsAndroid, Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import CallLog from '../modules/call-log';
import { load, save } from './storage';
import { contactName, numberKey, placeCall, prettyLabel, sameDay } from './phone';
import Dialer, { requestPhonePermissions } from './dialer';

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

const DEFAULT_SETTINGS = { dialTones: true, haptics: true, voicemailNumber: '', glass: 'clear', liquidGlass: true, theme: 'system', callPhoto: true, callDepth: true, callBackground: 'fastscore', autoRecord: false, language: 'system', depthScale: 100, depthX: 0, depthY: 0 };

const CALL_TYPES = { 1: 'incoming', 2: 'outgoing', 3: 'missed', 4: 'voicemail', 5: 'rejected', 6: 'blocked', 7: 'incoming' };
const isMissedType = (t) => t === 'missed' || t === 'rejected' || t === 'blocked';

const CONTACT_FIELDS = [
  Contacts.Fields.FirstName,
  Contacts.Fields.LastName,
  Contacts.Fields.Name,
  Contacts.Fields.Company,
  Contacts.Fields.JobTitle,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Emails,
  Contacts.Fields.Image,
  Contacts.Fields.RawImage,
].filter(Boolean);

function groupCalls(calls) {
  const out = [];
  for (const c of calls) {
    const key = numberKey(c.number) || c.number || 'unknown';
    const last = out[out.length - 1];
    if (last && last.key === key && isMissedType(last.type) === isMissedType(c.type) && sameDay(last.date, c.date)) {
      last.calls.push(c);
    } else {
      out.push({ id: c.id, key, number: c.number, name: c.name, type: c.type, date: c.date, calls: [c] });
    }
  }
  return out;
}

export function DataProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [favorites, setFavorites] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [localCalls, setLocalCalls] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [lastSeenRecents, setLastSeenRecents] = useState(Date.now());
  const [contacts, setContacts] = useState([]);
  const [contactsPerm, setContactsPerm] = useState('undetermined');
  const [contactsError, setContactsError] = useState(null);
  const [deviceCalls, setDeviceCalls] = useState([]);
  const [callLogPerm, setCallLogPerm] = useState(Platform.OS === 'android' && CallLog ? 'undetermined' : 'unavailable');
  const busy = useRef(false);

  // ---------- loading ----------

  const refreshContacts = useCallback(async (ask = false) => {
    try {
      const perm = ask ? await Contacts.requestPermissionsAsync() : await Contacts.getPermissionsAsync();
      setContactsPerm(perm.status);
      if (perm.status !== 'granted') return;
      const { data } = await Contacts.getContactsAsync({ fields: CONTACT_FIELDS, sort: Contacts.SortTypes.FirstName });

      // The photo a contact is actually stored with, which is often larger
      // than the one expo-contacts hands back — one query for all of them.
      let large = null;
      try {
        large = Dialer && Dialer.getDisplayPhotos ? Dialer.getDisplayPhotos() : null;
      } catch {
        large = null;
      }

      const kept = data.filter((c) => c.name || c.firstName || c.lastName || c.company || (c.phoneNumbers && c.phoneNumbers.length));
      setContacts(
        large
          ? kept.map((c) => {
              const uri = c.id && large[String(c.id)];
              return uri ? { ...c, largeImage: { uri } } : c;
            })
          : kept
      );
      setContactsError(null);
    } catch (e) {
      setContactsError(e && e.message ? e.message : String(e));
    }
  }, []);

  const refreshCallLog = useCallback(async (ask = false) => {
    if (Platform.OS !== 'android' || !CallLog) {
      setCallLogPerm('unavailable');
      return;
    }
    try {
      const perm = PermissionsAndroid.PERMISSIONS.READ_CALL_LOG;
      let ok = await PermissionsAndroid.check(perm);
      if (!ok && ask) ok = (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
      setCallLogPerm(ok ? 'granted' : 'denied');
      if (!ok) return;
      const rows = await CallLog.load(600);
      setDeviceCalls(
        rows.map((r) => ({
          id: 'd' + r.id,
          rawId: r.id,
          number: r.number || '',
          name: r.name || null,
          type: CALL_TYPES[r.type] || 'incoming',
          date: r.date,
          duration: r.duration,
          source: 'device',
        }))
      );
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [s, f, b, l, h, seen] = await Promise.all([
        load('settings', DEFAULT_SETTINGS),
        load('favorites', []),
        load('blocked', []),
        load('localCalls', []),
        load('hiddenCalls', []),
        load('lastSeenRecents', Date.now()),
      ]);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setFavorites(f);
      setBlocked(b);
      setLocalCalls(l);
      setHidden(h);
      setLastSeenRecents(seen);
      await refreshContacts(true);
      await requestPhonePermissions();
      await refreshCallLog(false);
    })();
  }, [refreshContacts, refreshCallLog]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !busy.current) {
        busy.current = true;
        Promise.all([refreshContacts(false), refreshCallLog(false)]).finally(() => {
          busy.current = false;
        });
      }
    });
    return () => sub.remove();
  }, [refreshContacts, refreshCallLog]);

  // ---------- appearance: follow the system or force light / dark ----------

  useEffect(() => {
    try {
      Appearance.setColorScheme(settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : 'unspecified');
    } catch {
      // older React Native: null means "follow system"
      try {
        Appearance.setColorScheme(settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : null);
      } catch {
        // ignore
      }
    }
  }, [settings.theme]);

  // ---------- lookups ----------

  const lookup = useMemo(() => {
    const map = new Map();
    for (const c of contacts) {
      for (const p of c.phoneNumbers || []) {
        const k = numberKey(p.number);
        if (k && !map.has(k)) map.set(k, { contact: c, label: prettyLabel(p.label) });
      }
    }
    return map;
  }, [contacts]);

  const resolve = useCallback((number) => lookup.get(numberKey(number)) || null, [lookup]);
  const findContact = useCallback((id) => contacts.find((c) => c.id === id) || null, [contacts]);

  // ---------- recents ----------

  const recents = useMemo(() => {
    const source = callLogPerm === 'granted' ? deviceCalls : localCalls;
    const hiddenSet = new Set(hidden);
    const list = source.filter((c) => !hiddenSet.has(c.id)).sort((a, b) => b.date - a.date);
    return groupCalls(list);
  }, [callLogPerm, deviceCalls, localCalls, hidden]);

  const missedCount = useMemo(
    () => recents.filter((g) => isMissedType(g.type) && g.date > lastSeenRecents).length,
    [recents, lastSeenRecents]
  );

  const markRecentsSeen = useCallback(() => {
    const now = Date.now();
    setLastSeenRecents(now);
    save('lastSeenRecents', now);
  }, []);

  const deleteCalls = useCallback(
    async (calls) => {
      const deviceIds = calls.filter((c) => c.source === 'device').map((c) => c.rawId);
      let removedOnDevice = false;
      if (deviceIds.length && CallLog) {
        try {
          const perm = PermissionsAndroid.PERMISSIONS.WRITE_CALL_LOG;
          let ok = await PermissionsAndroid.check(perm);
          if (!ok) ok = (await PermissionsAndroid.request(perm)) === PermissionsAndroid.RESULTS.GRANTED;
          if (ok) {
            await CallLog.remove(deviceIds);
            removedOnDevice = true;
          }
        } catch {
          removedOnDevice = false;
        }
      }
      const ids = new Set(calls.map((c) => c.id));
      setLocalCalls((prev) => {
        const next = prev.filter((c) => !ids.has(c.id));
        save('localCalls', next);
        return next;
      });
      if (!removedOnDevice) {
        setHidden((prev) => {
          const next = [...new Set([...prev, ...calls.filter((c) => c.source === 'device').map((c) => c.id)])].slice(-3000);
          save('hiddenCalls', next);
          return next;
        });
      }
      refreshCallLog(false);
    },
    [refreshCallLog]
  );

  // ---------- calling ----------

  const call = useCallback(async (number, accountKey = null) => {
    if (!number) return;
    const entry = { id: 'l' + Date.now(), number, type: 'outgoing', date: Date.now(), duration: 0, source: 'local' };
    setLocalCalls((prev) => {
      const next = [entry, ...prev].slice(0, 500);
      save('localCalls', next);
      return next;
    });
    await placeCall(number, accountKey);
  }, []);

  const callVoicemail = useCallback(() => {
    placeCall(settings.voicemailNumber ? settings.voicemailNumber : 'voicemail:');
  }, [settings.voicemailNumber]);

  // ---------- settings ----------

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save('settings', next);
      return next;
    });
  }, []);

  // ---------- favorites ----------

  const persistFavorites = (next) => {
    save('favorites', next);
    return next;
  };

  const addFavorite = useCallback((contact, number, label) => {
    setFavorites((prev) => {
      if (prev.some((f) => numberKey(f.number) === numberKey(number))) return prev;
      return persistFavorites([
        ...prev,
        { id: 'f' + Date.now(), contactId: contact ? contact.id : null, name: contact ? contactName(contact) : number, number, label: label || 'mobile' },
      ]);
    });
  }, []);

  const removeFavorite = useCallback((id) => {
    setFavorites((prev) => persistFavorites(prev.filter((f) => f.id !== id)));
  }, []);

  const removeFavoriteByNumber = useCallback((number) => {
    setFavorites((prev) => persistFavorites(prev.filter((f) => numberKey(f.number) !== numberKey(number))));
  }, []);

  const moveFavorite = useCallback((id, dir) => {
    setFavorites((prev) => {
      const i = prev.findIndex((f) => f.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return persistFavorites(next);
    });
  }, []);

  const isFavorite = useCallback((number) => favorites.some((f) => numberKey(f.number) === numberKey(number)), [favorites]);

  // ---------- blocking ----------

  const block = useCallback((number) => {
    if (Dialer && Dialer.canBlockNumbers()) Dialer.blockNumber(number);
    setBlocked((prev) => {
      if (prev.some((n) => numberKey(n) === numberKey(number))) return prev;
      const next = [...prev, number];
      save('blocked', next);
      return next;
    });
  }, []);

  const unblock = useCallback((number) => {
    if (Dialer && Dialer.canBlockNumbers()) Dialer.unblockNumber(number);
    setBlocked((prev) => {
      const next = prev.filter((n) => numberKey(n) !== numberKey(number));
      save('blocked', next);
      return next;
    });
  }, []);

  const isBlocked = useCallback((number) => blocked.some((n) => numberKey(n) === numberKey(number)), [blocked]);

  // ---------- contacts ----------

  const deleteContact = useCallback(
    async (id) => {
      try {
        await Contacts.removeContactAsync(id);
      } catch {
        // ignore
      }
      setFavorites((prev) => persistFavorites(prev.filter((f) => f.contactId !== id)));
      await refreshContacts(false);
    },
    [refreshContacts]
  );

  const value = {
    settings,
    updateSettings,
    contacts,
    contactsPerm,
    contactsError,
    refreshContacts,
    findContact,
    deleteContact,
    resolve,
    recents,
    missedCount,
    markRecentsSeen,
    deleteCalls,
    callLogPerm,
    refreshCallLog,
    call,
    callVoicemail,
    favorites,
    addFavorite,
    removeFavorite,
    removeFavoriteByNumber,
    moveFavorite,
    isFavorite,
    blocked,
    block,
    unblock,
    isBlocked,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export { isMissedType };
