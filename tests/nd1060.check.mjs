import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHAPES, CARATS, MISSING, available, EAST_WEST, COLORS, createCatalog, resolveSelection} from '../nd1060/catalog.js';
import {applySavedScene} from '../nd1060/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../nd1060/project.json', import.meta.url)));
const variations = project.plugins.RingConfigurator.components.find(item => item.name === 'Ring').variations;
assert.equal(variations.length, 70);
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
assert.equal(EAST_WEST.size, 6);
for (const shape of EAST_WEST) for (const carat of CARATS) assert.equal(resolveSelection(catalog, {shape, carat, orientation: 'ew', headGold: 'white', ringGold: 'white'}).ring.orientation, 'ew');
assert.throws(() => resolveSelection(catalog, {shape: 'round', carat: 1, orientation: 'ew', headGold: 'white', ringGold: 'white'}));
assert.deepEqual(project.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid), ["Metal 01", "Metal 02"]);
const gems = project.materialConfig.mapping.filter(item => /^Gem (\d+ |Hidden_old)/.test(item.name));
assert.equal(gems.length, 8);
assert(project.modelUrl.startsWith('https://amikob.ijewel3d.com/files/'));
const saved = {plugins: {RingConfigurator: project.plugins.RingConfigurator}, sceneConfig: {type: 'PresetLibraryPlugin'}};
const merged = applySavedScene(project, {config: JSON.stringify(saved)});
assert.deepEqual(merged.materialConfig, project.materialConfig);
const html = fs.readFileSync(new URL('../nd1060/index.html', import.meta.url), 'utf8');
assert(html.includes("ND1060"));
for (const shape of SHAPES) assert(fs.existsSync(new URL(`../nd1060/assets/shapes/${shape}.png`, import.meta.url)));
console.log('ND1060: 70 models, 360 valid shape/carat/gold selections, 8 diamond layers mapped.');
