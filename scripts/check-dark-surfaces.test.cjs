const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('dark cards and glass surfaces are black; keyboard keys retain their contrast', () => {
  const theme = read('src/theme.js');
  const darkTheme = theme.match(/const dark = \{([\s\S]*?)\n\};/);
  assert.ok(darkTheme, 'dark theme is present');
  for (const property of ['card', 'fill', 'avatar', 'glass']) {
    assert.match(darkTheme[1], new RegExp(`${property}: (?:'#000000'|\\['#000000', '#000000'\\])`));
  }
  assert.match(darkTheme[1], /key: 'rgba\(70,70,76,0\.4\)'/);
  assert.match(darkTheme[1], /keyPressed: 'rgba\(140,140,150,0\.55\)'/);
});

test('glass, call controls and call pickers do not introduce charcoal panels', () => {
  const glass = read('src/components/Glass.js');
  const controls = read('src/components/ReferenceCallControls.js');
  const picker = read('src/components/CallPicker.js');
  assert.match(glass, /dark \? `rgba\(0,0,0,\$\{a\}\)`/);
  assert.doesNotMatch(glass, /rgba\((?:38,41,47|39,42,48),/);
  assert.match(controls, /t\.dark \? '#000000'/);
  assert.match(picker, /blurProps && !t\.dark/);
  assert.match(picker, /t\.dark \? 'rgba\(0,0,0,0\.45\)'/);
});
