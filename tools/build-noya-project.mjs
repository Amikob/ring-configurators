// Builds noya/project.json from aaron/project.json (same scene, metals, diamond preset, try-on)
// plus tools/snapshots/noya-public.json (tools/build-noya-local.mjs).
import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root)));
const project = read('aaron/project.json');
const snap = read('tools/snapshots/noya-public.json');
const config = JSON.parse(snap.config);
const ring = config.plugins.RingConfigurator.components[0];
project.name = 'Noya';
project.plugins.RingConfigurator = config.plugins.RingConfigurator;
const mapping = project.materialConfig.mapping;
const diamond = mapping.find(m => m.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(m => m.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Aaron material presets missing');
const gems = new Set(['Gem 01', 'Gem 02', ...snap.materials.filter(n => /^gem/i.test(n))]);
const metals = new Set(['Metal 01', 'Metal 02', ...snap.materials.filter(n => /^metal/i.test(n))]);
const unknown = snap.materials.filter(n => !gems.has(n) && !metals.has(n));
if (unknown.length) throw new Error(`Unmapped materials: ${unknown.join(', ')}`);
project.materialConfig.mapping = [...[...metals].map(name => ({ name, path: metal })), ...[...gems].map(name => ({ name, path: diamond }))];
fs.writeFileSync(new URL('noya/project.json', root), JSON.stringify(project, null, 2));
console.log(`Built Noya: ${ring.variations.length} rings; mapping ${project.materialConfig.mapping.map(m => m.name).join(', ')}`);
