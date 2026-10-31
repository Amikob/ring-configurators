// Builds nd_ear_03/project.json from the ND336 baseline (scene, metals, try-on defaults)
// plus the live ND_EAR_03 iJewel configurator saved at tools/snapshots/nd_ear_03-public.json.
//
// The iJewel item is a plain folder (config {}); the snapshot is built by tools/build-nd_ear_03-saved.py
// via /api/proxy/file-resolve?name=<file>.glb&scope=P1583E4oRj-j9DX_8niVaA.
// Old refresh (no longer works):
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/P1583E4oRj-j9DX_8niVaA?select=id,name,file,config' > tools/snapshots/nd_ear_03-public.json
// then run: node tools/build-nd_ear_03-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/nd_ear_03-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(component => component.name === 'Ring');
if (!ring || ring.variations.length !== 84) throw new Error(`Expected 84 ND_EAR_03 ring variations, found ${ring?.variations.length}`);

ring.visible = true;
// Earring files differ in orientation (stone toward -Z or +Z); app.js faceFront() turns each loaded file to face the camera.
ring.selectedIndex = ring.variations.findIndex(item => item.name === '1Ct Round');
if (ring.selectedIndex < 0) throw new Error('Missing 1Ct Round default');
baseline.name = "ND_EAR_03";
baseline.plugins.RingConfigurator = { ...source, components: [ring] };

// One-piece metal: everything is on Metal 01, driven by a single Gold control.
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
materials.variations = [{ ...materials.variations[1], uuid: 'Metal 01', title: 'Gold' }];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

// ND_EAR_03 has one stone per stud: layer "Gem 01 ND_EAR_03 <Shape>".
const SHAPES = ["Asscher", "Baguette", "Elongated Cushion", "Elongated Radiant", "Emerald", "Heart", "Marquise", "Oval", "Pear", "Princess", "Round", "Square Cushion", "Square Radiant", "Old Cut Cushion"];
baseline.materialConfig.mapping = ['Metal 01'].map(name => ({ name, path: metal }));
for (const name of ["Gem 01 ND_EAR_03 Asscher", "Gem 01 ND_EAR_03 Baguette", "Gem 01 ND_EAR_03 Elongated Cushion", "Gem 01 ND_EAR_03 Elongated Radiant", "Gem 01 ND_EAR_03 Emerald", "Gem 01 ND_EAR_03 Heart", "Gem 01 ND_EAR_03 Marquise", "Gem 01 ND_EAR_03 Oval", "Gem 01 ND_EAR_03 Pear", "Gem 01 ND_EAR_03 Princess", "Gem 01 ND_EAR_03 Round", "Gem 01 ND_EAR_03 Square Cushion", "Gem 01 ND_EAR_03 Square Radiant", "Gem 01 ND_EAR_03 Old Cut Cushion"]) baseline.materialConfig.mapping.push({ name, path: diamond });
if (SHAPES.some(s => !["Gem 01 ND_EAR_03 Asscher", "Gem 01 ND_EAR_03 Baguette", "Gem 01 ND_EAR_03 Elongated Cushion", "Gem 01 ND_EAR_03 Elongated Radiant", "Gem 01 ND_EAR_03 Emerald", "Gem 01 ND_EAR_03 Heart", "Gem 01 ND_EAR_03 Marquise", "Gem 01 ND_EAR_03 Oval", "Gem 01 ND_EAR_03 Pear", "Gem 01 ND_EAR_03 Princess", "Gem 01 ND_EAR_03 Round", "Gem 01 ND_EAR_03 Square Cushion", "Gem 01 ND_EAR_03 Square Radiant", "Gem 01 ND_EAR_03 Old Cut Cushion"].some(n => n.endsWith(' ' + s)))) throw new Error('Gem layer missing for a shape');

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
baseline.tryonConfig.modelPosition = { x: 0, y: 0, z: 0, isVector3: true };
fs.writeFileSync(new URL('nd_ear_03/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built ND_EAR_03: ${ring.variations.length} earrings, one-piece gold, ${baseline.materialConfig.mapping.length - 2} diamond layers.`);
