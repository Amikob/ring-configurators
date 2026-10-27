// Builds lacey/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live Lacey iJewel configurator saved at tools/snapshots/lacey-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/JzROLTCDQ6WUIcDPFNp_8Q?select=id,name,file,config' > tools/snapshots/lacey-public.json
// then run: node tools/build-lacey-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/lacey-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 Lacey ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
baseline.name = "Lacey";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// Metal 01 = head, Metal 02 = shank (verified in the downloaded GLBs).
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
// LAYER ROLES (redone files): head=Metal 04, shank=Metal 01 by default; per-ring overrides in app.js LAYER_ROLES. One UI group per metal layer actually used.
{ const tpl = materials.variations.find(v => v.uuid === 'Metal 01');
  const USED = ["Metal 01", "Metal 03", "Metal 04"]; const HEAD = 'Metal 04', SHANK = "Metal 01";  // SHANK may be one layer or a list (shank split over several metal layers)
  const SHANK1 = [].concat(SHANK)[0];
  materials.variations = USED.map(u => ({ ...structuredClone(tpl), uuid: u, title: u === HEAD ? 'Head gold' : u === SHANK1 ? 'Shank gold' : `Extra gold (${u})` })); }
const USED_METALS = ["Metal 01", "Metal 03", "Metal 04"];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// Lacey has only a center stone per ring: layer "Gem 01 Lacey <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Emerald', 'Marquise', 'Square Cushion', 'Square Radiant', 'Asscher'];
baseline.materialConfig.mapping = USED_METALS.map(name => ({ name, path: metal }));
for (const name of ["Gem 01 Lacey Asscher", "Gem 01 Lacey Elongated Cushion", "Gem 01 Lacey Emerald", "Gem 01 Lacey Marquise", "Gem 01 Lacey Oval", "Gem 01 Lacey Round", "Gem 01 Lacey Square Cushion", "Gem 01 Lacey Square Radiant", "Gem 02 Lacey Asscher", "Gem 02 Lacey Elongated Cushion", "Gem 02 Lacey Emerald", "Gem 02 Lacey Marquise", "Gem 02 Lacey Oval", "Gem 02 Lacey Round", "Gem 02 Lacey Square Cushion", "Gem 02 Lacey Square Radiant", "Gem 03 Lacey Asscher", "Gem 03 Lacey Elongated Cushion", "Gem 03 Lacey Emerald", "Gem 03 Lacey Marquise", "Gem 03 Lacey Oval", "Gem 03 Lacey Round", "Gem 03 Lacey Square Cushion", "Gem 03 Lacey Square Radiant", "Gem 04 Lacey Asscher"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 Lacey Asscher", "Gem 01 Lacey Elongated Cushion", "Gem 01 Lacey Emerald", "Gem 01 Lacey Marquise", "Gem 01 Lacey Oval", "Gem 01 Lacey Round", "Gem 01 Lacey Square Cushion", "Gem 01 Lacey Square Radiant", "Gem 02 Lacey Asscher", "Gem 02 Lacey Elongated Cushion", "Gem 02 Lacey Emerald", "Gem 02 Lacey Marquise", "Gem 02 Lacey Oval", "Gem 02 Lacey Round", "Gem 02 Lacey Square Cushion", "Gem 02 Lacey Square Radiant", "Gem 03 Lacey Asscher", "Gem 03 Lacey Elongated Cushion", "Gem 03 Lacey Emerald", "Gem 03 Lacey Marquise", "Gem 03 Lacey Oval", "Gem 03 Lacey Round", "Gem 03 Lacey Square Cushion", "Gem 03 Lacey Square Radiant", "Gem 04 Lacey Asscher"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('lacey/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built Lacey: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
