const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { checkManifest } = require('./check-recording-permissions.cjs');
const required = ['android.permission.RECORD_AUDIO', 'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_MICROPHONE'];
const good = `<manifest>${required.map((name) => `<uses-permission android:name="${name}" />`).join('')}</manifest>`;

test('release configuration does not suppress microphone capture', () => {
  const config = require('../app.json').expo;
  assert.equal(config.plugins.at(-1), './plugins/withRecordingPermissions');
  for (const entry of config.plugins) if (Array.isArray(entry) && ['expo-image-picker', 'expo-audio'].includes(entry[0])) assert.notEqual(entry[1].microphonePermission, false);
  assert.ok(config.android.permissions.includes(required[0]));
  assert.ok(!(config.android.blockedPermissions || []).includes(required[0]));
});

test('guard accepts uncapped permissions and rejects missing, removed or SDK-capped declarations', () => {
  assert.deepEqual(checkManifest(good), []);
  assert.ok(checkManifest(good.replace(`<uses-permission android:name="${required[0]}" />`, '')).some((error) => error.includes(required[0])));
  for (const attr of ['tools:node="remove"', 'android:maxSdkVersion="28"']) assert.ok(checkManifest(good.replace(`android:name="${required[0]}"`, `android:name="${required[0]}" ${attr}`)).length);
  assert.ok(checkManifest(good+`<uses-permission tools:node="removeAll" />`).length);
  assert.ok(checkManifest(good.replace(`<uses-permission android:name="${required[0]}" />`, `<!-- <uses-permission android:name="${required[0]}" /> -->`)).length);
});

test('final plugin repairs stale remove directives and is idempotent without unblocking Internet', () => {
  const manifest = { 'uses-permission': [
    { $: { 'android:name': required[0], 'tools:node': 'remove', 'android:maxSdkVersion': '28' } },
    { $: { 'android:name': required[0] } },
    { $: { 'android:name': 'android.permission.CAMERA' } },
  ], 'uses-permission-sdk-23': [{ $: { 'android:name': required[0], 'tools:node': 'remove' } }] };
  const context = { module: { exports: {} }, require: (name) => {
    assert.equal(name, 'expo/config-plugins');
    return { withAndroidManifest: (cfg, mod) => mod({ ...cfg, modResults: { manifest } }) };
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../plugins/withRecordingPermissions.js'), 'utf8'), context);
  const plugin = context.module.exports;
  const config = { android: { blockedPermissions: [required[0], 'android.permission.INTERNET'], permissions: [] } };
  plugin(config); plugin(config);
  assert.deepEqual(Array.from(config.android.blockedPermissions), ['android.permission.INTERNET']);
  for (const name of required) {
    const entries = manifest['uses-permission'].filter((entry) => entry.$['android:name'] === name);
    assert.equal(entries.length, 1);
    assert.deepEqual(Object.keys(entries[0].$), ['android:name']);
  }
  assert.equal(manifest['uses-permission-sdk-23'].length, 0);
  assert.ok(manifest['uses-permission'].some((entry) => entry.$['android:name'] === 'android.permission.CAMERA'));
});
