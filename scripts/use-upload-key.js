#!/usr/bin/env node
/**
 * Points the Android release build at the upload keystore.
 *
 * `expo prebuild` regenerates android/ on every CI run and wires the release
 * build to the *debug* keystore, so this runs after prebuild and rewrites that
 * one decision. It reads the key from the environment, so nothing secret ever
 * lands in a file.
 *
 * It fails loudly if the generated build.gradle doesn't look the way it
 * expects — a silently debug-signed bundle is worse than no bundle, because
 * Play only rejects it after upload.
 */
const fs = require('fs');

const path = 'android/app/build.gradle';
const die = (msg) => {
  console.error(`use-upload-key: ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(path)) die(`${path} not found — run expo prebuild first`);
let gradle = fs.readFileSync(path, 'utf8');

if (gradle.includes('signingConfigs.release')) die('build.gradle already has a release signing config');
if (!/signingConfigs\s*\{/.test(gradle)) die('no signingConfigs block in build.gradle');

// 1. declare the release key, read from the environment at build time
gradle = gradle.replace(
  /signingConfigs\s*\{/,
  `signingConfigs {
        release {
            storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS")
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }`
);

// 2. make the release build type use it instead of the debug key
const before = gradle;
gradle = gradle.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
  '$1signingConfig signingConfigs.release'
);
if (gradle === before) die('could not find "signingConfig signingConfigs.debug" inside the release build type');

fs.writeFileSync(path, gradle);

// 3. prove it took
const check = fs.readFileSync(path, 'utf8');
const releaseBlock = check.match(/buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?\n\s{8}\}/);
if (!releaseBlock || !releaseBlock[0].includes('signingConfigs.release')) die('release build type still is not using the upload key');
console.log('use-upload-key: release build type now signs with signingConfigs.release');
