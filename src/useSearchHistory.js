import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { load } from './storage';
import { addRecentSearch, cleanSearchHistory } from './searchHistory';

const KEY = 'recentSearches';

export default function useSearchHistory() {
  const [history, setHistory] = useState([]);
  const store = useRef({ items: [], ready: false, pending: [], writes: Promise.resolve() });
  const persist = useCallback((items) => {
    // Serialize writes so a rapid tap/clear cannot restore an older list.
    const json = JSON.stringify(items);
    store.current.writes = store.current.writes.catch(() => {}).then(() => AsyncStorage.setItem(KEY, json));
    store.current.writes.catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    load(KEY, []).then((saved) => {
      const current = store.current;
      current.items = current.pending.reduce((items, update) => update(items), cleanSearchHistory(saved));
      current.pending = [];
      current.ready = true;
      if (mounted) setHistory(current.items);
      persist(current.items);
    });
    return () => { mounted = false; };
  }, [persist]);

  const update = useCallback((operation) => {
    const current = store.current;
    if (!current.ready) current.pending.push(operation);
    current.items = operation(current.items);
    setHistory(current.items);
    if (current.ready) persist(current.items);
  }, [persist]);
  const rememberSearch = useCallback((query) => update((items) => addRecentSearch(items, query)), [update]);
  const clearSearchHistory = useCallback(() => update(() => []), [update]);
  return { searchHistory: history, rememberSearch, clearSearchHistory };
}
