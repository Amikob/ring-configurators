// Decode every .glb in <srcDir> (Draco too) into <dstDir>/<file>.json (+ .k.pos/.k.idx raw arrays) for slotcheck.py.
// Needs @gltf-transform/core, @gltf-transform/extensions and draco3dgltf under GT_DIR (default /workspace/gt).
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire((process.env.GT_DIR || '/workspace/gt') + '/');
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const draco3d = require('draco3dgltf');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const [,, src, dst] = process.argv; fs.mkdirSync(dst, { recursive: true });
console.warn = () => {};
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(`${src}/${f}`); const meta = []; let k = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    fs.writeFileSync(`${dst}/${f}.${k}.pos`, Buffer.from(new Float32Array(p.getAttribute('POSITION').getArray()).buffer));
    fs.writeFileSync(`${dst}/${f}.${k}.idx`, Buffer.from(Uint32Array.from(p.getIndices().getArray()).buffer));
    meta.push({ k, material: p.getMaterial()?.getName() || '' }); k++;
  }
  fs.writeFileSync(`${dst}/${f}.json`, JSON.stringify(meta));
}
