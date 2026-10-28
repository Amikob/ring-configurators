import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHAPES, CARATS, MISSING, available, bandAvailable, EAST_WEST, COLORS, createCatalog, resolveSelection} from '../alana/catalog.js';
import {applySavedScene} from '../alana/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../alana/project.json', import.meta.url)));
const variations = project.plugins.RingConfigurator.components.find(item => item.name === 'Ring').variations;
assert.equal(variations.length, 40);
const saved0 = JSON.parse(JSON.parse(fs.readFileSync(new URL('../alana/saved-config.json', import.meta.url))).config);
const comps = saved0.plugins.RingConfigurator.components;
assert.equal(comps.find(item => item.name === 'Ring').variations.length, 40);
const bandVars = comps.find(item => item.name === 'Band').variations;
assert.deepEqual(bandVars.map(item => item.name).sort(), ['Alana Band Elongated 3-5ct', 'Alana Band Elongated 6-8ct', 'Alana Band Round Pear Asscher 3-5ct']);
for (const item of bandVars) assert(item.modelUrl.startsWith('https://amikob.ijewel3d.com/files/') && item.modelUrl.endsWith('.glb'));
const catalog = createCatalog(comps.find(item => item.name === 'Ring').variations, bandVars);
let bandCombos = 0;
for (const shape of SHAPES) for (const carat of CARATS) {
  if (!available(shape, carat)) continue;
  const elongated = ['oval','elongated_cushion','elongated_radiant','emerald'].includes(shape);
  const expected = elongated ? (carat <= 5 ? 'alana band elongated 3-5ct' : 'alana band elongated 6-8ct') : (['round','pear','asscher'].includes(shape) && carat <= 5 ? 'alana band round pear asscher 3-5ct' : null);
  assert.equal(bandAvailable(shape, carat), !!expected, `${shape} ${carat}`);
  const {band} = resolveSelection(catalog, {shape, carat, orientation: 'ns', band: 'band', headGold: 'white', ringGold: 'white', bandGold: 'white'});
  if (expected) { assert.equal(band.variation.name.toLowerCase(), expected); bandCombos++; } else assert.equal(band, null);
  assert.equal(resolveSelection(catalog, {shape, carat, orientation: 'ns', band: 'none', headGold: 'white', ringGold: 'white', bandGold: 'white'}).band, null);
}
assert.equal(bandCombos, 29);
let combinations = 0;
for (const shape of SHAPES) for (const carat of CARATS) {
  if (!available(shape, carat)) { assert.throws(() => resolveSelection(catalog, {shape, carat, orientation: 'ns', band: 'none', headGold: 'white', ringGold: 'white', bandGold: 'white'})); continue; }
  for (const headGold of COLORS) for (const ringGold of COLORS) {
    const {ring} = resolveSelection(catalog, {shape, carat, orientation: 'ns', band: 'none', headGold, ringGold, bandGold: ringGold});
    assert.equal(ring.shape, shape);
    assert.equal(ring.carat, carat);
    combinations++;
  }
}
assert.equal(combinations, 360);
assert.equal(MISSING.size, 0);
assert.equal(EAST_WEST.size, 0);
assert.throws(() => resolveSelection(catalog, {shape: 'oval', carat: 3, orientation: 'ew', band: 'none', headGold: 'white', ringGold: 'white', bandGold: 'white'}));
assert.deepEqual(project.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid), ['Metal 01', 'Metal 03']);
const gems = project.materialConfig.mapping.filter(item => /^Gem (\d+ |Hidden_old)/.test(item.name));
assert.equal(gems.length, 16);
assert(project.materialConfig.mapping.some(item => item.name === 'Metal 03') && project.materialConfig.mapping.some(item => item.name === 'Gem 03'));
assert(project.modelUrl.startsWith('https://amikob.ijewel3d.com/files/'));
const saved = {plugins: {RingConfigurator: project.plugins.RingConfigurator}, sceneConfig: {type: 'PresetLibraryPlugin'}};
const merged = applySavedScene(project, {config: JSON.stringify(saved)});
assert.deepEqual(merged.materialConfig, project.materialConfig);
const html = fs.readFileSync(new URL('../alana/index.html', import.meta.url), 'utf8');
assert(html.includes("Alana"));
for (const shape of SHAPES) assert(fs.existsSync(new URL(`../alana/assets/shapes/${shape}.png`, import.meta.url)));
console.log('Alana: 40 models, 29 ring-with-band pairings, 360 valid shape/carat/gold selections, 16 diamond layers mapped.');
