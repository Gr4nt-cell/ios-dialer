const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('dark decorative shading is limited to keypad keys and the keypad dock state', () => {
  const glass = read('src/components/Glass.js');
  const dock = read('src/components/TabBar.js');
  const contacts = read('src/components/ContactCard.js');

  assert.match(glass, /allowDarkShading = false/);
  assert.match(glass, /export const KeypadScreenShadingContext = createContext\(false\)/);
  assert.match(glass, /const showShading = !dark \|\| allowDarkShading \|\| inKeypadScreen/);
  assert.match(glass, /budget\.compact && showShading \? <Image source=\{require\('\.\.\/\.\.\/assets\/glass\/static-sheen\.png'\)\}/);
  assert.match(glass, /<Glass \{\.\.\.props\} allowDarkShading soft/);
  assert.match(read('src/screens/KeypadScreen.js'), /<KeypadScreenShadingContext\.Provider value=\{true\}>/);
  assert.equal((dock.match(/allowDarkShading=\{active === 'keypad'\}/g) || []).length, 2);
  assert.match(contacts, /!performanceMode && !keypadMaterial && !t\.dark/);
});

test('dark glass edges receive a stronger outer shadow and rim', () => {
  const glass = read('src/components/Glass.js');
  const theme = read('src/theme.js');
  assert.match(glass, /function darkEdgeShadow/);
  assert.match(glass, /rgba\(220,238,255,0\.38\)/);
  assert.match(theme, /glassBorder: 'rgba\(220,238,255,0\.22\)'/);
});
