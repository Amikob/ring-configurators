// Builds ariella/project.json: nd344p baseline (scene, metals, try-on) + the Ariella iJewel configurator (Ring + ONE Band component).
// Source config: tools/snapshots/ariella-public.json (same file as ariella/saved-config.json). Run: node tools/build-ariella-project.mjs
import fs from 'node:fs';
const CFG = {"slug": "ariella", "name": "Ariella", "ring": 40, "band": 1, "metals": ["Metal 03", "Metal 01"], "gems": ["Gem 01 Ariella Elongated Cushion", "Gem 01 Ariella Elongated Radiant", "Gem 01 Ariella Emerald", "Gem 01 Ariella Marquise", "Gem 01 Ariella Oval", "Gem 01 Ariella Pear", "Gem 01 Ariella Round", "Gem 01 Ariella Square Cushion", "Gem 03 Ariella Elongated Cushion", "Gem 03 Ariella Elongated Radiant", "Gem 03 Ariella Emerald", "Gem 03 Ariella Marquise", "Gem 03 Ariella Oval", "Gem 03 Ariella Pear", "Gem 03 Ariella Round", "Gem 03 Ariella Square Cushion", "Gem 03"]};
const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('tools/snapshots/ariella-baseline.json');
const native = read('tools/snapshots/ariella-public.json');
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
// Metal groups: Metal 03 = head, Metal 01 = shank AND the band (the band GLB has Metal 01 only).
const materials = baseline.plugins.materialConfiguratorPlugin;
const kept = CFG.metals.map(uuid => materials.variations.find(v => v.uuid === uuid));
if (kept.some(v => !v)) throw new Error('Baseline metal group missing');
materials.variations = kept;
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(m => m.name.startsWith('Gem 0'))?.path;
const metal = mapping.find(m => m.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');
baseline.materialConfig.mapping = [...CFG.metals.map(name => ({ name, path: metal })), ...CFG.gems.map(name => ({ name, path: diamond }))];
baseline.name = baseline.name || CFG.name;
baseline.basePath = 'https://amikob.ijewel3d.com/files/';
fs.writeFileSync(new URL('ariella/project.json', root), JSON.stringify(baseline, null, 2));
console.log(`Built ${CFG.name}: ${ring.variations.length} rings, ${band.variations.length} band, metals ${CFG.metals.join('/')}, ${CFG.gems.length} diamond layers.`);
