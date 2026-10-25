// Builds valeria/project.json: committed baseline (scene, metals, try-on) + the v2 iJewel configurator (Ring + Band components).
// Refresh: curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/FO2uB8T7SpS24EJg1qvOkg?select=id,name,file,config' > tools/snapshots/valeria-public.json ; node tools/build-valeria-project.mjs
// Bands are matched by NAME (iJewel lists components alphabetically, not in upload order).
import fs from 'node:fs';
const CFG = {"slug": "valeria", "name": "Valeria", "ring": 40, "band": 1, "metals": ["Metal 01", "Metal 03"], "onetone": true, "gems": ["Gem 01 ND312 Asscher", "Gem 01 ND312 Elongated Cushion", "Gem 01 ND312 Elongated Radiant", "Gem 01 ND312 Emerald", "Gem 01 ND312 Oval", "Gem 01 ND312 Round", "Gem 01 ND312 Square Cushion", "Gem 01 ND312 Square Radiant", "Gem 02 ND312 Asscher", "Gem 02 ND312 Elongated Cushion", "Gem 02 ND312 Elongated Radiant", "Gem 02 ND312 Emerald", "Gem 02 ND312 Oval", "Gem 02 ND312 Round", "Gem 02 ND312 Square Cushion", "Gem 02 ND312 Square Radiant", "Gem 03 ND312 Asscher", "Gem 03 ND312 Elongated Cushion", "Gem 03 ND312 Elongated Radiant", "Gem 03 ND312 Emerald", "Gem 03 ND312 Oval", "Gem 03 ND312 Round", "Gem 03 ND312 Square Cushion", "Gem 03 ND312 Square Radiant", "Gem 03"]};
const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('tools/snapshots/valeria-baseline.json');
const native = read('tools/snapshots/valeria-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const ring = source?.components?.find(c => c.name === 'Ring');
const band = source?.components?.find(c => c.name === 'Band');
if (!ring || ring.variations.length !== CFG.ring) throw new Error(`Expected ${CFG.ring} ring variations, found ${ring?.variations.length}`);
if (!band || band.variations.length !== CFG.band) throw new Error(`Expected ${CFG.band} band variations, found ${band?.variations.length}`);
const oldBand = baseline.plugins.RingConfigurator.components.find(c => c.name === 'Band');
ring.visible = true;
ring.selectedIndex = ring.variations.findIndex(v => v.name === '3Ct Oval');
if (ring.selectedIndex < 0) throw new Error('Missing 3Ct Oval default');
band.visible = oldBand.visible;
band.selectedIndex = 0;
baseline.plugins.RingConfigurator = { ...source, components: [ring, band] };
// Metal groups: keep only the groups this page uses (verified roles in the v2 GLBs).
const materials = baseline.plugins.materialConfiguratorPlugin;
const kept = CFG.metals.map(uuid => materials.variations.find(v => v.uuid === uuid));
if (kept.some(v => !v)) throw new Error('Baseline metal group missing');
if (CFG.onetone) kept.find(v => v.uuid === 'Metal 01').title = 'Gold';
materials.variations = kept;
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(m => m.name.startsWith('Gem 0'))?.path;
const metal = mapping.find(m => m.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');
baseline.materialConfig.mapping = [...CFG.metals.map(name => ({ name, path: metal })), ...CFG.gems.map(name => ({ name, path: diamond }))];
baseline.name = baseline.name || CFG.name;
baseline.basePath = 'https://amikob.ijewel3d.com/files/';
let out = JSON.stringify(baseline, null, 2);
fs.writeFileSync(new URL('valeria/project.json', root), out);
console.log(`Built ${CFG.name}: ${ring.variations.length} rings, ${band.variations.length} bands, metals ${CFG.metals.join('/')}, ${CFG.gems.length} diamond layers.`);
