// Builds nd1042/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live ND1042 iJewel configurator saved at tools/snapshots/nd1042-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/alIpVE7ESIeaTLlfaZcAnA?select=id,name,file,config' > tools/snapshots/nd1042-public.json
// then run: node tools/build-nd1042-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/nd1042-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 ND1042 ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '4Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 4Ct Oval default');
baseline.name = "ND1042";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// Metal 01 = head, Metal 02 = shank (verified in the downloaded GLBs).
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
// LAYER ROLES (redone files): head=Metal 04, shank=Metal 01 by default; per-ring overrides in app.js LAYER_ROLES. One UI group per metal layer actually used.
{ const tpl = materials.variations.find(v => v.uuid === 'Metal 01');
  const USED = ["Metal 01", "Metal 04"]; const HEAD = 'Metal 04', SHANK = "Metal 01";  // SHANK may be one layer or a list (shank split over several metal layers)
  const SHANK1 = [].concat(SHANK)[0];
  materials.variations = USED.map(u => ({ ...structuredClone(tpl), uuid: u, title: u === HEAD ? 'Head gold' : u === SHANK1 ? 'Shank gold' : `Extra gold (${u})` })); }
const USED_METALS = ["Metal 01", "Metal 04"];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// ND1042 has only a center stone per ring: layer "Gem 01 ND1042 <Shape>".
const NEW_GEMS = [1,2,3].map(n => `Gem 0${n} ND1042 Princess`);
const SHAPES = ['Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Marquise', 'Square Radiant', 'Asscher', 'Princess'];
baseline.materialConfig.mapping = USED_METALS.map(name => ({ name, path: metal }));
for (const name of [...NEW_GEMS, "Gem 01 ND1042 Asscher", "Gem 01 ND1042 Elongated Cushion", "Gem 01 ND1042 Elongated Radiant", "Gem 01 ND1042 Emerald", "Gem 01 ND1042 Marquise", "Gem 01 ND1042 Oval", "Gem 01 ND1042 Square Radiant", "Gem 02 ND1042 Asscher", "Gem 02 ND1042 Elongated Cushion", "Gem 02 ND1042 Elongated Radiant", "Gem 02 ND1042 Emerald", "Gem 02 ND1042 Marquise", "Gem 02 ND1042 Oval", "Gem 02 ND1042 Square Radiant", "Gem 03 ND1042 Asscher", "Gem 03 ND1042 Elongated Cushion", "Gem 03 ND1042 Elongated Radiant", "Gem 03 ND1042 Emerald", "Gem 03 ND1042 Marquise", "Gem 03 ND1042 Oval", "Gem 03 ND1042 Square Radiant"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => ![...NEW_GEMS, "Gem 01 ND1042 Asscher", "Gem 01 ND1042 Elongated Cushion", "Gem 01 ND1042 Elongated Radiant", "Gem 01 ND1042 Emerald", "Gem 01 ND1042 Marquise", "Gem 01 ND1042 Oval", "Gem 01 ND1042 Square Radiant", "Gem 02 ND1042 Asscher", "Gem 02 ND1042 Elongated Cushion", "Gem 02 ND1042 Elongated Radiant", "Gem 02 ND1042 Emerald", "Gem 02 ND1042 Marquise", "Gem 02 ND1042 Oval", "Gem 02 ND1042 Square Radiant", "Gem 03 ND1042 Asscher", "Gem 03 ND1042 Elongated Cushion", "Gem 03 ND1042 Elongated Radiant", "Gem 03 ND1042 Emerald", "Gem 03 ND1042 Marquise", "Gem 03 ND1042 Oval", "Gem 03 ND1042 Square Radiant"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('nd1042/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built ND1042: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
