#!/usr/bin/env node
// Accepts an Expo-generated or merged release XML manifest. Fails if capture
// permissions disappear, are removed during merging, or are capped by SDK level.
const fs = require('fs');
const REQUIRED = ['android.permission.RECORD_AUDIO', 'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_MICROPHONE'];

function checkManifest(xml) {
  const tags = [...xml.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*>/g)].map((match) => match[0]);
  const errors = [];
  for (const permission of REQUIRED) {
    const matches = tags.filter((tag) => tag.includes(`android:name="${permission}"`) || tag.includes(`android:name='${permission}'`));
    if (!matches.length) errors.push(`Missing ${permission}`);
    else if (matches.some((tag) => /tools:node\s*=\s*["'](?:remove|removeAll)["']|android:maxSdkVersion\s*=/.test(tag))) errors.push(`Removed or SDK-capped ${permission}`);
  }
  if (/<uses-permission\b[^>]*tools:node\s*=\s*["']removeAll["']/.test(xml)) errors.push('Permission removal rule present');
  return errors;
}

module.exports = { checkManifest };
if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage: node scripts/check-recording-permissions.cjs PATH/AndroidManifest.xml'); process.exit(2); }
  let bad = false;
  for (const file of files) {
    const errors = checkManifest(fs.readFileSync(file, 'utf8'));
    if (errors.length) { bad = true; console.error(`${file}: ${errors.join('; ')}`); }
    else console.log(`${file}: microphone and recorder service permissions present and uncapped`);
  }
  if (bad) process.exitCode = 1;
}
