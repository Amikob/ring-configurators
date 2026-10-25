// Builds bn630/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live BN630 iJewel configurator saved at tools/snapshots/bn630-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/CDMnHkUYTR6kspmu_OJkoQ?select=id,name,file,config' > tools/snapshots/bn630-public.json
// then run: node tools/build-bn630-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/bn630-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 35) throw new Error(`Expected 35 BN630 ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
baseline.name = "BN630";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// One-piece metal: everything is on Metal 01, driven by a single Gold control.
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
// Source files: Metal 01 = SHANK (constant mesh, thin), Metal 02 = HEAD (variable) on every ring -> swap UI titles.
materials.variations.find(v => v.uuid === 'Metal 01').title = 'Shank gold';
materials.variations.find(v => v.uuid === 'Metal 02').title = 'Head gold';
materials.variations = [{ ...materials.variations[1], uuid: 'Metal 01', title: 'Gold' }];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// BN630 has only a center stone per ring: layer "Gem 01 BN630 <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Marquise', 'Pear'];
baseline.materialConfig.mapping = ['Metal 01'].map(name => ({ name, path: metal }));
for (const name of ["Gem 01 BN630 Elongated Cushion", "Gem 01 BN630 Elongated Radiant", "Gem 01 BN630 Marquise", "Gem 01 BN630 Oval", "Gem 01 BN630 Pear", "Gem 01 BN630 Round", "Gem 02 BN630 Elongated Cushion", "Gem 02 BN630 Elongated Radiant", "Gem 02 BN630 Emerald", "Gem 02 BN630 Marquise", "Gem 02 BN630 Oval", "Gem 02 BN630 Pear", "Gem 02 BN630 Round", "Gem 03 BN630 Elongated Cushion", "Gem 03 BN630 Elongated Radiant", "Gem 03 BN630 Emerald", "Gem 03 BN630 Marquise", "Gem 03 BN630 Oval", "Gem 03 BN630 Pear", "Gem 03 BN630 Round"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 BN630 Elongated Cushion", "Gem 01 BN630 Elongated Radiant", "Gem 01 BN630 Marquise", "Gem 01 BN630 Oval", "Gem 01 BN630 Pear", "Gem 01 BN630 Round", "Gem 02 BN630 Elongated Cushion", "Gem 02 BN630 Elongated Radiant", "Gem 02 BN630 Emerald", "Gem 02 BN630 Marquise", "Gem 02 BN630 Oval", "Gem 02 BN630 Pear", "Gem 02 BN630 Round", "Gem 03 BN630 Elongated Cushion", "Gem 03 BN630 Elongated Radiant", "Gem 03 BN630 Emerald", "Gem 03 BN630 Marquise", "Gem 03 BN630 Oval", "Gem 03 BN630 Pear", "Gem 03 BN630 Round"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('bn630/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built BN630: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
