// Builds ndw200/project.json and ndw200/saved-config.json from the ND336 baseline
// (scene, one-piece Metal 01 gold, diamond preset) plus the live NDW200 iJewel
// configurator saved at tools/snapshots/ndw200-public.json.
//
// Refresh the snapshot:
//   curl -s 'https://amikob.ijewel3d.com/api/raw/v1/files/view/c5uGqTrFQXabBQW4LX9Zng?select=id,name,file,config' > tools/snapshots/ndw200-public.json
// then run: node tools/build-ndw200-project.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const baseline = read('nd336/project.json');
const native = read('tools/snapshots/ndw200-public.json');
const config = typeof native.config === 'string' ? JSON.parse(native.config) : native.config;
const source = config?.plugins?.RingConfigurator;
const band = source?.components?.find(component => component.name === 'model' || component.name === 'Model' || component.name === 'Band' || component.name === 'Ring')
  || source?.components?.[0];
if (!band || band.variations.length !== 27) throw new Error(`Expected 27 NDW200 band variations, found ${band?.variations.length}`);

band.visible = true;
band.selectedIndex = band.variations.findIndex(item => String(item.name || '').replace(/\.(3dm|glb)$/i, '') === 'NDW201_Medium');
if (band.selectedIndex < 0) throw new Error('Missing NDW201_Medium default');
baseline.name = 'NDW200';
baseline.plugins.RingConfigurator = { ...source, components: [band] };

// One metal zone: Metal 01, driven by a single Band gold control.
const materials = baseline.plugins.materialConfiguratorPlugin;
if (materials.variations.map(v => v.uuid).join() !== 'Metal 01,Metal 02') throw new Error('Unexpected baseline metal groups');
materials.variations = [{ ...materials.variations[1], uuid: 'Metal 01', title: 'Band gold' }];
const mapping = baseline.materialConfig.mapping;
const diamond = mapping.find(item => item.name.startsWith('Gem 01 '))?.path;
const metal = mapping.find(item => item.name === 'Metal 01')?.path;
if (!diamond || !metal) throw new Error('Baseline material presets missing');

baseline.materialConfig.mapping = [
  { name: 'Metal 01', path: metal },
  { name: 'Gem 01', path: diamond },
];

baseline.basePath = 'https://amikob.ijewel3d.com/files/';
baseline.modelUrl = baseline.basePath + native.file;
// Keep the try-on fit saved on the published iJewel project (do not reuse Erica's size).
if (config.tryonConfig) baseline.tryonConfig = config.tryonConfig;

fs.writeFileSync(new URL('ndw200/project.json', root), JSON.stringify(baseline, null, 2));

const saved = {
  id: native.id,
  name: native.name || 'NDW200',
  file: native.file,
  meta: '{"type":"RingConfigurator","pub":true}',
  config: JSON.stringify({
    plugins: {
      RingConfigurator: baseline.plugins.RingConfigurator,
    },
    version: config.version,
    isDefault: config.isDefault,
    tryonConfig: config.tryonConfig,
  }),
};
fs.writeFileSync(new URL('ndw200/saved-config.json', root), JSON.stringify(saved, null, 2));
console.log(`Built NDW200: ${band.variations.length} bands, one Metal 01 gold, Gem 01 diamonds, try-on ${baseline.tryonConfig?.enabled ? 'on' : 'off'}.`);
