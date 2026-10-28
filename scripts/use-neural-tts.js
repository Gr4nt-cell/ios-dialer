#!/usr/bin/env node
/**
 * Points Gradle at the speech runtime that fetch-voices.sh downloaded.
 *
 * The runtime sits in android/local-maven as a Maven module. Where it gets
 * declared depends on the template: React Native's settings.gradle usually
 * locks repositories with FAIL_ON_PROJECT_REPOS, which makes a repositories
 * block inside a module an error rather than an addition. So the repository
 * goes into settings.gradle when that block exists, and into allprojects
 * otherwise.
 *
 * Run after `expo prebuild` and after fetch-voices.sh.
 */
const fs = require('fs');

const SETTINGS = 'android/settings.gradle';
const BUILD = 'android/build.gradle';
const REPO = `        maven { url("\${rootDir}/local-maven") } // bundled speech runtime`;

const die = (msg) => {
  console.error(`use-neural-tts: ${msg}`);
  process.exit(1);
};

if (!fs.existsSync(SETTINGS)) die(`${SETTINGS} not found — run expo prebuild first`);

let settings = fs.readFileSync(SETTINGS, 'utf8');

if (settings.includes('local-maven')) {
  console.log('use-neural-tts: already wired');
  process.exit(0);
}

// 1. the modern layout: dependencyResolutionManagement { repositories { … } }
const drm = settings.match(/dependencyResolutionManagement\s*\{[\s\S]*?repositories\s*\{/);
if (drm) {
  settings = settings.slice(0, drm.index + drm[0].length) + '\n' + REPO + settings.slice(drm.index + drm[0].length);
  fs.writeFileSync(SETTINGS, settings);
  console.log('use-neural-tts: repository added to settings.gradle');
} else {
  // 2. the older layout: every project resolves for itself
  if (!fs.existsSync(BUILD)) die(`${BUILD} not found`);
  let build = fs.readFileSync(BUILD, 'utf8');
  if (!build.includes('local-maven')) {
    build += `\n\nallprojects {\n    repositories {\n${REPO}\n    }\n}\n`;
    fs.writeFileSync(BUILD, build);
  }
  console.log('use-neural-tts: repository added to android/build.gradle');
}

// prove the artifact is actually there, so a build fails here with a clear
// message rather than deep inside dependency resolution
const aar = 'android/local-maven/com/k2fsa/sherpa-onnx/1.13.7/sherpa-onnx-1.13.7.aar';
if (!fs.existsSync(aar)) die(`${aar} is missing — did scripts/fetch-voices.sh run?`);
console.log(`use-neural-tts: runtime present (${Math.round(fs.statSync(aar).size / 1048576)}MB)`);
