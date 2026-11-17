// nd336-morph: auto anchors, calibration and accuracy / collision checks (same morph-core.js as the page).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'fs';
const ROOT = process.env.ND_ROOT || '../../../nd336-morph';
const M = await import(`${ROOT}/morph-core.js`);
const E = await import(`${ROOT}/morph-eval.js`);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const mul = (m, x, y, z) => [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
const cache = new Map();
export async function loadModel(shape, ct) {
  const key = `${shape}:${ct}`; if (cache.has(key)) return cache.get(key);
  const doc = await io.read(`${ROOT}/models/${ct}_ct_${shape}.glb`);
  const out = { metal: [] };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue; const W = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), n = P.getCount(), pos = new Float32Array(n * 3), e = [0, 0, 0];
      for (let i = 0; i < n; i++) { P.getElement(i, e); pos.set(mul(W, ...e), 3 * i); }
      const idx = prim.getIndices() ? Uint32Array.from(prim.getIndices().getArray()) : null;
      const name = node.getName();
      if (name === 'gem') out.gem = { pos, idx };
      else if (name === 'accent') { const S = prim.getAttribute('_STONE'); const s = new Float32Array(n); for (let i = 0; i < n; i++) s[i] = S.getScalar(i); out.accent = { pos, idx, stone: s }; }
      else out.metal.push({ pos, idx, name });
    }
  }
  cache.set(key, out); return out;
}
export function autoAnchors(m, shape, deform) {
  const st = M.stoneInfo(m.gem.pos);
  const head = m.metal.find(x => x.name === 'metal_head').pos, tips = [];
  for (let i = 0; i < head.length; i += 3) {
    const y = head[i + 1]; if (y < st.girdleY + 0.3) continue;
    const dx = head[i] - st.cx, dz = head[i + 2] - st.cz; tips.push([Math.atan2(dz, dx), head[i], y, head[i + 2]]);
  }
  tips.sort((a, b) => a[0] - b[0]);
  // clusters = runs of angles with gaps > 8 deg
  const cl = []; let cur = [];
  for (let i = 0; i < tips.length; i++) { if (cur.length && tips[i][0] - cur[cur.length - 1][0] > 8 * Math.PI / 180) { cl.push(cur); cur = []; } cur.push(tips[i]); }
  if (cur.length) { if (cl.length && tips.length && (cl[0][0][0] + 2 * Math.PI) - cur[cur.length - 1][0] < 8 * Math.PI / 180) cl[0] = cur.concat(cl[0]); else cl.push(cur); }
  const prongs = cl.filter(c => c.length > 20).map(c => {
    const p = [0, 1, 2].map(j => c.reduce((s, t) => s + t[j + 1], 0) / c.length);
    let r = 0; for (const t of c) r = Math.max(r, Math.hypot(t[1] - p[0], t[2] - p[1], t[3] - p[2]));
    return { p: p.map(v => +v.toFixed(2)), r: +Math.min(2.2, Math.max(0.9, r * 1.1)).toFixed(2) };
  });
  return { version: 1, shape, ring: 'ND336', baseCarat: 3, baseFile: `3_ct_${shape}.glb`, units: 'mm, model frame (+Y up through the stone). Authored on the 3 ct model.',
    center: [+st.cx.toFixed(3), +st.girdleY.toFixed(3), +st.cz.toFixed(3)], deform: { ...deform }, fixed: [], prongs };
}
export function morphModel(m, A, ct, baseCt) {
  const st = M.stoneInfo(m.gem.pos, A.center[0], A.center[2]);
  const s = M.scaleFor(ct, baseCt), k = s - 1;
  const metal = m.metal.map(x => { const f = M.buildField(x.pos, st, A); const o = x.pos.slice(); M.applyField(x.pos, null, f, k, o, null); return { pos: o, idx: x.idx }; });
  const py = M.stonePivotY(st, A), g = new Float32Array(m.gem.pos.length);
  for (let i = 0; i < g.length; i += 3) { g[i] = st.cx + s * (m.gem.pos[i] - st.cx); g[i+1] = py + s * (m.gem.pos[i+1] - py); g[i+2] = st.cz + s * (m.gem.pos[i+2] - st.cz); }
  let accent = null;
  if (m.accent) { const f = M.buildStoneField(m.accent.pos, m.accent.stone, st, A); const o = m.accent.pos.slice(); M.applyField(m.accent.pos, null, f, k, o, null); accent = { pos: o, idx: m.accent.idx }; }
  return { metal, gem: g, accent };
}
const concat = arr => { let n = 0, ni = 0; for (const a of arr) { n += a.pos.length; ni += a.idx.length; } const pos = new Float32Array(n), idx = new Uint32Array(ni); let o = 0, oi = 0; for (const a of arr) { pos.set(a.pos, o); for (let i = 0; i < a.idx.length; i++) idx[oi + i] = a.idx[i] + o / 3; o += a.pos.length; oi += a.idx.length; } return { pos, idx }; };
export function compare(r, real, gemIdx, ymin) {
  const A = concat(r.metal), B = concat(real.metal);
  return E.surfErr(A.pos, A.idx, B.pos, B.idx, ymin);
}
export function pen(r, gemIdx, ymin) {
  const metal = concat(r.metal); const a = E.penetration(r.gem, gemIdx, metal.pos, ymin);
  const b = r.accent ? E.penetration(r.gem, gemIdx, r.accent.pos, ymin) : { verticesInside: 0, maxDepth: 0 };
  return { metal: a, accent: b };
}
// Nelder-Mead
export function nm(f, x0, step, iters = 60) {
  const n = x0.length; let S = [x0]; for (let i = 0; i < n; i++) { const x = [...x0]; x[i] += step[i]; S.push(x); }
  let F = S.map(f);
  for (let it = 0; it < iters; it++) {
    const o = F.map((v, i) => i).sort((a, b) => F[a] - F[b]); S = o.map(i => S[i]); F = o.map(i => F[i]);
    const c = Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += S[i][j] / n;
    const pt = t => c.map((v, j) => v + t * (S[n][j] - v));
    const xr = pt(-1), fr = f(xr);
    if (fr < F[0]) { const xe = pt(-2), fe = f(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = pt(0.5), fc = f(xc); if (fc < F[n]) { S[n] = xc; F[n] = fc; } else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = f(S[i]); } } }
  }
  const i = F.indexOf(Math.min(...F)); return { x: S[i], f: F[i] };
}
