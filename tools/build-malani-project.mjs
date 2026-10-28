// Builds malani/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live Malani iJewel configurator saved at tools/snapshots/malani-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/YD_NcgsxQaSnm12d34x1gQ?select=id,name,file,config' > tools/snapshots/malani-public.json
// then run: node tools/build-malani-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/malani-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 Malani ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
baseline.name = "Malani";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// One-piece metal: everything is on Metal 01, driven by a single Gold control.
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
materials.variations = [{ ...materials.variations[1], uuid: 'Metal 01', title: 'Gold' }];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// Malani has only a center stone per ring: layer "Gem 01 Malani <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Marquise', 'Old Cut Cushion', 'Pear'];
baseline.materialConfig.mapping = ['Metal 01'].map(name => ({ name, path: metal }));
for (const name of ["Gem 01 Malani Elongated Cushion", "Gem 01 Malani Elongated Radiant", "Gem 01 Malani Emerald", "Gem 01 Malani Marquise", "Gem 01 Malani Old Cut Cushion", "Gem 01 Malani Oval", "Gem 01 Malani Pear", "Gem 01 Malani Round", "Gem 02 Malani Elongated Cushion", "Gem 02 Malani Elongated Radiant", "Gem 02 Malani Emerald", "Gem 02 Malani Marquise", "Gem 02 Malani Old Cut Cushion", "Gem 02 Malani Oval", "Gem 02 Malani Pear", "Gem 02 Malani Round", "Gem 03 Malani Elongated Cushion", "Gem 03 Malani Elongated Radiant", "Gem 03 Malani Emerald", "Gem 03 Malani Marquise", "Gem 03 Malani Old Cut Cushion", "Gem 03 Malani Oval", "Gem 03 Malani Pear", "Gem 03 Malani Round"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 Malani Elongated Cushion", "Gem 01 Malani Elongated Radiant", "Gem 01 Malani Emerald", "Gem 01 Malani Marquise", "Gem 01 Malani Old Cut Cushion", "Gem 01 Malani Oval", "Gem 01 Malani Pear", "Gem 01 Malani Round", "Gem 02 Malani Elongated Cushion", "Gem 02 Malani Elongated Radiant", "Gem 02 Malani Emerald", "Gem 02 Malani Marquise", "Gem 02 Malani Old Cut Cushion", "Gem 02 Malani Oval", "Gem 02 Malani Pear", "Gem 02 Malani Round", "Gem 03 Malani Elongated Cushion", "Gem 03 Malani Elongated Radiant", "Gem 03 Malani Emerald", "Gem 03 Malani Marquise", "Gem 03 Malani Old Cut Cushion", "Gem 03 Malani Oval", "Gem 03 Malani Pear", "Gem 03 Malani Round"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('malani/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built Malani: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
