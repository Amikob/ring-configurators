// Builds nd750/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live ND750 iJewel configurator saved at tools/snapshots/nd750-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/XKp-NLXVSaqWVVyKdByOiw?select=id,name,file,config' > tools/snapshots/nd750-public.json
// then run: node tools/build-nd750-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/nd750-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 ND750 ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
baseline.name = "ND750";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// Metal 01 = head, Metal 02 = shank (verified in the downloaded GLBs).
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// ND750 has only a center stone per ring: layer "Gem 01 ND750 <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Emerald', 'Marquise', 'Old Cut Cushion', 'Pear', 'Square Radiant'];
baseline.materialConfig.mapping = ['Metal 01', 'Metal 02'].map(name => ({ name, path: metal }));
for (const name of ["Gem 01 ND750 Elongated Cushion", "Gem 01 ND750 Emerald", "Gem 01 ND750 Marquise", "Gem 01 ND750 Old Cut Cushion", "Gem 01 ND750 Oval", "Gem 01 ND750 Pear", "Gem 01 ND750 Round", "Gem 01 ND750 Square Radiant", "Gem 02 ND750 Oval"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 ND750 Elongated Cushion", "Gem 01 ND750 Emerald", "Gem 01 ND750 Marquise", "Gem 01 ND750 Old Cut Cushion", "Gem 01 ND750 Oval", "Gem 01 ND750 Pear", "Gem 01 ND750 Round", "Gem 01 ND750 Square Radiant", "Gem 02 ND750 Oval"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('nd750/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built ND750: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
