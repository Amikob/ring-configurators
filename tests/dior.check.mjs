import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applySavedScene} from '../dior/saved-project.js';
import {SHAPES,COLORS,createCatalog,resolveSelection} from '../dior/catalog.js';
const project=JSON.parse(fs.readFileSync(new URL('../dior/project.json',import.meta.url)));
const components=project.plugins.RingConfigurator.components;
const catalog=createCatalog(components.find(c=>c.name==='Ring').variations,components.find(c=>c.name==='Band').variations);
assert.equal(catalog.rings.size,40);assert.equal(catalog.bands.size,4);
for(const shape of SHAPES)for(let carat=1;carat<=5;carat++)for(const band of ['none','plain','pave'])for(const headGold of COLORS)for(const ringGold of COLORS)for(const bandGold of COLORS){
  const result=resolveSelection(catalog,{shape,carat,band,headGold,ringGold,bandGold});
  assert.equal(result.ring.shape,shape);
  if(band!=='none')assert.equal(result.band.carat,carat<=3?1:4);
}
const groups=project.plugins.materialConfiguratorPlugin.variations;
assert.deepEqual(groups.map(g=>[g.title,g.uuid]),[['Head gold','Metal 02'],['Shank gold','Metal 01'],['Band gold','Metal 03']]);
assert.equal(new Set(groups.flatMap(g=>g.materials.map(m=>m.uuid))).size,9);
assert.equal(project.tryonConfig.enabled,true);
const saved={sceneConfig:{test:'saved'},tryonConfig:{enabled:true,modelScaleFactor:0.057736},plugins:{RingConfigurator:project.plugins.RingConfigurator,SimpleBackgroundEnvUiPlugin2:{tonemapBackground:false}}};
const merged=applySavedScene(project,{config:JSON.stringify(saved)});
assert.deepEqual(merged.sceneConfig,saved.sceneConfig);
assert.deepEqual(merged.tryonConfig,saved.tryonConfig);
assert.deepEqual(merged.plugins.materialConfiguratorPlugin,project.plugins.materialConfiguratorPlugin);
assert.throws(()=>applySavedScene(project,{config:'{}'}));
console.log('3240 selections, four band variants, independent materials and Try-On configuration verified.');
