import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHAPES, CARATS, MISSING, available, EAST_WEST, COLORS, createCatalog, resolveSelection} from '../alana/catalog.js';
import {applySavedScene} from '../alana/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../alana/project.json', import.meta.url)));
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
assert.throws(() => resolveSelection(catalog, {shape: 'oval', carat: 1, orientation: 'ew', headGold: 'white', ringGold: 'white'}));
assert.deepEqual(project.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid), ["Metal 01", "Metal 02"]);
const gems = project.materialConfig.mapping.filter(item => / Alana /.test(item.name));
assert.equal(gems.length, 20);
assert(project.modelUrl.startsWith('https://amikob.ijewel3d.com/files/'));
const saved = {plugins: {RingConfigurator: project.plugins.RingConfigurator}, sceneConfig: {type: 'PresetLibraryPlugin'}};
const merged = applySavedScene(project, {config: JSON.stringify(saved)});
assert.deepEqual(merged.materialConfig, project.materialConfig);
const html = fs.readFileSync(new URL('../alana/index.html', import.meta.url), 'utf8');
assert(html.includes("Alana"));
assert(!/336|1061|1046/.test(html + fs.readFileSync(new URL('../alana/app.js', import.meta.url), 'utf8')));
for (const shape of SHAPES) assert(fs.existsSync(new URL(`../alana/assets/shapes/${shape}.png`, import.meta.url)));
console.log('Alana: 40 models, 360 valid shape/carat/gold selections, 20 diamond layers mapped.');
