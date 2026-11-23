import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHAPES, CARATS, MISSING, available, EAST_WEST, COLORS, createCatalog, resolveSelection} from '../aimi/catalog.js';
import {applySavedScene, coerceTryonConfig} from '../aimi/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../aimi/project.json', import.meta.url)));
const variations = project.plugins.RingConfigurator.components.find(item => item.name === 'Ring').variations;
assert.equal(variations.length, 40);
const catalog = createCatalog(variations);
let combinations = 0;
for (const shape of SHAPES) for (const carat of CARATS) {
  if (!available(shape, carat)) { assert.throws(() => resolveSelection(catalog, {shape, carat, orientation: 'ns', headGold: 'white', ringGold: 'white'})); continue; }
  for (const headGold of COLORS) for (const ringGold of COLORS) {
    const {ring} = resolveSelection(catalog, {shape, carat, orientation: 'ns', headGold, ringGold});
    assert.equal(ring.shape, shape);
    assert.equal(ring.carat, carat);
    combinations++;
  }
}
assert.equal(combinations, 360);
assert.equal(MISSING.size, 0);
assert.equal(EAST_WEST.size, 0);
assert.throws(() => resolveSelection(catalog, {shape: 'oval', carat: 3, orientation: 'ew', headGold: 'white', ringGold: 'white'}));
assert.deepEqual(project.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid), ["Metal 01", "Metal 02", "Metal 03", "Metal 04"]);
const gems = project.materialConfig.mapping.filter(item => /^Gem (\d+ |Hidden_old)/.test(item.name));
assert.equal(gems.length, 24);
assert(project.modelUrl.startsWith('https://amikob.ijewel3d.com/files/'));
const saved = {plugins: {RingConfigurator: project.plugins.RingConfigurator}, sceneConfig: {type: 'PresetLibraryPlugin'}};
const merged = applySavedScene(project, {config: JSON.stringify(saved)});
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
    modelScaleFactor: '0.057735999944336154',
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
assert.equal(afterPlayground.plugins.SimpleBackgroundEnvUiPlugin2.tonemapBackground, project.plugins.SimpleBackgroundEnvUiPlugin2.tonemapBackground);
assert.equal(typeof afterPlayground.tryonConfig.modelScaleFactor, 'number');
assert.equal(afterPlayground.tryonConfig.modelScaleFactor, 0.057735999944336154);
assert.equal(typeof afterPlayground.tryonConfig.modelPosition.y, 'number');
assert.equal(afterPlayground.tryonConfig.modelPosition.y, 0);

const html = fs.readFileSync(new URL('../aimi/index.html', import.meta.url), 'utf8');
assert(html.includes("Aimi"));
for (const shape of SHAPES) assert(fs.existsSync(new URL(`../aimi/assets/shapes/${shape}.png`, import.meta.url)));
console.log('Aimi: 40 models, 360 valid shape/carat/gold selections, 24 diamond layers mapped.');
