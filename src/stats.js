import { numberKey } from './phone';

export const PERIODS = ['week', 'month', 'year'];

const WINDOW = {
  week: 7 * 86400000,
  month: 30 * 86400000,
  year: 365 * 86400000,
};

const bucket = (type) =>
  type === 'incoming' ? 'incoming'
  : type === 'outgoing' ? 'outgoing'
  : type === 'missed' || type === 'rejected' || type === 'blocked' ? 'missed'
  : 'other';

/**
 * Rolls a flat list of call-log rows into the numbers the Statistics screen
 * shows. `nameFor` resolves a number to a contact name where there is one.
 */
export function computeStats(calls, period, nameFor, now = Date.now()) {
  const span = WINDOW[period] || WINDOW.month;
  const from = now - span;
  const inWindow = [];
  let previous = 0;

  for (const c of calls) {
    const d = Number(c.date);
    if (d >= from && d <= now) inWindow.push(c);
    else if (d >= from - span && d < from) previous += 1;
  }

  const byType = { incoming: 0, outgoing: 0, missed: 0, other: 0 };
  const perWeekday = [0, 0, 0, 0, 0, 0, 0];
  const perHour = new Array(24).fill(0);
  const people = new Map();
  let talkSeconds = 0;
  let connected = 0;

  for (const c of inWindow) {
    byType[bucket(c.type)] += 1;

    const d = new Date(Number(c.date));
    perWeekday[(d.getDay() + 6) % 7] += 1; // Monday first
    perHour[d.getHours()] += 1;

    const secs = Math.max(0, Number(c.duration) || 0);
    if (secs > 0) {
      talkSeconds += secs;
      connected += 1;
    }

    const key = numberKey(c.number) || (c.name || '').toLowerCase();
    if (key) {
      const hit = people.get(key);
      if (hit) {
        hit.count += 1;
        hit.seconds += secs;
      } else {
        people.set(key, {
          key,
          number: c.number,
          name: (c.name && c.name.trim()) || (nameFor && nameFor(c.number)) || c.number || 'Unknown',
          count: 1,
          seconds: secs,
        });
      }
    }
  }

  const maxDay = Math.max(...perWeekday);
  const maxHour = Math.max(...perHour);

  return {
    total: inWindow.length,
    byType,
    talkSeconds,
    avgSeconds: connected ? Math.round(talkSeconds / connected) : 0,
    perWeekday,
    busiestWeekday: maxDay > 0 ? perWeekday.indexOf(maxDay) : null,
    busiestHour: maxHour > 0 ? perHour.indexOf(maxHour) : null,
    topContacts: [...people.values()]
      .sort((a, b) => b.count - a.count || b.seconds - a.seconds)
      .slice(0, 5),
    trendPct: previous > 0 ? Math.round(((inWindow.length - previous) / previous) * 100) : null,
  };
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatShort(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function formatHour(hour) {
  if (hour === null || hour === undefined) return null;
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}${hour < 12 ? 'am' : 'pm'}`;
}
