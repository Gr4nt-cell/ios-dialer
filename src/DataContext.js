import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Appearance, AppState, PermissionsAndroid, Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import CallLog from '../modules/call-log';
import { load, save } from './storage';
import { contactName, numberKey, placeCall, prettyLabel, sameDay } from './phone';
import Dialer, { requestPhonePermissions } from './dialer';

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

const DEFAULT_SETTINGS = { dialTones: true, haptics: true, voicemailNumber: '', glass: 'clear', liquidGlass: true, theme: 'system', callPhoto: true, depth: true, depthSprout: 48, depthScale: 100, depthX: 0, depthY: 0, callBackground: 'pastel', callBackgroundVersion: 2, appBackground: 'mint', appBackgroundUri: '', autoRecord: false, language: 'system' };

const CALL_TYPES = { 1: 'incoming', 2: 'outgoing', 3: 'missed', 4: 'voicemail', 5: 'rejected', 6: 'blocked', 7: 'incoming' };
const isMissedType = (t) => t === 'missed' || t === 'rejected' || t === 'blocked';

const CONTACT_FIELDS = [
  Contacts.Fields.FirstName,
  Contacts.Fields.MiddleName,
  Contacts.Fields.LastName,
  Contacts.Fields.NamePrefix,
  Contacts.Fields.NameSuffix,
  Contacts.Fields.Name,
  Contacts.Fields.Nickname,
  Contacts.Fields.Company,
  Contacts.Fields.JobTitle,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Emails,
  Contacts.Fields.Addresses,
  Contacts.Fields.Birthday,
  Contacts.Fields.UrlAddresses,
  ...(Platform.OS === 'android' ? [Contacts.Fields.Note] : []),
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
  const [dismissedAutoFavorites, setDismissedAutoFavorites] = useState([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [blocked, setBlocked] = useState([]);
  const [localCalls, setLocalCalls] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [lastSeenRecents, setLastSeenRecents] = useState(Date.now());
  const [contacts, setContacts] = useState([]);
  const [contactsPerm, setContactsPerm] = useState('undetermined');
  const [contactsError, setContactsError] = useState(null);
  const [deviceCalls, setDeviceCalls] = useState([]);
  const [callLogPerm, setCallLogPerm] = useState(Platform.OS === 'android' && CallLog ? 'undetermined' : 'unavailable');
  const [callHistoryReady, setCallHistoryReady] = useState(false);
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
      setCallHistoryReady(true);
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
    } finally {
      setCallHistoryReady(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const [s, f, b, l, h, seen, dismissedAuto] = await Promise.all([
        load('settings', DEFAULT_SETTINGS),
        load('favorites', []),
        load('blocked', []),
        load('localCalls', []),
        load('hiddenCalls', []),
        load('lastSeenRecents', Date.now()),
        load('dismissedAutoFavorites', []),
      ]);
      const loadedSettings = { ...DEFAULT_SETTINGS, ...s };
      // The depth effect is back, so its keys are kept rather than stripped.
      // `callDepth` was the old switch; it carries over to the new one.
      if (Object.prototype.hasOwnProperty.call(s || {}, 'callDepth') && !Object.prototype.hasOwnProperty.call(s || {}, 'depth')) {
        loadedSettings.depth = s.callDepth !== false;
      }
      delete loadedSettings.callDepth;
      // The previous default was Fast Score. Move that default (and legacy
      // Automatic) to the user's requested plain white background while
      // leaving any other explicitly chosen gradient untouched.
      if ((s.callBackgroundVersion || 0) < 1) {
        if (loadedSettings.callBackground === 'fastscore' || loadedSettings.callBackground === 'auto') {
          loadedSettings.callBackground = 'plain';
        }
        loadedSettings.callBackgroundVersion = 1;
        await save('settings', loadedSettings);
      }
      // The default is now the app's pastel backdrop. Anyone still on a default
      // — plain white, or legacy Automatic — moves with it; anyone who picked a
      // gradient for themselves keeps it.
      if ((loadedSettings.callBackgroundVersion || 0) < 2) {
        if (!loadedSettings.callBackground || loadedSettings.callBackground === 'plain' || loadedSettings.callBackground === 'auto') {
          loadedSettings.callBackground = 'pastel';
        }
        loadedSettings.callBackgroundVersion = 2;
        await save('settings', loadedSettings);
      }
      setSettings(loadedSettings);
      setFavorites(f);
      setDismissedAutoFavorites(dismissedAuto);
      setFavoritesReady(true);
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

  const automaticFavoriteCandidates = useMemo(() => {
    if (contactsPerm !== 'granted') return [];

    const byContact = new Map();
    for (const group of recents) {
      for (const entry of group.calls || []) {
        // Only count calls where a conversation could actually have happened.
        if (entry.type !== 'incoming' && entry.type !== 'outgoing') continue;
        const matched = lookup.get(numberKey(entry.number));
        const contact = matched && matched.contact;
        if (!contact || contact.id == null) continue;

        const contactKey = String(contact.id);
        let stats = byContact.get(contactKey);
        if (!stats) {
          stats = { contact, count: 0, lastCall: 0, numbers: new Map() };
          byContact.set(contactKey, stats);
        }

        const date = Number(entry.date) || 0;
        stats.count += 1;
        stats.lastCall = Math.max(stats.lastCall, date);

        const phoneKey = numberKey(entry.number);
        if (!phoneKey) continue;
        let phone = stats.numbers.get(phoneKey);
        if (!phone) {
          phone = { number: entry.number, label: matched.label || 'phone', count: 0, lastCall: 0 };
          stats.numbers.set(phoneKey, phone);
        }
        phone.count += 1;
        if (date >= phone.lastCall) {
          phone.number = entry.number;
          phone.label = matched.label || 'phone';
          phone.lastCall = date;
        }
      }
    }

    return [...byContact.values()]
      .map((stats) => {
        const phone = [...stats.numbers.values()].sort((a, b) => b.count - a.count || b.lastCall - a.lastCall)[0];
        return phone
          ? {
              contactId: stats.contact.id,
              name: contactName(stats.contact),
              number: phone.number,
              label: phone.label,
              count: stats.count,
              lastCall: stats.lastCall,
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.count - a.count || b.lastCall - a.lastCall || a.name.localeCompare(b.name));
  }, [contactsPerm, lookup, recents]);

  useEffect(() => {
    if (!favoritesReady || !callHistoryReady || contactsPerm !== 'granted') return;
    // Without call-log access there is no complete ranking; retain previous
    // automatic favorites until history becomes available again.
    if (callLogPerm !== 'granted' && localCalls.length === 0) return;

    const dismissed = new Set((Array.isArray(dismissedAutoFavorites) ? dismissedAutoFavorites : []).map(String));
    const candidates = automaticFavoriteCandidates
      .filter((candidate) => !dismissed.has(String(candidate.contactId)))
      .slice(0, 5);

    setFavorites((prev) => {
      const manualContactIds = new Set(prev.filter((favorite) => !favorite.auto && favorite.contactId != null).map((favorite) => String(favorite.contactId)));
      const manualNumbers = new Set(prev.filter((favorite) => !favorite.auto).map((favorite) => numberKey(favorite.number)).filter(Boolean));
      const eligible = candidates.filter(
        (candidate) =>
          !manualContactIds.has(String(candidate.contactId)) &&
          !manualNumbers.has(numberKey(candidate.number))
      );
      const eligibleByContact = new Map(eligible.map((candidate) => [String(candidate.contactId), candidate]));
      const added = new Set();
      const next = [];

      // Keep the user's existing order, including any manual reordering.
      for (const favorite of prev) {
        if (!favorite.auto) {
          next.push(favorite);
          continue;
        }
        const key = String(favorite.contactId);
        const candidate = eligibleByContact.get(key);
        if (!candidate || added.has(key)) continue;
        next.push({ ...favorite, ...candidate, id: favorite.id, auto: true });
        added.add(key);
      }

      for (const candidate of eligible) {
        const key = String(candidate.contactId);
        if (added.has(key)) continue;
        next.push({ ...candidate, id: `auto-${key}`, auto: true });
        added.add(key);
      }

      const unchanged =
        prev.length === next.length &&
        prev.every((favorite, index) => {
          const updated = next[index];
          return (
            favorite.id === updated.id &&
            favorite.contactId === updated.contactId &&
            favorite.number === updated.number &&
            favorite.name === updated.name &&
            favorite.label === updated.label &&
            favorite.auto === updated.auto
          );
        });
      return unchanged ? prev : persistFavorites(next);
    });
  }, [automaticFavoriteCandidates, callHistoryReady, callLogPerm, contactsPerm, dismissedAutoFavorites, favoritesReady, localCalls.length]);

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

  const dismissAutoFavorite = useCallback((favorite) => {
    if (!favorite || !favorite.auto || favorite.contactId == null) return;
    const key = String(favorite.contactId);
    setDismissedAutoFavorites((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      save('dismissedAutoFavorites', next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((id) => {
    dismissAutoFavorite(favorites.find((favorite) => favorite.id === id));
    setFavorites((prev) => persistFavorites(prev.filter((f) => f.id !== id)));
  }, [dismissAutoFavorite, favorites]);

  const removeFavoriteByNumber = useCallback((number) => {
    favorites.filter((favorite) => numberKey(favorite.number) === numberKey(number)).forEach(dismissAutoFavorite);
    setFavorites((prev) => persistFavorites(prev.filter((f) => numberKey(f.number) !== numberKey(number))));
  }, [dismissAutoFavorite, favorites]);

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
