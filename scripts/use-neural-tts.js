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
 *
 * With --abi=<list> it also limits the native libraries to those
 * architectures. The runtime carries four, which is right for a bundle (Play
 * hands each phone only its own) but wasteful in a single APK, where all four
 * ride along and most of the download is libraries the phone can't run.
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
// --abi: keep only these architectures in an APK build.
//
// Not defaultConfig.ndk.abiFilters: React Native's own build.gradle already
// writes an abiFilters line, so anything keying off "is abiFilters present"
// silently does nothing — which is exactly what happened the first time. A
// packaging exclude is unambiguous and drops the libraries at packaging time,
// whatever else set them.
const abiArg = process.argv.find((a) => a.startsWith('--abi='));
if (abiArg) {
  const keep = abiArg.slice('--abi='.length).split(',').map((a) => a.trim()).filter(Boolean);
  const ALL = ['armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'];
  const drop = ALL.filter((a) => !keep.includes(a));
  const APP = 'android/app/build.gradle';
  if (!fs.existsSync(APP)) die(`${APP} not found`);
  let app = fs.readFileSync(APP, 'utf8');
  if (app.includes('// bundled-voice abi trim')) {
    console.log('use-neural-tts: abi trim already applied');
  } else if (!drop.length) {
    console.log('use-neural-tts: nothing to trim');
  } else {
    const anchor = app.match(/android\s*\{/);
    if (!anchor) die('no android block in app/build.gradle');
    const excludes = drop.map((a) => `            excludes += "lib/${a}/*"`).join('\n');
    const block = [
      '',
      '    // bundled-voice abi trim',
      '    packaging {',
      '        jniLibs {',
      excludes,
      '        }',
      '    }',
    ].join('\n');
    app = app.slice(0, anchor.index + anchor[0].length) + block + app.slice(anchor.index + anchor[0].length);
    fs.writeFileSync(APP, app);
    console.log(`use-neural-tts: packaging drops ${drop.join(', ')}; keeping ${keep.join(', ')}`);
  }
}

const aar = 'android/local-maven/com/k2fsa/sherpa-onnx/1.13.7/sherpa-onnx-1.13.7.aar';
if (!fs.existsSync(aar)) die(`${aar} is missing — did scripts/fetch-voices.sh run?`);
console.log(`use-neural-tts: runtime present (${Math.round(fs.statSync(aar).size / 1048576)}MB)`);
