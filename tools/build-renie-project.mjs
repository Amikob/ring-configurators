// Builds renie/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live Renie iJewel configurator saved at tools/snapshots/renie-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/RdmFXIuLQ2SlW7U5cdzCHQ?select=id,name,file,config' > tools/snapshots/renie-public.json
// then run: node tools/build-renie-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/renie-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 30) throw new Error(`Expected 30 Renie ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
baseline.name = "Renie";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// One-piece metal: body is Metal 02 (driven by the Gold control); Metal 01 is a tiny fragment (16-40 faces) mapped to static gold.
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// Renie has only a center stone per ring: layer "Gem 01 Renie <Shape>".
const SHAPES = ['Round', 'Oval', 'Emerald', 'Marquise', 'Square Cushion', 'Square Radiant'];
baseline.materialConfig.mapping = ['Metal 01', 'Metal 02'].map(name => ({ name, path: metal }));
for (const name of ["Gem 01 Renie Emerald", "Gem 01 Renie Marquise", "Gem 01 Renie Oval", "Gem 01 Renie Round", "Gem 01 Renie Square Cushion", "Gem 01 Renie Square Radiant", "Gem 02 Renie Emerald", "Gem 02 Renie Marquise", "Gem 02 Renie Oval", "Gem 02 Renie Round", "Gem 02 Renie Square Cushion", "Gem 02 Renie Square Radiant"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 Renie Emerald", "Gem 01 Renie Marquise", "Gem 01 Renie Oval", "Gem 01 Renie Round", "Gem 01 Renie Square Cushion", "Gem 01 Renie Square Radiant", "Gem 02 Renie Emerald", "Gem 02 Renie Marquise", "Gem 02 Renie Oval", "Gem 02 Renie Round", "Gem 02 Renie Square Cushion", "Gem 02 Renie Square Radiant"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

materials.variations = [{ ...materials.variations[1], uuid: 'Metal 02', title: 'Gold' }];
baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('renie/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built Renie: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
