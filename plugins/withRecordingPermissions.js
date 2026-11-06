// Run last: image/video plugins must not remove the native call recorder's permission.
const { withAndroidManifest } = require('expo/config-plugins');

const REQUIRED = [
  'android.permission.RECORD_AUDIO',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
];

function ensureRecordingPermissions(manifest) {
  // Replace stale tools:node="remove", duplicate entries and maxSdkVersion caps.
  const keep = (entry) => !REQUIRED.includes(entry.$?.['android:name']);
  manifest['uses-permission'] = (manifest['uses-permission'] || []).filter(keep);
  if (manifest['uses-permission-sdk-23']) manifest['uses-permission-sdk-23'] = manifest['uses-permission-sdk-23'].filter(keep);
  for (const permission of REQUIRED) manifest['uses-permission'].push({ $: { 'android:name': permission } });
  return manifest;
}

module.exports = function withRecordingPermissions(config) {
  config.android = config.android || {};
  config.android.blockedPermissions = (config.android.blockedPermissions || []).filter((permission) => !REQUIRED.includes(permission));
  config.android.permissions = [...new Set([...(config.android.permissions || []), ...REQUIRED])];
  return withAndroidManifest(config, (cfg) => {
    ensureRecordingPermissions(cfg.modResults.manifest);
    return cfg;
  });
};
module.exports.ensureRecordingPermissions = ensureRecordingPermissions;
