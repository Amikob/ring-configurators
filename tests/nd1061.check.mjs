import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHAPES, EAST_WEST, COLORS, createCatalog, resolveSelection} from '../nd1061/catalog.js';
import {normalizePose} from '../nd1061/ring-pose.js';
import {applySavedScene} from '../nd1061/saved-project.js';

const project = JSON.parse(fs.readFileSync(new URL('../nd1061/project.json', import.meta.url)));
const variations = project.plugins.RingConfigurator.components.find(item => item.name === 'Ring').variations;
const catalog = createCatalog(variations);
let combinations = 0;
for (const shape of SHAPES) for (let carat = 1; carat <= 5; carat++) {
  for (const orientation of EAST_WEST.has(shape) ? ['ns','ew'] : ['ns']) {
    for (const headGold of COLORS) for (const ringGold of COLORS) {
      const {ring} = resolveSelection(catalog,{shape,carat,orientation,headGold,ringGold});
      assert.equal(ring.carat,carat);
      assert.equal(ring.orientation,orientation);
      combinations++;
    }
  }
}
assert.equal(variations.length,70);
assert.equal(combinations,630);
assert.equal(normalizePose({shape:'oval',carat:4,orientation:'ew',pose:'flat'}).pose,'flat');
assert.deepEqual(project.plugins.materialConfiguratorPlugin.variations.map(item => item.uuid), ['Metal 01','Metal 02']);
assert.equal(project.materialConfig.mapping.filter(item => item.name.startsWith('Gem 01 ND1061 ')).length,8);
const saved = {plugins:{RingConfigurator:project.plugins.RingConfigurator},sceneConfig:{type:'PresetLibraryPlugin'}};
const merged = applySavedScene(project,{config:JSON.stringify(saved)});
assert.deepEqual(merged.sceneConfig,saved.sceneConfig);
assert.deepEqual(merged.materialConfig,project.materialConfig);
assert.deepEqual(merged.plugins.materialConfiguratorPlugin,project.plugins.materialConfiguratorPlugin);
const html = fs.readFileSync(new URL('../nd1061/index.html', import.meta.url), 'utf8');
assert.equal((html.match(/data-quality=/g) || []).length,3);
assert(!html.includes('<select id="quality"'));
assert(html.includes('class="viewer-footer"'));
for (const shape of SHAPES) {
  assert(fs.existsSync(new URL(`../nd1061/assets/shapes/${shape}.png`, import.meta.url)));
}
console.log('ND1061: 70 models, 630 valid shape/carat/orientation/gold selections.');
