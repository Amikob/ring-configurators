#!/usr/bin/env node
// Repoint a ring-configurator page at the files of a NEW iJewel configurator.
//
//   node tools/cfg-migrate/repoint.mjs <configuratorId> <pageFolder> [<pageFolder> ...] [options]
//
// Fetches https://amikob.ijewel3d.com/api/raw/v1/files/view/<id>?select=config (browser UA), then, in every
// <pageFolder>/project.json and <pageFolder>/saved-config.json, swaps each RingConfigurator variation's
// modelUrl, icon and fileId for the new configurator's variation with the same name stem
// (e.g. 3_ct_oval_5333fabb31.glb  <->  3_ct_oval_b0c87b8629.glb, "3_ct_oval.glb").
// Everything else (materials, scene, HDRI, camera, title, top-level modelUrl) is left byte-for-byte alone:
// the swap is an exact-string replacement on the raw file text, so diffs contain only URL/id changes.
//
// Options:
//   --config <file>      read the new configurator JSON from a file instead of fetching (offline / tests)
//   --dry-run            print what would change, write nothing
//   --allow-partial      do not fail when some page variations have no match in the new configurator
//   --old-folder-id <id> [--new-name <name>]  also swap the old iJewel folder/project id for <configuratorId>
//                        everywhere in project.json + saved-config.json (saved-config "id", the component fileId),
//                        in app.js (PROJECT_ID) and configurators.json (ijewelProjectId); --new-name also
//                        renames saved-config "name". Metadata only.
//   --verify-urls        HEAD-check every new URL (expects 200)
//
// A private client folder that only holds an index.html with <base href="../slug/"> is resolved to ../slug/
// automatically (it shares that folder's project.json).
// Prints replaced counts, unmatched variations, and the OLD file ids that are now unreferenced by the given
// pages (deletion candidates - still grep the repo for other users first).
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const args = process.argv.slice(2);
const opt = {}; const pos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--config' || a === '--old-folder-id' || a === '--new-name') opt[a.slice(2)] = args[++i];
  else if (a.startsWith('--')) opt[a.slice(2)] = true;
  else pos.push(a);
}
const [cfgId, ...rawFolders] = pos;
if (!cfgId || !rawFolders.length) { console.error('usage: repoint.mjs <configuratorId> <pageFolder>... [--dry-run] [--allow-partial] [--config file] [--old-folder-id id [--new-name n]] [--verify-urls]'); process.exit(2); }

const resolveFolder = f => {
  const f2 = path.join(f, 'project.json');
  if (fs.existsSync(f2)) return path.normalize(f);
  const idx = path.join(f, 'index.html');
  const m = fs.existsSync(idx) && fs.readFileSync(idx, 'utf8').match(/<base\s+href="([^"]+)"/);
  if (m) { const t = path.normalize(path.join(f, m[1])); if (fs.existsSync(path.join(t, 'project.json'))) { console.log(`${f}: wrapper page, shares ${t}`); return t; } }
  return path.normalize(f);
};
const folders = [...new Set(rawFolders.map(resolveFolder).map(f => path.relative(process.cwd(), path.resolve(f))))];
const stemOfUrl = u => path.basename(String(u).split('?')[0]).replace(/\.[a-z0-9]+$/i, '').replace(/_[0-9a-f]{10}$/i, '').toLowerCase();
const stemOfName = n => String(n).replace(/\.glb$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const keys = v => [...new Set([v.modelUrl && stemOfUrl(v.modelUrl), v.name && stemOfName(v.name), v.title && stemOfName(v.title)].filter(Boolean))];
const variationsOf = cfg => {
  const c = typeof cfg === 'string' ? JSON.parse(cfg) : cfg;
  return (c?.plugins?.RingConfigurator?.components ?? []).flatMap(x => x.variations ?? []);
};

let doc;
if (opt.config) doc = JSON.parse(fs.readFileSync(opt.config, 'utf8'));
else {
  const r = await fetch(`https://amikob.ijewel3d.com/api/raw/v1/files/view/${cfgId}?select=config`, { headers: { 'User-Agent': UA } });
  if (!r.ok) { console.error('fetch failed', r.status); process.exit(1); }
  doc = await r.json();
}
const newVars = variationsOf(doc.config ?? doc);
if (!newVars.length) { console.error('new configurator has no RingConfigurator variations'); process.exit(1); }
const index = new Map(); const dup = new Set();
for (const v of newVars) for (const k of keys(v)) { if (index.has(k) && index.get(k) !== v) dup.add(k); index.set(k, v); }
// prefer the modelUrl stem (first key) for matching; ambiguous stems are reported
const byUrl = new Map(newVars.map(v => [stemOfUrl(v.modelUrl), v]));
console.log(`new configurator ${cfgId}: ${newVars.length} variations`);

const oldIdsAll = new Set(); const usedNew = new Set(); let failed = false;
for (const folder of folders) {
  const unmatched = []; const pairs = new Map(); // oldString -> newString
  const files = ['project.json', 'saved-config.json'].map(f => path.join(folder, f)).filter(f => fs.existsSync(f));
  if (!files.length) { console.error(`${folder}: no project.json/saved-config.json`); failed = true; continue; }
  const oldVars = [];
  for (const f of files) {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    oldVars.push(...variationsOf(f.endsWith('saved-config.json') ? raw.config : raw));
  }
  for (const o of oldVars) {
    const n = byUrl.get(stemOfUrl(o.modelUrl)) ?? keys(o).map(k => index.get(k)).find(Boolean);
    if (!n) { unmatched.push(o.name || o.modelUrl); continue; }
    if (o.modelUrl !== n.modelUrl) pairs.set(o.modelUrl, n.modelUrl);
    if (o.icon && n.icon && o.icon !== n.icon) pairs.set(o.icon, n.icon);
    if (o.fileId && n.fileId && o.fileId !== n.fileId) { pairs.set(o.fileId, n.fileId); oldIdsAll.add(o.fileId); }
    usedNew.add(n);
  }
  if (unmatched.length) {
    console.error(`${folder}: ${unmatched.length} variations without a match: ${[...new Set(unmatched)].join(', ')}`);
    if (!opt['allow-partial']) { failed = true; continue; }
  }
  // longest strings first so one URL can never be clobbered by a shorter one that is its prefix
  const ordered = [...pairs].sort((a, b) => b[0].length - a[0].length);
  let total = 0;
  for (const f of files) {
    let text = fs.readFileSync(f, 'utf8'); let n = 0;
    for (const [from, to] of ordered) { const parts = text.split(from); n += parts.length - 1; text = parts.join(to); }
    if (opt['old-folder-id']) {
      // every remaining use of the old folder id (saved-config "id", RingConfigurator component fileId, ...)
      const parts = text.split(opt['old-folder-id']); n += parts.length - 1; text = parts.join(cfgId);
    }
    if (opt['old-folder-id'] && f.endsWith('saved-config.json')) {
      if (opt['new-name']) text = text.replace(/("id":"[^"]+","name":")[^"]*(")/, `$1${opt['new-name']}$2`);
    }
    total += n;
    if (!opt['dry-run']) fs.writeFileSync(f, text);
  }
  if (opt['old-folder-id']) {
    const sub = (f, from, to) => { if (fs.existsSync(f)) { const t = fs.readFileSync(f, 'utf8'); if (t.includes(from) && !opt['dry-run']) fs.writeFileSync(f, t.split(from).join(to)); } };
    sub(path.join(folder, 'app.js'), opt['old-folder-id'], cfgId);
    sub('configurators.json', `"ijewelProjectId": "${opt['old-folder-id']}"`, `"ijewelProjectId": "${cfgId}"`);
    for (const [from, to] of ordered) sub('configurators.json', from, to); // portal thumbnail etc. that points at an old file
  }
  console.log(`${folder}: ${pairs.size} distinct strings, ${total} replacements in ${files.map(f => path.basename(f)).join(', ')}${opt['dry-run'] ? ' (dry run)' : ''}`);
}
const unusedNew = newVars.filter(v => !usedNew.has(v)).map(v => v.name);
if (unusedNew.length) console.log(`note: ${unusedNew.length} variations in the new configurator are not used by the page(s): ${unusedNew.join(', ')}`);
if (opt['verify-urls']) {
  let bad = 0;
  for (const v of [...usedNew]) for (const u of [v.modelUrl, v.icon]) {
    if (!u) continue; const r = await fetch(u, { method: 'HEAD', headers: { 'User-Agent': UA } });
    if (r.status !== 200) { bad++; console.error(r.status, u); }
  }
  console.log(bad ? `${bad} URLs not 200` : `all ${usedNew.size * 2} new URLs return 200`);
  if (bad) failed = true;
}
console.log('OLD file ids now unreferenced by these pages (candidates for deletion once no other page uses them):');
console.log([...oldIdsAll].join('\n'));
process.exit(failed ? 1 : 0);
