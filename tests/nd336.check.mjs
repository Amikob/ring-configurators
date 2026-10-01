import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHAPES, EAST_WEST, COLORS, createCatalog, resolveSelection} from '../nd336/catalog.js';
import {applySavedScene} from '../nd336/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../nd336/project.json', import.meta.url)));
const variations = project.plugins.RingConfigurator.components.find(item => item.name === 'Ring').variations;
assert.equal(variations.length, 40);
const catalog = createCatalog(variations);
let combinations = 0;
for (const shape of SHAPES) for (let carat = 1; carat <= 5; carat++) {
  for (const headGold of COLORS) for (const ringGold of COLORS) {
    const {ring} = resolveSelection(catalog, {shape, carat, orientation: 'ns', headGold, ringGold});
    assert.equal(ring.shape, shape);
    assert.equal(ring.carat, carat);
    combinations++;
  }
}
assert.equal(combinations, 360);
assert.equal(EAST_WEST.size, 0);
assert.throws(() => resolveSelection(catalog, {shape: 'oval', carat: 1, orientation: 'ew', headGold: 'white', ringGold: 'white'}));
assert.deepEqual(project.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid), ['Metal 01', 'Metal 02']);
const gems = project.materialConfig.mapping.filter(item => / ND336 /.test(item.name));
assert.equal(gems.length, 25);
assert(project.modelUrl.startsWith('https://amikob.ijewel3d.com/files/'));
const saved = {plugins: {RingConfigurator: project.plugins.RingConfigurator}, sceneConfig: {type: 'PresetLibraryPlugin'}};
const merged = applySavedScene(project, {config: JSON.stringify(saved)});
assert.deepEqual(merged.materialConfig, project.materialConfig);
const html = fs.readFileSync(new URL('../nd336/index.html', import.meta.url), 'utf8');
assert(html.includes('ND336'));
assert(!/1061/.test(html + fs.readFileSync(new URL('../nd336/app.js', import.meta.url), 'utf8')));
for (const shape of SHAPES) assert(fs.existsSync(new URL(`../nd336/assets/shapes/${shape}.png`, import.meta.url)));
console.log('ND336: 40 models, 360 valid shape/carat/gold selections, 25 diamond layers mapped.');
