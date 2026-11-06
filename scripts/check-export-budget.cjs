#!/usr/bin/env node
// Validate actual Metro output so broad icon imports cannot silently bloat APKs again.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || 'dist');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8'));
const android = metadata.fileMetadata?.android;
if (!android) throw new Error('An Android Expo export is required.');
const assets = android.assets || [];
const bytes = asset => fs.statSync(path.join(root, asset.path)).size;
const fonts = assets.filter(asset => asset.ext === 'ttf');
const images = assets.filter(asset => asset.ext === 'webp');
const fontBytes = fonts.reduce((sum, asset) => sum + bytes(asset), 0);
const assetBytes = assets.reduce((sum, asset) => sum + bytes(asset), 0);
const imageBytes = images.reduce((sum, asset) => sum + bytes(asset), 0);
function folderBytes(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
    const file = path.join(dir, entry.name);
    return sum + (entry.isDirectory() ? folderBytes(file) : fs.statSync(file).size);
  }, 0);
}
const speechBytes = folderBytes(path.join(__dirname, '../modules/dialer/android/src/main/assets/caller-speech-en-v2'));
const failures = [];
if (speechBytes > 25000000) failures.push(`Caller speech data is ${speechBytes} bytes (budget: 25 MB); check for unused language dictionaries.`);
if (fonts.length > 2 || fontBytes > 500000) failures.push(`Unused font families may be bundled: ${fonts.length} fonts, ${fontBytes} bytes (budget: 2 / 500 KB).`);
if (images.length !== 4 || imageBytes > 100000) failures.push(`Expected four compact shared backgrounds: ${images.length} WebP files, ${imageBytes} bytes (budget: 100 KB).`);
if (assetBytes > 800000) failures.push(`Metro asset payload is ${assetBytes} bytes (budget: 800 KB).`);
console.log(`Android Metro assets: ${assetBytes} bytes; fonts: ${fonts.length} / ${fontBytes} bytes; backgrounds: ${images.length} / ${imageBytes} bytes; native speech: ${speechBytes} bytes.`);
if (failures.length) { failures.forEach(message => console.error(message)); process.exitCode = 1; }
