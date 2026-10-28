// Builds serenity/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live Serenity iJewel configurator saved at tools/snapshots/serenity-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/UhQ5O-QxRpGbGhPiQvbZqw?select=id,name,file,config' > tools/snapshots/serenity-public.json
// then run: node tools/build-serenity-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/serenity-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 Serenity ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '4Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 4Ct Oval default');
baseline.name = "Serenity";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// One-piece metal: everything is on Metal 01, driven by a single Gold control.
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
materials.variations = [{ ...materials.variations[1], uuid: 'Metal 01', title: 'Gold' }];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// Serenity has only a center stone per ring: layer "Gem 01 Serenity <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Marquise', 'Square Radiant', 'Asscher'];
baseline.materialConfig.mapping = ['Metal 01'].map(name => ({ name, path: metal }));
for (const name of ["Gem 01 Serenity Asscher", "Gem 01 Serenity Elongated Cushion", "Gem 01 Serenity Elongated Radiant", "Gem 01 Serenity Emerald", "Gem 01 Serenity Marquise", "Gem 01 Serenity Oval", "Gem 01 Serenity Round", "Gem 01 Serenity Square Radiant", "Gem 04 Serenity Asscher", "Gem 04 Serenity Elongated Cushion", "Gem 04 Serenity Elongated Radiant", "Gem 04 Serenity Emerald", "Gem 04 Serenity Marquise", "Gem 04 Serenity Oval", "Gem 04 Serenity Round", "Gem 04 Serenity Square Radiant"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 Serenity Asscher", "Gem 01 Serenity Elongated Cushion", "Gem 01 Serenity Elongated Radiant", "Gem 01 Serenity Emerald", "Gem 01 Serenity Marquise", "Gem 01 Serenity Oval", "Gem 01 Serenity Round", "Gem 01 Serenity Square Radiant", "Gem 04 Serenity Asscher", "Gem 04 Serenity Elongated Cushion", "Gem 04 Serenity Elongated Radiant", "Gem 04 Serenity Emerald", "Gem 04 Serenity Marquise", "Gem 04 Serenity Oval", "Gem 04 Serenity Round", "Gem 04 Serenity Square Radiant"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('serenity/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built Serenity: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
