const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function load(file, names) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8').replace(/export /g, '');
  const ctx = { require: (asset) => asset };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.api = {' + names.join(',') + '};', ctx);
  return ctx.api;
}
const { callAppearance } = load('callAppearance.js', ['callAppearance']);
const { WALLPAPERS, getCallWallpaperSource, getAppWallpaperSource, appBackgroundId, callBackgroundId } = load('wallpapers.js', ['WALLPAPERS', 'getCallWallpaperSource', 'getAppWallpaperSource', 'appBackgroundId', 'callBackgroundId']);
const choices = ['pastel', 'plain', 'auto', ...WALLPAPERS.map(w => 'wallpaper:' + w.id), 'aurora', 'midnight'];
test('all dark call backgrounds stay black even with a saved wallpaper selection', () => {
  for (const choice of choices) {
    const look = callAppearance({ dark: true, backdropBase: '#123456', text: '#fff' }, choice);
    assert.equal(look.plain, true, choice);
    assert.equal(look.background, '#000000', choice);
    assert.equal(getCallWallpaperSource({ callBackground: choice }, true), null, choice);
  }
});
test('light mode provides four wallpapers, Rosewater default and legacy plain white', () => {
  assert.equal(WALLPAPERS.length, 4);
  for (const w of WALLPAPERS) {
    assert.equal(getCallWallpaperSource({ callBackground: 'wallpaper:' + w.id }, false), w.source);
    assert.equal(callAppearance({ dark: false }, 'wallpaper:' + w.id).plain, false);
  }
  assert.equal(getCallWallpaperSource({ callBackground: 'pastel' }, false), getAppWallpaperSource(false));
  assert.equal(getCallWallpaperSource({ callBackground: 'plain' }, false), null);
  assert.equal(callAppearance({ dark: false }, 'plain').background, '#FFFFFF');
});

test('app and call selections stay independent, and follow-app uses the selected app image', () => {
  for (const app of WALLPAPERS) {
    assert.equal(getAppWallpaperSource(false, { appBackground: app.id }), app.source);
    assert.equal(getAppWallpaperSource(true, { appBackground: app.id }), null);
    assert.equal(getCallWallpaperSource({ callBackground: 'pastel', appBackground: app.id }, false), app.source);
    for (const call of WALLPAPERS) {
      assert.equal(getCallWallpaperSource({ callBackground: 'wallpaper:' + call.id, appBackground: app.id }, false), call.source);
    }
  }
});
test('removed wallpaper preferences migrate to an existing asset', () => {
  for (const old of ['pistachio', 'sage', 'sunrise', 'coral', 'cotton', 'bluebell', 'pearl', 'peach', 'garbage']) {
    assert.ok(WALLPAPERS.some(w => w.id === appBackgroundId(old)));
    const migrated = callBackgroundId('wallpaper:' + old);
    assert.ok(WALLPAPERS.some(w => migrated === 'wallpaper:' + w.id));
  }
});
