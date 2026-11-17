import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';
import * as M from '../../noya-morph/morph-core.js';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const DIR = new URL('../../noya-morph/models', import.meta.url).pathname;
function mul(m, x, y, z) { return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]]; }
export async function loadModel(ct) {
  const doc = await io.read(`${DIR}/${ct}_ct_oval.glb`);
  const out = {};
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const W = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const name = /gem/i.test(prim.getMaterial()?.getName() || mesh.getName() || node.getName()) ? 'gem' : 'metal';
      const P = prim.getAttribute('POSITION'), n = P.getCount(), pos = new Float32Array(n * 3), e = [0,0,0];
      for (let i = 0; i < n; i++) { P.getElement(i, e); const w = mul(W, ...e); pos.set(w, 3 * i); }
      const idx = prim.getIndices() ? Uint32Array.from(prim.getIndices().getArray()) : Uint32Array.from({ length: n }, (_, i) => i);
      out[name] = { pos, idx };
    }
  }
  return out;
}
import { surfErr, penetration } from '../../noya-morph/morph-eval.js';
export { surfErr, penetration };
export function morphModel(m, A, ct, baseCt) {
  const st = M.stoneInfo(m.gem.pos, A.center[0], A.center[2]);
  const field = M.buildField(m.metal.pos, st, A);
  const s = M.scaleFor(ct, baseCt), k = s - 1, out = new Float32Array(m.metal.pos.length);
  M.applyField(m.metal.pos, null, field, k, out, null);
  const py = M.stonePivotY(st, A), g = new Float32Array(m.gem.pos.length);
  for (let i = 0; i < g.length; i += 3) { g[i] = st.cx + s * (m.gem.pos[i] - st.cx); g[i+1] = py + s * (m.gem.pos[i+1] - py); g[i+2] = st.cz + s * (m.gem.pos[i+2] - st.cz); }
  return { metal: out, gem: g, st, pivotY: py };
}
if (process.argv[1].endsWith('evalmorph.mjs')) {
  const A = JSON.parse(fs.readFileSync(process.argv[2] || new URL('../../noya-morph/anchors/oval.json', import.meta.url)));
  const base = A.baseCarat, models = {}; for (const c of [2,3,4,5,6]) models[c] = await loadModel(c);
  const rep = { anchors: process.argv[2] || 'oval.json', base, rows: [] };
  for (const ct of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7]) {
    const r = morphModel(models[base], A, ct, base); const row = { ct };
    row.penetration = penetration(r.gem, models[base].gem.idx, r.metal);
    if (models[ct] && ct !== base) {
      row.metalErr = surfErr(r.metal, models[base].metal.idx, models[ct].metal.pos, models[ct].metal.idx);
      row.noMorphErr = surfErr(models[base].metal.pos, models[base].metal.idx, models[ct].metal.pos, models[ct].metal.idx);
      row.gemErr = surfErr(r.gem, models[base].gem.idx, models[ct].gem.pos, models[ct].gem.idx);
      row.realPenetration = penetration(models[ct].gem.pos, models[ct].gem.idx, models[ct].metal.pos);
    }
    rep.rows.push(row); console.log(JSON.stringify(row));
  }
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(rep, null, 1));
}
