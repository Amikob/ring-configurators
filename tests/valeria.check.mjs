import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SHAPES, CARATS, COLORS, createCatalog, resolveSelection, MATERIAL_TARGETS, label } from '../valeria/catalog.js';
const project = JSON.parse(fs.readFileSync(new URL('../valeria/project.json', import.meta.url)));
const components = project.plugins.RingConfigurator.components;
const rings = components.find(c => c.name === 'Ring').variations;
const bands = components.find(c => c.name === 'Band').variations;
assert.equal(rings.length, 40);
assert.equal(bands.length, 1);
const catalog = createCatalog(rings, bands);
let combinations = 0;
for (const shape of SHAPES) for (const carat of CARATS) {
  for (const band of ['none', 'pave']) for (const headGold of COLORS) {
    for (const ringGold of COLORS) for (const bandGold of COLORS) {
      const result = resolveSelection(catalog, { shape, carat, band, headGold, ringGold, bandGold });
      assert.equal(result.ring.carat, carat);
      if (band === 'pave') assert.equal(result.band.variation.name, 'Valeria Pave Band'); else assert.equal(result.band, null);
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
for (const shape of SHAPES) assert(fs.existsSync(new URL(`../valeria/assets/shapes/${shape}.png`, import.meta.url)));
console.log(`Valeria: ${combinations} combinations; 41 model options; independent material IDs; all shape assets verified.`);
const mapped = project.materialConfig.mapping.map(m => m.name);
for (const n of ['Metal 01', 'Metal 02', 'Metal 03', 'Gem 03']) assert(mapped.includes(n), n);
for (const shape of SHAPES) assert(mapped.some(n => n === `Gem 01 Valeria ${label(shape).replace(/ (.)/g, (_, c) => ' ' + c.toUpperCase())}`), shape);
