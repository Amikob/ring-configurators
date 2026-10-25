// Builds bn_alexlee/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live BN_AlexLee iJewel configurator saved at tools/snapshots/bn_alexlee-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/KnyeLAqwTliwlsAMag2Rjg?select=id,name,file,config' > tools/snapshots/bn_alexlee-public.json
// then run: node tools/build-bn_alexlee-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/bn_alexlee-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 35) throw new Error(`Expected 35 BN_AlexLee ring variations, found ${ring?.variations.length}`);

ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(item => item.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
baseline.name = "BN_AlexLee";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// Metal 01 = head, Metal 02 = shank (verified in the downloaded GLBs).
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
// Source files: Metal 01 = SHANK (constant mesh, thin), Metal 02 = HEAD (variable) on every ring -> swap UI titles.
materials.variations.find(v => v.uuid === 'Metal 01').title = 'Shank gold';
materials.variations.find(v => v.uuid === 'Metal 02').title = 'Head gold';
// LAYER ROLES (redone files): head=Metal 02, shank=('Metal 01', 'Metal 03') by default; per-ring overrides in app.js LAYER_ROLES. One UI group per metal layer actually used.
{ const tpl = materials.variations.find(v => v.uuid === 'Metal 01');
  const USED = ["Metal 01", "Metal 02", "Metal 03"]; const HEAD = 'Metal 02', SHANK = ["Metal 01", "Metal 03"];  // SHANK may be one layer or a list (shank split over several metal layers)
  const SHANK1 = [].concat(SHANK)[0];
  materials.variations = USED.map(u => ({ ...structuredClone(tpl), uuid: u, title: u === HEAD ? 'Head gold' : u === SHANK1 ? 'Shank gold' : `Extra gold (${u})` })); }
const USED_METALS = ["Metal 01", "Metal 02", "Metal 03"];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// BN_AlexLee has only a center stone per ring: layer "Gem 01 BN_AlexLee <Shape>".
const SHAPES = ['Round', 'Oval', 'Elongated Cushion', 'Elongated Radiant', 'Emerald', 'Marquise', 'Pear'];
baseline.materialConfig.mapping = USED_METALS.map(name => ({ name, path: metal }));
for (const name of ["Gem 01 BN_AlexLee Elongated Cushion", "Gem 01 BN_AlexLee Elongated Radiant", "Gem 01 BN_AlexLee Emerald", "Gem 01 BN_AlexLee Marquise", "Gem 01 BN_AlexLee Oval", "Gem 01 BN_AlexLee Pear", "Gem 01 BN_AlexLee Round", "Gem Hidden_old"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 BN_AlexLee Elongated Cushion", "Gem 01 BN_AlexLee Elongated Radiant", "Gem 01 BN_AlexLee Emerald", "Gem 01 BN_AlexLee Marquise", "Gem 01 BN_AlexLee Oval", "Gem 01 BN_AlexLee Pear", "Gem 01 BN_AlexLee Round", "Gem Hidden_old"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('bn_alexlee/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built BN_AlexLee: ${ring.variations.length} rings, head/shank gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
