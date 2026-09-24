// ============================================================================
// BUILD: bundle every module, the stylesheet and the shell into ONE .html file
// that runs from the local filesystem — double-clicked on a Mac, or opened from
// Files / Safari on an iPad. No server, no modules, no network.
// ============================================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const OUT = join(root, 'riftgate.html');

// Dependency order. ES modules are hoisted, but classes and `const` are not, so
// the order has to be a real topological sort of the imports.
const MODULES = [
  'rng', 'occupancy', 'icons', 'chart', 'data', 'elements', 'prestige', 'classes', 'items', 'names', 'overworld', 'npc', 'farming', 'husbandry', 'monsters', 'biomes', 'magic', 'combat', 'sprites', 'iconsheet', 'pixicons',
  'world', 'colony', 'social', 'dungeon', 'expedition', 'realtime', 'events', 'economy', 'floors',
  'game', 'autoplay', 'save', 'render', 'tips', 'ui',
];

function strip(src, name) {
  // Imports are deleted, not rewritten, so an alias ("A as B") would leave B
  // undefined in the bundle. Refuse to build rather than ship that.
  const alias = src.match(/^\s*import\s*\{[^}]*\bas\b[^}]*\}/m);
  if (alias) { console.error(`\x1b[31mAliased import in ${name}.js is not supported by the bundler: ${alias[0].trim()}\x1b[0m`); process.exit(1); }
  let s = src;
  // Remove import statements entirely (single and multi-line).
  s = s.replace(/^\s*import\s+[^;]*?from\s*['"][^'"]+['"]\s*;?\s*$/gms, '');
  s = s.replace(/^\s*import\s*['"][^'"]+['"]\s*;?\s*$/gm, '');
  // Remove bare re-export statements: export { a, b };  /  export { a } from '...'
  s = s.replace(/^\s*export\s*\{[^}]*\}\s*(from\s*['"][^'"]+['"])?\s*;?\s*$/gms, '');
  // Turn declaration exports into plain declarations.
  s = s.replace(/^\s*export\s+(async\s+)?function\b/gm, '$1function');
  s = s.replace(/^\s*export\s+(const|let|var|class)\b/gm, '$1');
  s = s.replace(/^\s*export\s+default\s+/gm, 'var __default_' + name + ' = ');
  return s;
}

// Collect top-level declarations so a name collision fails the build loudly
// instead of producing a subtly broken bundle.
function topLevelNames(src) {
  const names = new Set();
  const re = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

const seen = new Map();
const parts = [];
for (const name of MODULES) {
  const raw = readFileSync(join(root, 'src', `${name}.js`), 'utf8');
  const code = strip(raw, name);
  for (const n of topLevelNames(code)) {
    if (seen.has(n)) {
      console.error(`\x1b[31mName collision: "${n}" declared in both ${seen.get(n)}.js and ${name}.js\x1b[0m`);
      process.exit(1);
    }
    seen.set(n, name);
  }
  parts.push(`\n/* ===== src/${name}.js ===== */\n${code.trim()}\n`);
}

const css = readFileSync(join(root, 'style.css'), 'utf8');
const shell = readFileSync(join(root, 'index.html'), 'utf8');

// Reuse the real shell's markup so the build cannot drift from the dev page.
const bodyMatch = shell.match(/<div id="app">[\s\S]*?<\/div>\s*<script/);
if (!bodyMatch) { console.error('Could not extract #app markup from index.html'); process.exit(1); }
const appMarkup = bodyMatch[0].replace(/<script$/, '').trim();

const bundle = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1,user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#0a0b0f">
<meta name="color-scheme" content="dark">
<title>Rift Gate — SSS Class Dungeon Colony Sim</title>
<style>
${css}
</style>
</head>
<body>
${appMarkup}
<script>
"use strict";
(function(){
${parts.join('\n')}

/* ===== boot ===== */
try {
  var params = new URLSearchParams(location.search);
  window.ui = new UI(params.get('seed') || undefined);
} catch (err) {
  document.body.innerHTML = '<pre style="padding:20px;color:#e07a4a;white-space:pre-wrap;font:12px ui-monospace,monospace">'
    + 'Rift Gate failed to start:\\n\\n' + (err && err.stack ? err.stack : err) + '</pre>';
  throw err;
}
})();
</script>
</body>
</html>
`;

writeFileSync(OUT, bundle);
const kb = (Buffer.byteLength(bundle) / 1024).toFixed(0);
console.log(`\x1b[32m✓\x1b[0m built ${OUT}  (${kb} KB, ${MODULES.length} modules, ${seen.size} top-level symbols)`);
