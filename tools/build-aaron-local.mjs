// Aaron v2 (Nov 2026): the old iJewel configurator JKIOiv7VQVa4Prqa7LE8fQ is gone (404).
// The 40 rings were re-uploaded as plain public files to the new iJewel Drive folder
// "Aaron Ring" (VcOWtWKtQi6vA80XDiyPHQ). There is no configurator project, so the page loads a
// local saved config (aaron/saved-config.json), like nd_ear_02/03/04.
//
// Input: tools/snapshots/aaron-v2-ids.json  -> array of the 40 iJewel file ids (any order)
// Run:   node tools/build-aaron-local.mjs && node tools/build-aaron-project.mjs
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const idsRaw = JSON.parse(fs.readFileSync(new URL('tools/snapshots/aaron-v2-ids.json', root)));
const ids = idsRaw.map(x => typeof x === 'string' ? x : x.id);
const expectName = Object.fromEntries(idsRaw.filter(x => typeof x === 'object').map(x => [x.id, x.name]));
const old = JSON.parse(fs.readFileSync(new URL('tools/snapshots/aaron-public.json', root)));
const oldCfg = typeof old.config === 'string' ? JSON.parse(old.config) : old.config;
const oldRing = oldCfg.plugins.RingConfigurator.components.find(c => c.name === 'Ring');
const FILES = 'https://amikob.ijewel3d.com/files/';
const byName = {};
for (const id of ids) {
  const r = await fetch(`https://amikob.ijewel3d.com/api/raw/v1/files/view/${id}`);
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
  const f = await r.json();
  const meta = JSON.parse(f.meta || '{}');
  if (!/\.glb$/i.test(f.file)) throw new Error(`${id}: not a glb (${f.file})`);
  if (f.path !== '/VcOWtWKtQi6vA80XDiyPHQ/') throw new Error(`${id}: unexpected folder ${f.path}`);
  if (f.deleted) throw new Error(`${id}: deleted`);
  if (meta.pub !== true) throw new Error(`${id}: not public`);
  const name = f.name.replace(/\.glb$/i, '');
  if (expectName[id] && expectName[id].replace(/\.(glb|3dm)$/i, '') !== name) throw new Error(`${id}: Drive name ${expectName[id]} != API name ${f.name}`);
  if (byName[name]) throw new Error(`duplicate ${name}`);
  byName[name] = f;
}
const variations = oldRing.variations.map(v => {
  const f = byName[v.name];
  if (!f) throw new Error(`missing new file for ${v.name}`);
  return { ...v, modelUrl: FILES + f.file, icon: f.thumb ? `${FILES}${f.thumb}?h=ijewel3d.com` : v.icon, fileId: f.id };
});
if (variations.length !== 40 || Object.keys(byName).length !== 40) throw new Error(`expected 40, got ${variations.length}/${Object.keys(byName).length}`);
const ring = { ...oldRing, variations };
const config = { ...oldCfg, plugins: { ...oldCfg.plugins, RingConfigurator: { ...oldCfg.plugins.RingConfigurator, components: [ring] } } };
const snap = { id: 'local-aaron-v2', name: 'Aaron v2 (local; files in iJewel folder VcOWtWKtQi6vA80XDiyPHQ)', file: old.file, config: JSON.stringify(config) };
fs.writeFileSync(new URL('tools/snapshots/aaron-v2-public.json', root), JSON.stringify(snap, null, 2));
fs.writeFileSync(new URL('aaron/saved-config.json', root), JSON.stringify(snap));
console.log('Wrote aaron/saved-config.json with', variations.length, 'rings');
