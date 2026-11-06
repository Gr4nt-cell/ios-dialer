export const SEARCH_HISTORY_LIMIT = 9;

export function normalizeSearch(query) {
  return typeof query === 'string' ? query.trim().replace(/\s+/g, ' ') : '';
}

export function cleanSearchHistory(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(normalizeSearch).filter((query) => {
    const key = query.toLowerCase();
    if (!query || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, SEARCH_HISTORY_LIMIT);
}

export function addRecentSearch(history, query, replaceQuery = '') {
  const text = normalizeSearch(query);
  const previous = normalizeSearch(replaceQuery).toLowerCase();
  const items = cleanSearchHistory(history);
  if (!text) return items;
  // A result selection replaces its typed prefix; unrelated searches stay intact.
  const kept = previous ? items.filter((item) => item.toLowerCase() !== previous) : items;
  return cleanSearchHistory([text, ...kept]);
}
