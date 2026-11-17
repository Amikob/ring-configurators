// SUPERSEDED (2026-11-17): the live Noya pages (noya/, noya-75xcgrro3v/) now load their 40 rings from the new iJewel configurator aCzuAfLXRiipgfWjDBUBRQ
// (see tools/cfg-migrate/repoint.mjs). Re-running this builder would point noya/ back at the old "Noya Ring" folder files (and drop Princess/Marquise).
// Noya (Clover), Nov 2026: plain public GLB files in iJewel Drive folder "Noya Ring"
// (Ob9B3sx0RuSlIO7rEJ8c9A), auto-converted from 3dm, named like "2_ct_round.glb".
// Same pattern as Aaron v2 (tools/build-aaron-local.mjs): the page loads noya/saved-config.json.
//
// Input: tools/snapshots/noya-ids.json -> array of iJewel file ids (strings or {id,name})
// Run:   node tools/build-noya-local.mjs && node tools/build-noya-project.mjs
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const FOLDER = 'Ob9B3sx0RuSlIO7rEJ8c9A';
const FILES = 'https://amikob.ijewel3d.com/files/';
const SHAPE_TITLE = { round: 'Round', oval: 'Oval', elongated_cushion: 'Elongated Cushion', elongated_radiant: 'Elongated Radiant', emerald: 'Emerald', old_cut_cushion: 'Old Cut Cushion', marquise: 'Marquise', princess: 'Princess' };
const idsRaw = JSON.parse(fs.readFileSync(new URL('tools/snapshots/noya-ids.json', root)));
const ids = [...new Set(idsRaw.map(x => typeof x === 'string' ? x : x.id))];
const files = [];
for (const id of ids) {
  const r = await fetch(`https://amikob.ijewel3d.com/api/raw/v1/files/view/${id}`);
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status} (file must be public)`);
  const f = await r.json();
  const meta = JSON.parse(f.meta || '{}');
  if (!/\.glb$/i.test(f.file)) throw new Error(`${id}: not a glb (${f.file})`);
  if (f.path !== `/${FOLDER}/`) throw new Error(`${id}: unexpected folder ${f.path}`);
  if (f.deleted) throw new Error(`${id}: deleted`);
  if (meta.pub !== true) throw new Error(`${id}: not public`);
  const m = f.name.replace(/\.glb$/i, '').trim().toLowerCase().match(/^(\d+)_?ct_(.+)$/);
  if (!m || !SHAPE_TITLE[m[2]]) throw new Error(`${id}: unexpected name ${f.name}`);
  const name = `${m[1]}Ct ${SHAPE_TITLE[m[2]]}`;
  if (files.some(x => x.name === name)) throw new Error(`duplicate ${name}`);
  files.push({ name, f, meta });
}
files.sort((a, b) => a.name.localeCompare(b.name));
const variations = files.map(({ name, f }) => ({ name, title: name, modelUrl: FILES + f.file, icon: f.thumb ? `${FILES}${f.thumb}?h=ijewel3d.com` : '', fileId: f.id, tags: [] }));
const materials = [...new Set(files.flatMap(x => x.meta.materials || []))].sort();
const template = JSON.parse(JSON.parse(fs.readFileSync(new URL('aaron/saved-config.json', root))).config);
const ring = { ...template.plugins.RingConfigurator.components[0], selectedIndex: Math.max(0, variations.findIndex(v => v.name === '3Ct Oval')), variations };
const config = { ...template, plugins: { ...template.plugins, RingConfigurator: { ...template.plugins.RingConfigurator, components: [ring] } } };
const snap = { id: 'local-noya', name: `Noya (local; files in iJewel folder ${FOLDER})`, materials, config: JSON.stringify(config) };
fs.writeFileSync(new URL('tools/snapshots/noya-public.json', root), JSON.stringify(snap, null, 2));
fs.writeFileSync(new URL('noya/saved-config.json', root), JSON.stringify(snap));
console.log('Wrote noya/saved-config.json with', variations.length, 'rings; materials:', materials.join(', '));
