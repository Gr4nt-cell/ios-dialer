import { load, save } from './storage';
import { numberKey } from './phone';

/**
 * Who is this unknown number?
 *
 * There is no offline directory to answer that from, so this asks a service
 * you choose with a key you supply. Nothing happens until you enter one: with
 * no key the whole feature is inert and no number ever leaves the phone.
 *
 * What you get back depends on the service and the country. Carrier and region
 * come from the number plan and are reliable almost everywhere. A *name* only
 * exists where the network publishes one (CNAM, effectively US and Canada), so
 * for most of the world expect carrier, line type and a spam verdict rather
 * than a person's name.
 */

const CACHE_KEY = 'lookupCache';
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // a month: carriers and spam reports move slowly

export const PROVIDERS = [
  {
    id: 'numverify',
    name: 'NumVerify',
    fields: [{ key: 'key', label: 'API key' }],
    site: 'numverify.com',
    gives: 'carrier, line type and region',
  },
  {
    id: 'twilio',
    name: 'Twilio Lookup',
    fields: [
      { key: 'sid', label: 'Account SID' },
      { key: 'key', label: 'Auth token' },
    ],
    site: 'twilio.com',
    gives: 'carrier, line type, and caller name in the US',
  },
  {
    id: 'custom',
    name: 'Custom URL',
    fields: [{ key: 'url', label: 'URL with {number}' }],
    site: 'your own endpoint',
    gives: 'whatever your endpoint returns as {name, carrier, spam}',
  },
];

let cache = null;

async function readCache() {
  if (!cache) cache = (await load(CACHE_KEY, {})) || {};
  return cache;
}

/** Everything this feature has ever stored, dropped in one go. */
export async function clearCache() {
  cache = {};
  save(CACHE_KEY, cache);
}

function normalise(raw, provider) {
  if (!raw) return null;
  if (provider === 'numverify') {
    if (raw.success === false) return null;
    return {
      name: null,
      carrier: raw.carrier || null,
      region: [raw.location, raw.country_name].filter(Boolean).join(', ') || null,
      lineType: raw.line_type || null,
      spam: false,
    };
  }
  if (provider === 'twilio') {
    const cnam = raw.caller_name && raw.caller_name.caller_name;
    const line = raw.line_type_intelligence || {};
    return {
      name: cnam || null,
      carrier: line.carrier_name || null,
      region: raw.country_code || null,
      lineType: line.type || null,
      spam: false,
    };
  }
  // a custom endpoint answers in our own shape
  return {
    name: raw.name || null,
    carrier: raw.carrier || null,
    region: raw.region || null,
    lineType: raw.lineType || null,
    spam: raw.spam === true,
  };
}

async function request(number, settings) {
  const provider = settings.lookupProvider || 'numverify';
  const creds = settings.lookupCreds || {};
  const e164 = number.replace(/[^\d+]/g, '');

  if (provider === 'numverify') {
    if (!creds.key) return null;
    const url = `https://apilayer.net/api/validate?access_key=${encodeURIComponent(creds.key)}&number=${encodeURIComponent(e164)}`;
    const res = await fetch(url);
    return normalise(await res.json(), provider);
  }
  if (provider === 'twilio') {
    if (!creds.sid || !creds.key) return null;
    const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=caller_name,line_type_intelligence`;
    const auth = global.btoa ? global.btoa(`${creds.sid}:${creds.key}`) : null;
    if (!auth) return null;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    return normalise(await res.json(), provider);
  }
  if (provider === 'custom') {
    if (!creds.url) return null;
    const res = await fetch(creds.url.replace('{number}', encodeURIComponent(e164)));
    return normalise(await res.json(), provider);
  }
  return null;
}

/** True when a key has been entered and lookups are switched on. */
export function lookupReady(settings) {
  if (!settings || settings.lookupOn !== true) return false;
  const creds = settings.lookupCreds || {};
  const provider = settings.lookupProvider || 'numverify';
  if (provider === 'twilio') return !!(creds.sid && creds.key);
  if (provider === 'custom') return !!creds.url;
  return !!creds.key;
}

/**
 * Looks a number up, answering from the cache when it can. Returns null
 * rather than throwing: a failed lookup should never interrupt a call.
 */
export async function lookupNumber(number, settings) {
  if (!number || !lookupReady(settings)) return null;
  const key = numberKey(number);
  const store = await readCache();
  const hit = store[key];
  if (hit && Date.now() - hit.at < TTL_MS) return hit.result;

  let result = null;
  try {
    result = await request(number, settings);
  } catch {
    return hit ? hit.result : null; // offline: a stale answer beats none
  }
  store[key] = { at: Date.now(), result };
  cache = store;
  save(CACHE_KEY, store);
  return result;
}

/** The cached answer only — safe to call while rendering. */
export function cachedLookup(number) {
  if (!number || !cache) return null;
  const hit = cache[numberKey(number)];
  return hit ? hit.result : null;
}

/** Warms the cache so a later render has something to show. */
export function primeCache() {
  readCache().catch(() => {});
}
