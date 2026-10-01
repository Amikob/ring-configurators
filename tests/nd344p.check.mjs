import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SHAPES, COLORS, createCatalog, resolveSelection, MATERIAL_TARGETS } from '../nd344p/catalog.js';
const project = JSON.parse(fs.readFileSync(new URL('../nd344p/project.json', import.meta.url)));
const components = project.plugins.RingConfigurator.components;
const rings = components.find(c => c.name === 'Ring').variations;
const bands = components.find(c => c.name === 'Band').variations;
assert.equal(rings.length, 40);
assert.equal(bands.length, 4);
const catalog = createCatalog(rings, bands);
let combinations = 0;
for (const shape of SHAPES) for (let carat = 1; carat <= 5; carat++) {
  for (const band of ['none', 'plain', 'pave']) for (const headGold of COLORS) {
    for (const ringGold of COLORS) for (const bandGold of COLORS) {
      const result = resolveSelection(catalog, { shape, carat, band, headGold, ringGold, bandGold });
      assert.equal(result.ring.carat, carat);
      if (result.band) assert.equal(result.band.carat, carat <= 3 ? 1 : 4);
      combinations++;
    }
  }
}
assert.throws(() => createCatalog([...rings, rings[0]], bands));
assert.throws(() => createCatalog(rings.slice(1), bands));
assert.throws(() => createCatalog(rings, bands.slice(1)));
const groups = project.plugins.materialConfiguratorPlugin.variations;
assert.deepEqual(groups.map(g => g.uuid), [MATERIAL_TARGETS.headGold, MATERIAL_TARGETS.ringGold, MATERIAL_TARGETS.bandGold]);
const ids = groups.flatMap(g => g.materials.map(m => m.uuid));
assert.equal(new Set(ids).size, ids.length, 'Metal zones must not share mutable materials');
for (const shape of SHAPES) assert(fs.existsSync(new URL(`../nd344p/assets/shapes/${shape}.png`, import.meta.url)));
console.log(`ND344P: ${combinations} combinations; 44 model options; independent material IDs; all shape assets verified.`);
