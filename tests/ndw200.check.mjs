import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ETERNITIES, MODELS, MODEL_IDS, SIZES, COLORS, createCatalog, resolveSelection, parseBand} from '../ndw200/catalog.js';
import {applySavedScene, coerceTryonConfig} from '../ndw200/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../ndw200/project.json', import.meta.url)));
const projectHalf = JSON.parse(fs.readFileSync(new URL('../ndw200/project-half.json', import.meta.url)));
const component = project.plugins.RingConfigurator.components.find(item => item.name === 'model')
  || project.plugins.RingConfigurator.components[0];
const halfComponent = projectHalf.plugins.RingConfigurator.components.find(item => item.name === 'model')
  || projectHalf.plugins.RingConfigurator.components[0];
const variations = component.variations;
const halfVariations = halfComponent.variations;
assert.equal(variations.length, 30);
assert.equal(halfVariations.length, 30);

const catalog = createCatalog(variations, halfVariations);
let combinations = 0;
for (const eternity of ETERNITIES) for (const model of MODEL_IDS) for (const size of SIZES) for (const ringGold of COLORS) {
  const {band} = resolveSelection(catalog, {eternity, model, size, ringGold});
  assert.equal(band.eternity, eternity);
  assert.equal(band.model, model);
  assert.equal(band.size, size);
  combinations++;
}
assert.equal(combinations, 180);
assert.equal(parseBand({name: 'NDW201_Large.glb'}).size, 'Large');
assert.equal(parseBand({name: 'NDW210_Small.glb'}).model, 'NDW210');
assert(variations.some(item => String(item.modelUrl || '').includes('ndw201_large_0fa24d2297')));
assert(variations.some(item => String(item.modelUrl || '').includes('ndw210_large_bf04f16350')));
assert(halfVariations.some(item => String(item.modelUrl || '').includes('ndw210_large_0ccb445bf7')));

for (const proj of [project, projectHalf]) {
  assert.equal(proj.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid).join(), 'Metal 01');
  assert.deepEqual(proj.materialConfig.mapping.map(item => item.name).sort(), ['Gem 01', 'Metal 01']);
  assert(proj.modelUrl.startsWith('https://amikob.ijewel3d.com/files/'));
  assert.equal(proj.tryonConfig.enabled, true);
  assert.notEqual(Number(proj.tryonConfig.modelScaleFactor), 0.0591748834393557);
}

const savedFile = JSON.parse(fs.readFileSync(new URL('../ndw200/saved-config.json', import.meta.url)));
assert.equal(savedFile.id, 'c5uGqTrFQXabBQW4LX9Zng');
const merged = applySavedScene(project, savedFile);
assert.equal(merged.plugins.RingConfigurator.components[0].variations.length, 30);
assert.deepEqual(merged.materialConfig, project.materialConfig);

const savedHalf = JSON.parse(fs.readFileSync(new URL('../ndw200/saved-config-half.json', import.meta.url)));
assert.equal(savedHalf.id, 'KsE7dviHTLiPyTH-usxqIg');
const mergedHalf = applySavedScene(projectHalf, savedHalf);
assert.equal(mergedHalf.plugins.RingConfigurator.components[0].variations.length, 30);
assert.equal(typeof mergedHalf.tryonConfig.modelScaleFactor, 'number');
assert.equal(mergedHalf.tryonConfig.modelScaleFactor, 0.06052425738648934);
assert.deepEqual(mergedHalf.materialConfig, projectHalf.materialConfig);

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
assert(html.includes('id="eternities"'));
assert(html.includes('../shared/shape-row.css?v=shaperow-3'));
assert(html.includes('../shared/shape-row.js?v=shaperow-3'));
const app = fs.readFileSync(new URL('../ndw200/app.js', import.meta.url), 'utf8');
assert(app.includes("PROJECT_ID = 'c5uGqTrFQXabBQW4LX9Zng'"));
assert(app.includes("HALF_PROJECT_ID = 'KsE7dviHTLiPyTH-usxqIg'"));
assert(app.includes('shared/portal-settings.js'));
console.log('NDW200: 30 Full + 30 Half bands, 180 valid eternity/model/size/gold selections, Gem 01 + Metal 01 mapped.');
