#!/usr/bin/env node
/*
 * Google Play readiness check, run by CI after every release build.
 *
 * Checks the built app against the requirements Play Console flags, so a regression shows up in
 * the build instead of weeks later in the Console:
 *
 *   FAIL  target SDK below Play's current minimum
 *   FAIL  code obfuscation below 25% (Play: "DEX code optimisation is below our threshold")
 *   FAIL  a fixed screen orientation / non-resizable activity (Android 16 large screens)
 *   FAIL  versionCode not set above 1
 *   WARN  target SDK below the next yearly Play requirement
 *   WARN  advertising ID permission present (needs a Play declaration)
 *   WARN  INTERNET permission present (the app's privacy policy says it has none)
 *   INFO  deprecated edge-to-edge window APIs referenced (usually from React Native / AndroidX)
 *
 * Usage: node scripts/play-check.js <android project dir>   (after assembleRelease/bundleRelease)
 * Reusable for other Expo / React Native apps: copy this file and the CI step.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MIN_TARGET_SDK = 35; // Play requirement for new apps and updates since Aug 2025
const NEXT_TARGET_SDK = 36; // expected yearly bump (Aug 2026)
const MIN_OBFUSCATION = 25; // percent

const root = path.resolve(process.argv[2] || 'android');
const results = [];
const add = (level, msg) => results.push({ level, msg });

function find(dir, test, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) find(p, test, out);
    else if (test(p)) out.push(p);
  }
  return out;
}

const build = path.join(root, 'app', 'build');

// ---------- merged release manifest ----------
const manifests = find(path.join(build, 'intermediates'), (p) => /merged_manifests?[\\/].*release.*[\\/]AndroidManifest\.xml$/i.test(p));
const manifestPath = manifests.sort((a, b) => a.length - b.length)[0];
if (!manifestPath) {
  add('FAIL', 'merged release AndroidManifest.xml not found — run this after the release build');
} else {
  const m = fs.readFileSync(manifestPath, 'utf8');

  const target = Number((m.match(/android:targetSdkVersion="(\d+)"/) || [])[1] || 0);
  const versionCode = Number((m.match(/android:versionCode="(\d+)"/) || [])[1] || 0);
  const versionName = (m.match(/android:versionName="([^"]+)"/) || [])[1] || '?';
  if (!target) add('WARN', 'targetSdkVersion not found in the merged manifest');
  else if (target < MIN_TARGET_SDK) add('FAIL', `targetSdkVersion ${target} is below Play's minimum ${MIN_TARGET_SDK}`);
  else if (target < NEXT_TARGET_SDK) add('WARN', `targetSdkVersion ${target}; Play will require ${NEXT_TARGET_SDK} for updates soon`);
  else add('PASS', `targetSdkVersion ${target}`);

  if (versionCode <= 1) add('FAIL', `versionCode is ${versionCode}; it must go up with every Play upload`);
  else add('PASS', `version ${versionName} (versionCode ${versionCode})`);

  const fixed = [...m.matchAll(/<activity\b[^>]*?android:name="([^"]+)"[^>]*?android:screenOrientation="([^"]+)"/g)]
    .concat([...m.matchAll(/<activity\b[^>]*?android:screenOrientation="([^"]+)"[^>]*?android:name="([^"]+)"/g)].map((x) => [x[0], x[2], x[1]]))
    .filter(([, , o]) => !['unspecified', 'user', 'fullUser', 'fullSensor', 'sensor', 'behind', 'nosensor'].includes(o));
  const own = fixed.filter(([, name]) => !/^(com\.google|androidx|com\.facebook\.react\.devsupport)/.test(name));
  if (own.length) add('FAIL', 'fixed orientation on: ' + own.map(([, n, o]) => `${n} (${o})`).join(', '));
  else add('PASS', 'no fixed screen orientation on the app’s activities');
  if (/android:resizeableActivity="false"/.test(m)) add('FAIL', 'resizeableActivity="false" — large screens will ignore it');
  if (/android:maxAspectRatio=/.test(m) || /android:minAspectRatio=/.test(m)) add('WARN', 'aspect-ratio restrictions declared');

  if (/com\.google\.android\.gms\.permission\.AD_ID/.test(m)) add('WARN', 'AD_ID permission present — the Play advertising-ID declaration must say Yes');
  else add('PASS', 'no advertising ID permission');
  const internet = /<uses-permission[^>]+android\.permission\.INTERNET"(?![^>]*tools:node="remove")/.test(m);
  if (internet) add('WARN', 'INTERNET permission present — the privacy policy says the app has no internet access');
  else add('PASS', 'no INTERNET permission');
}

// ---------- obfuscation, from R8's mapping file ----------
const mapping = find(path.join(build, 'outputs', 'mapping'), (p) => /release[\\/]mapping\.txt$/.test(p))[0];
if (!mapping) {
  add('FAIL', 'no R8 mapping.txt — release minification (R8) is not running');
} else {
  let total = 0;
  let renamed = 0;
  for (const line of fs.readFileSync(mapping, 'utf8').split('\n')) {
    const mm = /^(\S+) -> (\S+):$/.exec(line);
    if (!mm) continue;
    total++;
    if (mm[1] !== mm[2]) renamed++;
  }
  const pct = total ? Math.round((renamed / total) * 1000) / 10 : 0;
  if (pct < MIN_OBFUSCATION) add('FAIL', `obfuscation ${pct}% of ${total} classes (Play threshold ${MIN_OBFUSCATION}%)`);
  else add('PASS', `obfuscation ${pct}% of ${total} classes (Play threshold ${MIN_OBFUSCATION}%)`);
}

// ---------- deprecated edge-to-edge APIs (informational) ----------
const artifacts = find(path.join(build, 'outputs'), (p) => /\.(apk|aab)$/.test(p));
if (artifacts[0]) {
  try {
    const list = execSync(`unzip -Z1 "${artifacts[0]}"`).toString().split('\n').filter((n) => /\.dex$/.test(n));
    const names = ['setStatusBarColor', 'setNavigationBarColor', 'setNavigationBarDividerColor', 'getStatusBarColor', 'getNavigationBarColor'];
    const seen = new Set();
    for (const n of list) {
      const buf = execSync(`unzip -p "${artifacts[0]}" "${n}"`, { maxBuffer: 1 << 30 });
      for (const k of names) if (buf.includes(Buffer.from(k))) seen.add(k);
    }
    if (seen.size) add('INFO', `deprecated edge-to-edge calls referenced (from React Native / AndroidX, advisory in Play): ${[...seen].join(', ')}`);
    else add('PASS', 'no deprecated edge-to-edge window calls');
  } catch {
    add('INFO', 'could not scan the dex files for edge-to-edge calls');
  }
}

// ---------- report ----------
const icon = { PASS: '✅', WARN: '⚠️', FAIL: '❌', INFO: 'ℹ️' };
const lines = results.map((r) => `${icon[r.level]} ${r.level}  ${r.msg}`);
console.log('Google Play readiness\n' + lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Google Play readiness\n\n' + results.map((r) => `- ${icon[r.level]} **${r.level}** ${r.msg}`).join('\n') + '\n');
}
fs.writeFileSync(path.join(root, '..', 'play-check.txt'), 'Google Play readiness\n' + lines.join('\n') + '\n');
if (results.some((r) => r.level === 'FAIL')) {
  console.error('\nPlay readiness check failed — fix the FAIL items above before uploading.');
  process.exit(1);
}
