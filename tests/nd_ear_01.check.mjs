import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHAPES, CARATS, MISSING, available, EAST_WEST, COLORS, createCatalog, resolveSelection} from '../nd_ear_01/catalog.js';
import {applySavedScene} from '../nd_ear_01/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../nd_ear_01/project.json', import.meta.url)));
const variations = project.plugins.RingConfigurator.components.find(item => item.name === 'Ring').variations;
assert.equal(variations.length, 120);
assert.equal(project.plugins.RingConfigurator.components[0].rotation.y, 0);
const savedCfg = JSON.parse(JSON.parse(fs.readFileSync(new URL('../nd_ear_01/saved-config.json', import.meta.url))).config);
assert.equal(savedCfg.plugins.RingConfigurator.components[0].rotation.y, 0);
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
assert.equal(combinations, 702);
assert.equal(MISSING.size, 0);
assert.equal(EAST_WEST.size, 7);
for (const shape of EAST_WEST) for (const carat of CARATS) assert.match(resolveSelection(catalog, {shape, carat, orientation: 'ew', headGold: 'white', ringGold: 'white'}).ring.variation.name, / Regular$/);
assert.throws(() => resolveSelection(catalog, {shape: 'round', carat: 1, orientation: 'ew', headGold: 'white', ringGold: 'white'}));
assert.deepEqual(project.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid), ['Metal 01']);
const gems = project.materialConfig.mapping.filter(item => /^Gem (\d+ |Hidden_old)/.test(item.name));
assert.equal(gems.length, 13);
assert(project.modelUrl.startsWith('https://amikob.ijewel3d.com/files/'));
const saved = {plugins: {RingConfigurator: project.plugins.RingConfigurator}, sceneConfig: {type: 'PresetLibraryPlugin'}};
const merged = applySavedScene(project, {config: JSON.stringify(saved)});
assert.deepEqual(merged.materialConfig, project.materialConfig);
assert(fs.readFileSync(new URL('../nd_ear_01/app.js', import.meta.url), 'utf8').includes('faceFront(model);'));
const html = fs.readFileSync(new URL('../nd_ear_01/index.html', import.meta.url), 'utf8');
assert(html.includes("ND_EAR_01"));
for (const shape of SHAPES) assert(fs.existsSync(new URL(`../nd_ear_01/assets/shapes/${shape}.png`, import.meta.url)));
console.log('ND_EAR_01: 120 models (42 Regular), 702 valid shape/carat/gold selections, 13 diamond layers mapped.');
