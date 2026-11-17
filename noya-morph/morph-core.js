// Live carat morph - pure math, no three.js (also imported by the Node verification script).
//
// Model frame: millimetres, +Y up through the stone (as exported from the .3dm), stone axis vertical.
// A carat change is a head scale s = cbrt(ct / baseCt) (carat ~ volume). Every metal vertex moves by
//   D(v) = (s - 1) * U(v)
// where U is a static "unit displacement" field computed once from the anchors:
//   g(p)  = how the stone's surrounding moves per unit (s - 1): radial (x, z about the stone axis, elliptical,
//           saturating to a pure translation beyond rho0 girdle radii) + vertical (h + kv * (y - yc)).
//   w(v)  = head mask: smoothstep(y0, y1, y) (shank / band below y0 never move), times a hole of radius r
//           around every FIXED anchor.
//   Prong anchors: within radius r of a prong anchor the vertex is fully moving and takes the anchor's
//           horizontal displacement (rigid translation in x/z -> the claw keeps its cross-section, it is moved
//           with the girdle, not stretched), blended smoothly with g(v) by the anchor's falloff. Vertical motion
//           always comes from g so claws stay in the same contact with the crown.
// Default oval calibration (fitted on the real 2/4/5/6 ct models from the 3 ct one): the head is a similarity
// about the pivot (kv = 1) -> metal/stone contact is preserved exactly, no penetration at any carat.
// Because D is linear in (s - 1), the slider costs one multiply-add per coordinate; normals use the
// precomputed Jacobian of U (n' = cofactor(I + k dU) n).
// The stone is scaled by s about the pivot whose girdle motion equals the metal's (no gap / no overlap at the seat).

export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

export function stoneInfo(gemPos, cx = 0, cz = 0) {
  // gemPos: Float32Array xyz. Girdle half axes a (x), b (z) and girdle height (y of the widest ring).
  let a = 0, b = 0, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < gemPos.length; i += 3) {
    a = Math.max(a, Math.abs(gemPos[i] - cx)); b = Math.max(b, Math.abs(gemPos[i + 2] - cz));
    ymin = Math.min(ymin, gemPos[i + 1]); ymax = Math.max(ymax, gemPos[i + 1]);
  }
  let ys = 0, n = 0;
  for (let i = 0; i < gemPos.length; i += 3) {
    const r = Math.hypot((gemPos[i] - cx) / a, (gemPos[i + 2] - cz) / b);
    if (r > 0.97) { ys += gemPos[i + 1]; n++; }
  }
  return { a, b, cx, cz, girdleY: n ? ys / n : (ymin + ymax) / 2, ymin, ymax };
}

// Field per unit (s - 1) before masking.
function gField(x, y, z, st, P, out) {
  const dx = x - st.cx, dz = z - st.cz;
  const rho = Math.hypot(dx / st.a, dz / st.b) + 1e-9;
  const f = Math.min(1, P.rho0 / rho);
  out[0] = dx * f; out[1] = P.h + P.kv * (y - P.yc); out[2] = dz * f;
  return out;
}

const _g = [0, 0, 0], _ga = [0, 0, 0];
export function unitDisp(x, y, z, st, A, out) {
  const P = A.deform;
  let w = smooth(P.y0, P.y1, y);
  for (const f of A.fixed || []) w *= smooth(0, 1, Math.hypot(x - f.p[0], y - f.p[1], z - f.p[2]) / f.r);
  let m = 0, sw = 0, ax = 0, ay = 0, az = 0;
  for (const p of A.prongs || []) {
    const phi = 1 - smooth(0, 1, Math.hypot(x - p.p[0], y - p.p[1], z - p.p[2]) / p.r);
    if (phi <= 0) continue;
    gField(p.p[0], p.p[1], p.p[2], st, P, _ga);
    ax += phi * _ga[0]; ay += phi * _ga[1]; az += phi * _ga[2]; sw += phi; m = Math.max(m, phi);
  }
  gField(x, y, z, st, P, _g);
  if (sw > 0) { ax /= sw; ay /= sw; az /= sw; }
  const wm = Math.max(w, m);
  // Prongs: rigid in the horizontal plane (cross-section kept), vertical from the field so the claw keeps
  // exactly the same contact with the crown / pavilion (the stone scales vertically about the same pivot).
  out[0] = wm * ((1 - m) * _g[0] + m * ax);
  out[1] = wm * _g[1];
  out[2] = wm * ((1 - m) * _g[2] + m * az);
  return wm;
}

// Precompute U (xyz) and its Jacobian (9 per vertex, row-major dU_i/dx_j) and the weight (for edit view).
export function buildField(pos, st, A, eps = 0.01) {
  const n = pos.length / 3, U = new Float32Array(n * 3), J = new Float32Array(n * 9), W = new Float32Array(n);
  const o = [0, 0, 0], p = [0, 0, 0], q = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    W[i] = unitDisp(x, y, z, st, A, o);
    U[3 * i] = o[0]; U[3 * i + 1] = o[1]; U[3 * i + 2] = o[2];
    for (let j = 0; j < 3; j++) {
      const d = [0, 0, 0]; d[j] = eps;
      unitDisp(x + d[0], y + d[1], z + d[2], st, A, p);
      unitDisp(x - d[0], y - d[1], z - d[2], st, A, q);
      for (let r = 0; r < 3; r++) J[9 * i + 3 * r + j] = (p[r] - q[r]) / (2 * eps);
    }
  }
  return { U, J, W };
}

// pos' = pos + k U ; n' = cof(I + kJ) n (normalised).
export function applyField(base, nBase, field, k, outPos, outN) {
  const { U, J } = field, n = base.length / 3;
  for (let i = 0; i < n; i++) {
    const i3 = 3 * i;
    outPos[i3] = base[i3] + k * U[i3]; outPos[i3 + 1] = base[i3 + 1] + k * U[i3 + 1]; outPos[i3 + 2] = base[i3 + 2] + k * U[i3 + 2];
    if (!outN) continue;
    const j = 9 * i;
    const a = 1 + k * J[j], b = k * J[j + 1], c = k * J[j + 2];
    const d = k * J[j + 3], e = 1 + k * J[j + 4], f = k * J[j + 5];
    const g = k * J[j + 6], h = k * J[j + 7], m = 1 + k * J[j + 8];
    // cofactor matrix (= det * inverse transpose)
    const c00 = e * m - f * h, c01 = -(d * m - f * g), c02 = d * h - e * g;
    const c10 = -(b * m - c * h), c11 = a * m - c * g, c12 = -(a * h - b * g);
    const c20 = b * f - c * e, c21 = -(a * f - c * d), c22 = a * e - b * d;
    const nx = nBase[i3], ny = nBase[i3 + 1], nz = nBase[i3 + 2];
    let X = c00 * nx + c01 * ny + c02 * nz, Y = c10 * nx + c11 * ny + c12 * nz, Z = c20 * nx + c21 * ny + c22 * nz;
    const L = Math.hypot(X, Y, Z) || 1;
    outN[i3] = X / L; outN[i3 + 1] = Y / L; outN[i3 + 2] = Z / L;
  }
}

// Stone pivot: scaling the stone by s about (cx, pivotY, cz) moves its girdle by exactly the metal field there.
export function stonePivotY(st, A) {
  const P = A.deform, yg = st.girdleY;
  return yg - (P.h + P.kv * (yg - P.yc));
}

// Carat <-> scale.
export const scaleFor = (ct, baseCt) => Math.cbrt(ct / baseCt);

// Move anchor positions authored on one base model onto another (they follow the head).
export function morphAnchors(A, st, k) {
  const mv = p => { const o = [0, 0, 0]; unitDisp(p[0], p[1], p[2], st, A, o); return [p[0] + k * o[0], p[1] + k * o[1], p[2] + k * o[2]]; };
  return { ...A, center: A.center && mv(A.center), fixed: (A.fixed || []).map(f => ({ ...f, p: mv(f.p) })), prongs: (A.prongs || []).map(f => ({ ...f, p: mv(f.p) })) };
}
