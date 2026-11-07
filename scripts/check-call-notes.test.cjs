const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('call screen offers a note action and native Android supports note apps plus sharing fallback', () => {
  const screen = read('src/screens/CallScreen.js');
  const native = read('modules/dialer/android/src/main/java/expo/modules/dialer/DialerModule.kt');
  assert.match(screen, /icon="reader-outline" label=\{tr\('Note'\)\} onPress=\{openCallNote\}/);
  assert.match(screen, /Dialer\?\.openNotes\?\.\(title, text\)/);
  assert.match(native, /Intent\("android\.intent\.action\.CREATE_NOTE"\)/);
  assert.match(native, /Intent\.ACTION_SEND/);
  assert.match(native, /Intent\.createChooser\(shareText, "Choose a notes app"\)/);
});
