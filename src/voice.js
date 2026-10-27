import { contactName, numberKey } from './phone';

/**
 * Turns a spoken phrase into an action.
 *
 * This is the grammar FunctionGemma would replace: the same job (words in,
 * structured call out), done with rules instead of a model. It runs instantly,
 * adds nothing to the app's size, and never invents a call — which matters
 * when the action is dialling someone. See understand() at the bottom for
 * where the model slots in.
 *
 * Every action is returned, never performed, so the caller decides what is
 * safe to do without asking.
 */

const WORD_DIGITS = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', double: 'x2', triple: 'x3',
};

const LABELS = ['mobile', 'home', 'work', 'main', 'office', 'cell'];

/** "zero two four double four" → "0244 4" */
function spokenDigits(words) {
  const out = [];
  let repeat = 1;
  for (const w of words) {
    const d = WORD_DIGITS[w];
    if (d === 'x2') { repeat = 2; continue; }
    if (d === 'x3') { repeat = 3; continue; }
    if (d !== undefined) {
      for (let i = 0; i < repeat; i++) out.push(d);
      repeat = 1;
      continue;
    }
    if (/^\d+$/.test(w)) {
      for (let i = 0; i < repeat; i++) out.push(w);
      repeat = 1;
      continue;
    }
    return null; // a word that isn't a digit: this isn't a spoken number
  }
  return out.length >= 3 ? out.join('') : null;
}

/** Best contact for a spoken name — exact first, then first name, then contains. */
export function matchContact(spoken, contacts) {
  const want = (spoken || '').trim().toLowerCase();
  if (!want || !contacts || !contacts.length) return null;
  const named = contacts.map((c) => ({ c, n: contactName(c).toLowerCase() }));

  const exact = named.find((x) => x.n === want);
  if (exact) return exact.c;

  const firstName = named.find((x) => x.n.split(/\s+/)[0] === want);
  if (firstName) return firstName.c;

  const starts = named.filter((x) => x.n.startsWith(want));
  if (starts.length === 1) return starts[0].c;

  const has = named.filter((x) => x.n.includes(want));
  if (has.length === 1) return has[0].c;

  // several matches: the one called most recently would need the call log, so
  // leave it ambiguous rather than dialling the wrong person
  return starts.length || has.length ? 'ambiguous' : null;
}

function numberFor(contact, label) {
  const phones = (contact && contact.phoneNumbers) || [];
  if (!phones.length) return null;
  if (label) {
    const want = label === 'cell' ? 'mobile' : label === 'office' ? 'work' : label;
    const hit = phones.find((p) => (p.label || '').toLowerCase().includes(want));
    if (hit) return hit;
  }
  return phones[0];
}

/**
 * Rule-based understanding. Returns one of:
 *   { action: 'call', number, label, contact }
 *   { action: 'dial', number }            — fill the keypad, don't call
 *   { action: 'redial' }
 *   { action: 'tab', tab }
 *   { action: 'search', query }
 *   { action: 'ambiguous', query }        — several contacts match
 *   { action: 'unknown', text }
 */
export function parseCommand(text, contacts) {
  const raw = (text || '').trim();
  if (!raw) return { action: 'unknown', text: raw };
  const lower = raw.toLowerCase().replace(/[.,!?]/g, '');
  const words = lower.split(/\s+/);

  if (/^(redial|call back|call again|repeat the last call)$/.test(lower)) return { action: 'redial' };

  for (const [tab, re] of [
    ['calls', /^(open |show |go to )?(calls|recents|call log|history)$/],
    ['contacts', /^(open |show |go to )?(contacts|address book|people)$/],
    ['keypad', /^(open |show |go to )?(keypad|dial ?pad|dialer)$/],
    ['search', /^(open |show |go to )?search$/],
  ]) {
    if (re.test(lower)) return { action: 'tab', tab };
  }

  const searching = lower.match(/^(?:search|find|look up) (?:for )?(.+)$/);
  if (searching) return { action: 'search', query: searching[1] };

  // "call …", "dial …", "ring …", "phone …"
  const m = lower.match(/^(call|dial|ring|phone) (.+)$/);
  if (!m) return { action: 'unknown', text: raw };
  let rest = m[2];
  const verb = m[1];

  // a trailing "on mobile" / "at work" picks the number
  let label = null;
  const onLabel = rest.match(new RegExp(`^(.*?)\\s+(?:on|at|using)\\s+(?:his |her |their |the )?(${LABELS.join('|')})(?:\\s+number)?$`));
  if (onLabel) {
    rest = onLabel[1].trim();
    label = onLabel[2];
  }

  // a spoken or literal number
  const digitsOnly = rest.replace(/[\s-]/g, '');
  if (/^\+?\d{3,}$/.test(digitsOnly)) {
    return verb === 'dial' ? { action: 'dial', number: digitsOnly } : { action: 'call', number: digitsOnly, label: null, contact: null };
  }
  const spoken = spokenDigits(rest.split(/\s+/));
  if (spoken) {
    return verb === 'dial' ? { action: 'dial', number: spoken } : { action: 'call', number: spoken, label: null, contact: null };
  }

  const found = matchContact(rest, contacts);
  if (found === 'ambiguous') return { action: 'ambiguous', query: rest };
  if (!found) return { action: 'unknown', text: raw };

  const phone = numberFor(found, label);
  if (!phone) return { action: 'unknown', text: raw };
  return { action: 'call', number: phone.number, label: phone.label || null, contact: found, name: contactName(found) };
}

/** A line describing what will happen, for the confirmation sheet. */
export function describe(cmd) {
  switch (cmd.action) {
    case 'call':
      return cmd.name ? `Call ${cmd.name}${cmd.label ? ` · ${cmd.label}` : ''}` : `Call ${cmd.number}`;
    case 'dial':
      return `Put ${cmd.number} on the keypad`;
    case 'redial':
      return 'Call the last number again';
    case 'tab':
      return `Open ${cmd.tab}`;
    case 'search':
      return `Search for ${cmd.query}`;
    case 'ambiguous':
      return `More than one contact matches "${cmd.query}"`;
    default:
      return `Didn't understand "${cmd.text}"`;
  }
}

/**
 * The seam for an on-device model.
 *
 * FunctionGemma does exactly this shape of work — a phrase in, a structured
 * call out — so when the weights are on the device, understand() asks it and
 * falls back to the grammar when it declines or the model isn't there. The
 * rules stay as the floor rather than being replaced, because a wrong call
 * placed confidently is worse than one not understood.
 */
export async function understand(text, contacts, model) {
  if (model && model.ready) {
    try {
      const guess = await model.call(text);
      if (guess && guess.action) return guess;
    } catch {
      // fall through to the rules
    }
  }
  return parseCommand(text, contacts);
}

export const commandExamples = [
  'Call Ella',
  'Call Ella on mobile',
  'Dial zero two four four one two three four',
  'Redial',
  'Open contacts',
  'Search for Mercy',
];
