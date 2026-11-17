import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'fs';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [inDir, outDir] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const rest = JSON.parse(fs.readFileSync('rest.json')); let tot = 0; const manifest = [];
for (const f of fs.readdirSync(inDir).filter(f => f.endsWith('.glb')).sort()) {
  const doc = await io.read(`${inDir}/${f}`);
  const [, ct, shape] = f.match(/^(\d)_ct_(.+)\.glb$/);
  // one resting pose per shape (the 3 ct file's) so switching files never flips the ring
  doc.getRoot().listScenes()[0].setExtras({ units: 'mm', rest: rest[`3_ct_${shape}.glb`].rest, source: `iJewel ND336 ${f}` });
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 14, quantizeNormal: 10 }));
  await io.write(`${outDir}/${f}`, doc);
  tot += fs.statSync(`${outDir}/${f}`).size; manifest.push({ shape, carat: +ct, file: f });
}
fs.writeFileSync(`${outDir}/manifest.json`, JSON.stringify(manifest));
console.log('total MB', tot / 1e6);
