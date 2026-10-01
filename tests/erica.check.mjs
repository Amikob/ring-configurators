import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SHAPES,COLORS,GROUPS,createCatalog,resolveSelection,parseBand} from '../erica/catalog.js';
// Names as saved in the live iJewel Erica configurator (snapshot 2026-10-01).
const live=JSON.parse(fs.readFileSync(new URL('./fixtures-erica.json',import.meta.url)));
const rings=live.Ring.map(name=>({name}));
const bands=live.Band.map(name=>({name}));
assert.equal(rings.length,40);assert.equal(bands.length,22);
const catalog=createCatalog(rings,bands);
let count=0;
for(const shape of SHAPES)for(let carat=3;carat<=7;carat++)for(const band of ['none','plain','pave'])for(const ringGold of COLORS)for(const bandGold of COLORS){
  const result=resolveSelection(catalog,{shape,carat,band,ringGold,bandGold});
  assert.equal(result.ring.shape,shape);
  if(result.band){const b=parseBand(result.band.variation);assert.equal(b.group,GROUPS[shape]);assert.ok(b.min<=carat&&b.max>=carat);}
  count++;
}
assert.equal(resolveSelection(catalog,{shape:'emrld',carat:5,band:'plain',ringGold:'white',bandGold:'rose'}).band.variation,resolveSelection(catalog,{shape:'oval',carat:7,band:'plain',ringGold:'white',bandGold:'rose'}).band.variation);
console.log(`${count} combinations verified; 40 rings and 22 matching-band files.`);
