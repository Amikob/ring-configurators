// Builds emi/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live Emi iJewel configurator saved at tools/snapshots/emi-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/I-M1ypjsQK2UiDo1wHHGig?select=id,name,file,config' > tools/snapshots/emi-public.json
// then run: node tools/build-emi-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/emi-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 Emi ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
baseline.name = "Emi";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// Metal 01 = head, Metal 02 = shank (verified in the downloaded GLBs).
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// Emi has only a center stone per ring: layer "Gem 01 Emi <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Marquise', 'Asscher', 'Old Cut Cushion'];
baseline.materialConfig.mapping = ['Metal 01', 'Metal 02'].map(name => ({ name, path: metal }));
for (const name of ["Gem 01 Emi Asscher", "Gem 01 Emi Elongated Cushion", "Gem 01 Emi Elongated Radiant", "Gem 01 Emi Emerald", "Gem 01 Emi Marquise", "Gem 01 Emi Old Cut Cushion", "Gem 01 Emi Oval", "Gem 01 Emi Round", "Gem 02 Emi Asscher", "Gem 02 Emi Elongated Cushion", "Gem 02 Emi Elongated Radiant", "Gem 02 Emi Emerald", "Gem 02 Emi Marquise", "Gem 02 Emi Old Cut Cushion", "Gem 02 Emi Oval", "Gem 02 Emi Round"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 Emi Asscher", "Gem 01 Emi Elongated Cushion", "Gem 01 Emi Elongated Radiant", "Gem 01 Emi Emerald", "Gem 01 Emi Marquise", "Gem 01 Emi Old Cut Cushion", "Gem 01 Emi Oval", "Gem 01 Emi Round", "Gem 02 Emi Asscher", "Gem 02 Emi Elongated Cushion", "Gem 02 Emi Elongated Radiant", "Gem 02 Emi Emerald", "Gem 02 Emi Marquise", "Gem 02 Emi Old Cut Cushion", "Gem 02 Emi Oval", "Gem 02 Emi Round"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('emi/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built Emi: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
