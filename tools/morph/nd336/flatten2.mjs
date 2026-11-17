// iJewel ND336 GLB (Draco, Y-up mm) -> plain GLB for nd336-morph:
//   metal_head (Metal 01), metal_band (Metal 02), gem (Gem 01 = centre stone), accent (Gem 02 hidden halo + Gem 03 band pave,
//   with a _STONE vertex attribute = stone index, so each small stone can move rigidly).
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf'; import fs from 'fs';
import { mat3, vec3 } from 'gl-matrix';
console.warn = () => {};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const [inDir, outDir] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const report = {};
for (const f of fs.readdirSync(inDir).filter(f => f.endsWith('.glb')).sort()) {
  const doc = await io.read(`${inDir}/${f}`);
  const acc = {}; const get = k => acc[k] ||= { p: [], n: [], i: [], s: [] };
  let stone = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const M = node.getWorldMatrix(), N = mat3.normalFromMat4(mat3.create(), M);
    for (const prim of mesh.listPrimitives()) {
      const mname = prim.getMaterial()?.getName() || '';
      const kind = /^Gem 01/i.test(mname) ? 'gem' : /^Gem/i.test(mname) ? 'accent' : /Metal 01/.test(mname) ? 'metal_head' : 'metal_band';
      const A = get(kind), base = A.p.length / 3;
      const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), idx = prim.getIndices(), n = pos.getCount();
      const v = [0, 0, 0], t = vec3.create();
      for (let k = 0; k < n; k++) {
        pos.getElement(k, v); vec3.transformMat4(t, v, M); A.p.push(t[0], t[1], t[2]);
        if (nor) { nor.getElement(k, v); vec3.transformMat3(t, v, N); vec3.normalize(t, t); A.n.push(t[0], t[1], t[2]); } else A.n.push(0, 1, 0);
      }
      const I = idx ? Array.from({ length: idx.getCount() }, (_, k) => idx.getScalar(k)) : Array.from({ length: n }, (_, k) => k);
      for (const k of I) A.i.push(base + k);
      if (kind === 'accent') {   // stones = connected components (vertices welded by position)
        const par = Int32Array.from({ length: n }, (_, k) => k), find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
        const key = new Map();
        for (let k = 0; k < n; k++) { const q = `${Math.round(A.p[3 * (base + k)] * 1e4)},${Math.round(A.p[3 * (base + k) + 1] * 1e4)},${Math.round(A.p[3 * (base + k) + 2] * 1e4)}`; if (key.has(q)) par[find(k)] = find(key.get(q)); else key.set(q, k); }
        for (let k = 0; k < I.length; k += 3) { par[find(I[k + 1])] = find(I[k]); par[find(I[k + 2])] = find(I[k]); }
        const ids = new Map();
        for (let k = 0; k < n; k++) { const r = find(k); if (!ids.has(r)) ids.set(r, stone++); A.s.push(ids.get(r)); }
      }
    }
  }
  const out = new Document(); const buf = out.createBuffer(); const scene = out.createScene();
  const mats = { metal_head: 'Metal 01', metal_band: 'Metal 02', gem: 'Gem 01', accent: 'Accent' };
  for (const kind of ['metal_head', 'metal_band', 'gem', 'accent']) {
    const A = acc[kind]; if (!A?.p.length) continue;
    const mat = out.createMaterial(mats[kind]).setMetallicFactor(kind.startsWith('metal') ? 1 : 0).setRoughnessFactor(0.1);
    const prim = out.createPrimitive().setMaterial(mat)
      .setAttribute('POSITION', out.createAccessor().setType('VEC3').setArray(new Float32Array(A.p)).setBuffer(buf))
      .setAttribute('NORMAL', out.createAccessor().setType('VEC3').setArray(new Float32Array(A.n)).setBuffer(buf))
      .setIndices(out.createAccessor().setType('SCALAR').setArray(new Uint32Array(A.i)).setBuffer(buf));
    if (kind === 'accent') prim.setAttribute('_STONE', out.createAccessor().setType('SCALAR').setArray(new Float32Array(A.s)).setBuffer(buf));
    scene.addChild(out.createNode(kind).setMesh(out.createMesh(kind).addPrimitive(prim)));
  }
  const name = f.replace(/_[0-9a-f]{10}\.glb$/, '.glb');
  await io.write(`${outDir}/${name}`, out);
  report[name] = { src: f, verts: Object.fromEntries(Object.entries(acc).map(([k, A]) => [k, A.p.length / 3])), accentStones: stone };
}
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1));
console.log(Object.keys(report).length, 'files');
