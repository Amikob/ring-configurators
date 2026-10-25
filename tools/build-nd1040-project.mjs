// Builds nd1040/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live ND1040 iJewel configurator saved at tools/snapshots/nd1040-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/AxqIDZagSNahG9jaKAa1WQ?select=id,name,file,config' > tools/snapshots/nd1040-public.json
// then run: node tools/build-nd1040-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/nd1040-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 ND1040 ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '4Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 4Ct Oval default');
baseline.name = "ND1040";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// Metal 01 = head, Metal 02 = shank (verified in the downloaded GLBs).
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
// Source files: Metal 01 = SHANK (constant mesh, thin), Metal 02 = HEAD (variable) on every ring -> swap UI titles.
materials.variations.find(v => v.uuid === 'Metal 01').title = 'Shank gold';
materials.variations.find(v => v.uuid === 'Metal 02').title = 'Head gold';
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// ND1040 has only a center stone per ring: layer "Gem 01 ND1040 <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Marquise', 'Cushion', 'Radiant'];
baseline.materialConfig.mapping = ['Metal 01', 'Metal 02'].map(name => ({ name, path: metal }));
for (const name of ["Gem 01 ND1040 Cushion", "Gem 01 ND1040 Elongated Cushion", "Gem 01 ND1040 Elongated Radiant", "Gem 01 ND1040 Emerald", "Gem 01 ND1040 Marquise", "Gem 01 ND1040 Oval", "Gem 01 ND1040 Radiant", "Gem 01 ND1040 Round", "Gem 02 ND1040 Cushion", "Gem 02 ND1040 Elongated Cushion", "Gem 02 ND1040 Elongated Radiant", "Gem 02 ND1040 Emerald", "Gem 02 ND1040 Marquise", "Gem 02 ND1040 Oval", "Gem 02 ND1040 Radiant", "Gem 02 ND1040 Round"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 ND1040 Cushion", "Gem 01 ND1040 Elongated Cushion", "Gem 01 ND1040 Elongated Radiant", "Gem 01 ND1040 Emerald", "Gem 01 ND1040 Marquise", "Gem 01 ND1040 Oval", "Gem 01 ND1040 Radiant", "Gem 01 ND1040 Round", "Gem 02 ND1040 Cushion", "Gem 02 ND1040 Elongated Cushion", "Gem 02 ND1040 Elongated Radiant", "Gem 02 ND1040 Emerald", "Gem 02 ND1040 Marquise", "Gem 02 ND1040 Oval", "Gem 02 ND1040 Radiant", "Gem 02 ND1040 Round"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('nd1040/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built ND1040: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
