const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('Settings sits between Keypad and Search in the phone dock', () => {
  const tabs = read('src/components/TabBar.js');
  const keys = [...tabs.matchAll(/\{ key: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(keys.slice(0, 5), ['calls', 'contacts', 'keypad', 'settings', 'search']);
});

test('Settings opens as a main tab without the keypad header shortcut', () => {
  const app = read('App.js');
  const keypad = read('src/screens/KeypadScreen.js');
  const settings = read('src/screens/SettingsScreen.js');
  assert.match(app, /case 'settings':\s*screen = <SettingsScreen inTab \/>;/);
  assert.match(app, /const TABLET_TABS = UNIFIED_TABS\.filter\(\(tab\) => tab\.key !== 'settings'\)/);
  assert.doesNotMatch(keypad, /settings-outline/);
  assert.match(settings, /right=\{inTab \? null : <IconButton/);
  assert.match(settings, /inTab \? tabBarSpace \+ 24 : 40/);
});
