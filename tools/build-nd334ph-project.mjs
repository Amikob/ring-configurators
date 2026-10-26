// Builds nd334ph/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live ND334PH iJewel configurator saved at tools/snapshots/nd334ph-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/Zc_2AbYzQ8ObjUwhM8iXVg?select=id,name,file,config' > tools/snapshots/nd334ph-public.json
// then run: node tools/build-nd334ph-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/nd334ph-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 40) throw new Error(`Expected 40 ND334PH ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
baseline.name = "ND334PH";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// Metal 01 = head, Metal 02 = shank (verified in the downloaded GLBs).
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
// LAYER ROLES (redone files): head=Metal 01, shank=Metal 02 by default; per-ring overrides in app.js LAYER_ROLES. One UI group per metal layer actually used.
{ const tpl = materials.variations.find(v => v.uuid === 'Metal 01');
  const USED = ["Metal 01", "Metal 02", "Metal 03"]; const HEAD = 'Metal 01', SHANK = "Metal 02";  // SHANK may be one layer or a list (shank split over several metal layers)
  const SHANK1 = [].concat(SHANK)[0];
  materials.variations = USED.map(u => ({ ...structuredClone(tpl), uuid: u, title: u === HEAD ? 'Head gold' : u === SHANK1 ? 'Shank gold' : `Extra gold (${u})` })); }
const USED_METALS = ["Metal 01", "Metal 02", "Metal 03"];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// ND334PH has only a center stone per ring: layer "Gem 01 ND334PH <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Marquise', 'Pear', 'Square Cushion'];
baseline.materialConfig.mapping = USED_METALS.map(name => ({ name, path: metal }));
for (const name of ["Gem 01 ND334PH Elongated Cushion", "Gem 01 ND334PH Elongated Radiant", "Gem 01 ND334PH Emerald", "Gem 01 ND334PH Marquise", "Gem 01 ND334PH Oval", "Gem 01 ND334PH Pear", "Gem 01 ND334PH Round", "Gem 01 ND334PH Square Cushion"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 ND334PH Elongated Cushion", "Gem 01 ND334PH Elongated Radiant", "Gem 01 ND334PH Emerald", "Gem 01 ND334PH Marquise", "Gem 01 ND334PH Oval", "Gem 01 ND334PH Pear", "Gem 01 ND334PH Round", "Gem 01 ND334PH Square Cushion"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('nd334ph/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built ND334PH: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
