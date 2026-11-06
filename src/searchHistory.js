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

export function addRecentSearch(history, query) {
  const text = normalizeSearch(query);
  return text ? cleanSearchHistory([text, ...cleanSearchHistory(history)]) : cleanSearchHistory(history);
}
