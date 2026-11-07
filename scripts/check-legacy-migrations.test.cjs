const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('legacy recording cleanup is one-time, limited to recordings, and retries on failure', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'modules/dialer/android/src/main/java/expo/modules/dialer/DialerModule.kt'),
    'utf8',
  );
  const start = source.indexOf('// Remove recordings left by versions that included the call recorder.');
  const end = source.indexOf('// Remove cached voice models', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const migration = source.slice(start, end);
  assert.match(migration, /getBoolean\("legacy_call_recordings_removed_v1", false\)/);
  assert.match(migration, /app\.filesDir\.resolve\("recordings"\)/);
  assert.match(migration, /!legacyRecordings\.exists\(\) \|\| legacyRecordings\.deleteRecursively\(\)/);
  assert.match(migration, /Could not remove legacy call recordings; will retry on next launch/);
  assert.doesNotMatch(migration, /cacheDir|deleteEverything|filesDir\.deleteRecursively/);
});
