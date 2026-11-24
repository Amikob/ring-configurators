import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MODELS, MODEL_IDS, SIZES, COLORS, createCatalog, resolveSelection, parseBand} from '../ndw200/catalog.js';
import {applySavedScene, coerceTryonConfig} from '../ndw200/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../ndw200/project.json', import.meta.url)));
const component = project.plugins.RingConfigurator.components.find(item => item.name === 'model')
  || project.plugins.RingConfigurator.components[0];
const variations = component.variations;
assert.equal(variations.length, 30);
const catalog = createCatalog(variations);
let combinations = 0;
for (const model of MODEL_IDS) for (const size of SIZES) for (const ringGold of COLORS) {
  const {band} = resolveSelection(catalog, {model, size, ringGold});
  assert.equal(band.model, model);
  assert.equal(band.size, size);
  combinations++;
}
assert.equal(combinations, 90);
assert.equal(parseBand({name: 'NDW201_Large.glb'}).size, 'Large');
assert.equal(parseBand({name: 'NDW210_Small.glb'}).model, 'NDW210');
assert(variations.some(item => String(item.modelUrl || '').includes('ndw201_large_8a28179050')));
assert.equal(project.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid).join(), 'Metal 01');
assert.deepEqual(project.materialConfig.mapping.map(item => item.name).sort(), ['Gem 01', 'Metal 01']);
assert(project.modelUrl.startsWith('https://amikob.ijewel3d.com/files/'));
assert.equal(project.tryonConfig.enabled, true);
assert.notEqual(project.tryonConfig.modelScaleFactor, 0.0591748834393557);

const savedFile = JSON.parse(fs.readFileSync(new URL('../ndw200/saved-config.json', import.meta.url)));
assert.equal(savedFile.id, 'c5uGqTrFQXabBQW4LX9Zng');
const merged = applySavedScene(project, savedFile);
assert.equal(merged.plugins.RingConfigurator.components[0].variations.length, 30);
assert.deepEqual(merged.materialConfig, project.materialConfig);
const playground = {
  plugins: {
    RingConfigurator: project.plugins.RingConfigurator,
    SimpleBackgroundEnvUiPlugin2: { type: 'SimpleBackgroundEnvUiPlugin2', tonemapBackground: true, tonemapGround: true }
  },
  sceneConfig: { type: 'PresetLibraryPlugin', Environment: { name: 'env-metal-001.hdr' } },
  cameraConfig: { position: { x: 0, y: 0, z: 3 } },
  materialConfig: { mapping: [{ name: 'Gem 01', path: 'generic' }] },
  tryonConfig: {
    enabled: true,
    modelScaleFactor: String(project.tryonConfig.modelScaleFactor),
    modelPosition: { x: 0, y: '0', z: '0', isVector3: true },
    modelRotation: { x: 1.5707963267948963, y: 0, z: 0, isVector3: true },
    ssr: { enabled: true, intensity: '1.5', radius: 2, tolerance: 5 },
    ssao: { enabled: false, intensity: 0.2 }
  }
};
const afterPlayground = applySavedScene(project, { config: playground });
assert.deepEqual(afterPlayground.sceneConfig, project.sceneConfig);
assert.deepEqual(afterPlayground.cameraConfig, project.cameraConfig);
assert.deepEqual(afterPlayground.materialConfig, project.materialConfig);
assert.equal(typeof afterPlayground.tryonConfig.modelScaleFactor, 'number');

const html = fs.readFileSync(new URL('../ndw200/index.html', import.meta.url), 'utf8');
assert(html.includes('NDW200'));
assert(html.includes('data-slug="ndw200"'));
const app = fs.readFileSync(new URL('../ndw200/app.js', import.meta.url), 'utf8');
assert(app.includes("PROJECT_ID = 'c5uGqTrFQXabBQW4LX9Zng'"));
assert(app.includes('shared/portal-settings.js'));
console.log('NDW200: 30 bands, 90 valid model/size/gold selections, Gem 01 + Metal 01 mapped.');
