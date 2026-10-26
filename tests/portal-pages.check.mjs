import assert from 'node:assert/strict';
import fs from 'node:fs';
// Portal list and page folders must agree (live clean 2026-10-26): every listed page exists, every page folder is listed
// (arlet-test is an unlisted test page), and no page imports code from another page's folder.
const root = new URL('../', import.meta.url);
const cfg = JSON.parse(fs.readFileSync(new URL('configurators.json', root), 'utf8')).configurators;
const ids = cfg.map(c => c.id);
assert.equal(new Set(ids).size, ids.length, 'duplicate portal ids');
const dirs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && fs.existsSync(new URL(`${d.name}/app.js`, root))).map(d => d.name);
for (const c of cfg) { assert.equal(c.path, `${c.id}/`); assert(dirs.includes(c.id), `${c.id}: listed in configurators.json but the page folder is missing`); }
for (const d of dirs) if (d !== 'arlet-test') assert(ids.includes(d), `${d}: page folder is not listed in configurators.json`);
assert(ids.length >= 17, `only ${ids.length} pages listed`);
for (const d of dirs) for (const f of fs.readdirSync(new URL(`${d}/`, root)).filter(n => /\.(js|html|css)$/.test(n))) {
  const text = fs.readFileSync(new URL(`${d}/${f}`, root), 'utf8');
  for (const m of text.matchAll(/(?:from\s+|import\s*\(|src=|href=|url\()['"]?\.\.\/([A-Za-z0-9_-]+)\//g)) assert(['shared', 'assets'].includes(m[1]), `${d}/${f} references ../${m[1]}/`);
}
console.log(`Portal list: ${ids.length} pages listed, all present, no cross-page imports.`);
