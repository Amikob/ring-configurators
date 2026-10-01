// Builds nd336/project.json from the ND1061 baseline (scene, metals, try-on defaults)
// plus the live ND336 iJewel configurator saved at tools/snapshots/nd336-public.json.
//
// Refresh the snapshot: open
//   https://amikob.ijewel3d.com/api/raw/v1/files/view/DLVn0aVvScWnnSuKWGzUTg?select=id,name,file,config
// save it as tools/snapshots/nd336-public.json, then run: node tools/build-nd336-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd1061/project.json');
const native = read('tools/snapshots/nd336-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 ND336 ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '1Ct Round');
if (ring.selectedIndex < 0) throw new Error('Missing 1Ct Round default');
baseline.name = 'ND336';
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// Same metal zones as ND1061: Metal 01 = head, Metal 02 = shank (verified in the CAD audit).
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');

const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// Every ND336 gem layer was renamed per shape during CAD preparation so each cut keeps
// its own diamond capture. Gem 01 = center, Gem 02 = head stones, Gem 03 = shank stones.
// Elongated Cushion 1-3 ct uses Gem 04 for its shank stones instead of Gem 03.
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Pear', 'Marquise', 'Square Cushion'];
baseline.materialConfig.mapping = ['Metal 01', 'Metal 02'].map(name => ({ name, path: metal }));
for (const shape of SHAPES) for (const layer of ['01', '02', '03']) {
  baseline.materialConfig.mapping.push({ name: `Gem ${layer} ND336 ${shape}`, path: diamond });
}
baseline.materialConfig.mapping.push({ name: 'Gem 04 ND336 Elongated Cushion', path: diamond });

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
// Starting fit only. A physical iPhone try-on is still needed to confirm finger fit.
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('nd336/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built ND336: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
