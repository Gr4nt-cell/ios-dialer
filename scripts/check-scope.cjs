#!/usr/bin/env node
/**
 * Catches the mistake that keeps reaching the phone: using a name the file
 * never imported.
 *
 * A missing import is invisible until the screen renders — the bundler is
 * happy, the build is green, and the app shows "Property 'X' doesn't exist"
 * on the one screen that uses it. This walks every source file, collects the
 * names it imports or declares, and reports any capitalised or known-exported
 * name it uses but never obtained.
 *
 *   node scripts/check-scope.js        # exits non-zero if anything is missing
 */
const fs = require('fs');
const path = require('path');

const ROOTS = ['src', 'src/screens', 'src/components', 'src/i18n', '.'];
const GLOBALS = new Set([
  'React', 'Promise', 'Date', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Error', 'Set', 'Map', 'RegExp', 'Intl', 'console', 'global', 'fetch', 'setTimeout',
  'clearTimeout', 'setInterval', 'clearInterval', 'require', 'module', 'exports', 'process',
  'Infinity', 'NaN', 'undefined', 'AbortController', 'URL', 'TextEncoder', 'Symbol', 'BigInt',
  'WeakMap', 'WeakSet', 'Proxy', 'Reflect', 'ArrayBuffer', 'Uint8Array', 'Float32Array',
]);

function sourceFiles() {
  const out = [];
  for (const dir of ROOTS) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const f = path.join(dir, name);
      if (!name.endsWith('.js')) continue;
      if (fs.statSync(f).isDirectory()) continue;
      if (f.startsWith('node_modules') || f.startsWith('scripts' + path.sep)) continue;
      out.push(f);
    }
  }
  return [...new Set(out)];
}

/** Names the file brings in or defines for itself. */
function declared(src) {
  const names = new Set();
  for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+'[^']+';/g)) {
    const clause = m[1];
    for (const part of clause.replace(/[{}]/g, ',').split(',')) {
      const token = part.trim().split(/\s+as\s+/).pop().replace('*', '').trim();
      if (token) names.add(token);
    }
  }
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) names.add(m[1]);
  // destructuring, parameters and locals anywhere in the file
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const token = part.trim().split(':').pop().split('=')[0].trim();
      if (token) names.add(token);
    }
  }
  for (const m of src.matchAll(/(?:const|let|var)\s*\[([^\]]*)\]\s*=/g)) {
    for (const part of m[1].split(',')) {
      const token = part.trim().split('=')[0].trim();
      if (token) names.add(token);
    }
  }
  for (const m of src.matchAll(/function\s*[A-Za-z0-9_$]*\s*\(([^)]*)\)/g)) {
    for (const part of m[1].split(',')) {
      const token = part.trim().split(/[:=]/)[0].replace(/[{}[\].]/g, ' ').trim();
      token.split(/\s+/).forEach((t) => t && names.add(t));
    }
  }
  for (const m of src.matchAll(/\(([^)]*)\)\s*=>/g)) {
    for (const part of m[1].split(',')) {
      const token = part.trim().split(/[:=]/)[0].replace(/[{}[\].]/g, ' ').trim();
      token.split(/\s+/).forEach((t) => t && names.add(t));
    }
  }
  for (const m of src.matchAll(/([A-Za-z0-9_$]+)\s*=>/g)) names.add(m[1]);
  for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  return names;
}

/** Everything each module exports, so a used name can be traced to its home. */
function exportMap(files) {
  const map = new Map();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const token = part.trim().split(/\s+as\s+/).pop().trim();
        if (token) names.add(token);
      }
    }
    map.set(f, names);
  }
  return map;
}

const files = sourceFiles();
const exported = exportMap(files);
const exportedSomewhere = new Map();
for (const [f, names] of exported) for (const n of names) if (!exportedSomewhere.has(n)) exportedSomewhere.set(n, f);

let problems = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const have = declared(src);
  const used = new Set();

  // JSX components and bare identifier reads that look like module-level names
  for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_$]*)/g)) used.add(m[1]);
  for (const m of src.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)) used.add(m[1]); // SHOUTY constants
  for (const name of exportedSomewhere.keys()) {
    if (new RegExp(`(^|[^.\\w'"\`])${name}\\s*\\(`).test(src)) used.add(name);
  }

  for (const name of used) {
    if (have.has(name) || GLOBALS.has(name)) continue;
    if (!exportedSomewhere.has(name)) continue; // not ours: a local or a global we don't track
    problems++;
    console.log(`${f}: uses "${name}" but never imports it (exported by ${exportedSomewhere.get(name)})`);
  }
}

console.log(problems ? `\n${problems} missing import(s)` : 'scope: every used name is imported');
process.exit(problems ? 1 : 0);
