// Accuracy / collision checks shared by the page (error map, overlap readout) and the Node verification script.
export class Grid {
  constructor(pts, h = 0.25) { this.h = h; this.p = pts; this.m = new Map(); for (let i = 0; i < pts.length / 3; i++) { const k = this.key(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]); let a = this.m.get(k); if (!a) this.m.set(k, a = []); a.push(i); } }
  key(x, y, z) { return `${Math.floor(x / this.h)},${Math.floor(y / this.h)},${Math.floor(z / this.h)}`; }
  nearest(x, y, z) {
    const h = this.h, cx = Math.floor(x / h), cy = Math.floor(y / h), cz = Math.floor(z / h); let best = Infinity;
    for (let r = 0; r < 40; r++) {
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
        if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
        const a = this.m.get(`${cx + i},${cy + j},${cz + k}`); if (!a) continue;
        for (const q of a) { const d = (this.p[3 * q] - x) ** 2 + (this.p[3 * q + 1] - y) ** 2 + (this.p[3 * q + 2] - z) ** 2; if (d < best) best = d; }
      }
      if (best < (r * h) ** 2) break;
    }
    return Math.sqrt(best);
  }
}
// Uniform random points on the surface (~per points / mm^2), only above ymin (the head; the band is identical in every model).
export function sampleSurface(pos, idx, per = 60, ymin = 8) {
  const out = []; let seed = 1; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = idx ? idx.length : pos.length / 3, I = t => idx ? idx[t] : t;
  for (let t = 0; t < n; t += 3) {
    const a = I(t) * 3, b = I(t + 1) * 3, c = I(t + 2) * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx), nn = area * per;
    const cnt = Math.floor(nn) + (rnd() < nn % 1 ? 1 : 0);
    for (let s = 0; s < cnt; s++) { let r1 = rnd(), r2 = rnd(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; } const y = pos[a + 1] + r1 * uy + r2 * vy; if (y < ymin) continue; out.push(pos[a] + r1 * ux + r2 * vx, y, pos[a + 2] + r1 * uz + r2 * vz); }
  }
  return new Float32Array(out);
}
export const stats = d => { d = Float64Array.from(d).sort(); const mean = d.reduce((a, b) => a + b, 0) / d.length; return { mean: +mean.toFixed(3), p95: +d[Math.floor(d.length * 0.95)].toFixed(3), max: +d[d.length - 1].toFixed(3) }; };
// Symmetric surface distance (mm) between two meshes, head only.
export function surfErr(posA, idxA, posB, idxB, ymin = 8) {
  const sa = sampleSurface(posA, idxA, 60, ymin), sb = sampleSurface(posB, idxB, 60, ymin), ga = new Grid(sa), gb = new Grid(sb), d = [];
  for (let i = 0; i < sa.length; i += 3) d.push(gb.nearest(sa[i], sa[i + 1], sa[i + 2]));
  for (let i = 0; i < sb.length; i += 3) d.push(ga.nearest(sb[i], sb[i + 1], sb[i + 2]));
  return stats(d);
}
// Per-vertex distance of a mesh to another mesh's surface (error heat map).
export function vertexErr(pos, refPos, refIdx, ymin = 8) {
  const g = new Grid(sampleSurface(refPos, refIdx, 80, ymin - 1)), out = new Float32Array(pos.length / 3);
  for (let i = 0; i < out.length; i++) out[i] = pos[3 * i + 1] < ymin ? 0 : g.nearest(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]);
  return out;
}
// A cut diamond is convex: its faces' planes bound it. Metal vertices inside = penetration.
export function stonePlanes(gemPos, gemIdx) {
  const planes = []; let cx = 0, cy = 0, cz = 0; const nv = gemPos.length / 3;
  for (let i = 0; i < nv; i++) { cx += gemPos[3 * i]; cy += gemPos[3 * i + 1]; cz += gemPos[3 * i + 2]; } cx /= nv; cy /= nv; cz /= nv;
  const n = gemIdx ? gemIdx.length : nv, I = t => gemIdx ? gemIdx[t] : t;
  for (let t = 0; t < n; t += 3) {
    const a = I(t) * 3, b = I(t + 1) * 3, c = I(t + 2) * 3;
    const ux = gemPos[b] - gemPos[a], uy = gemPos[b + 1] - gemPos[a + 1], uz = gemPos[b + 2] - gemPos[a + 2], vx = gemPos[c] - gemPos[a], vy = gemPos[c + 1] - gemPos[a + 1], vz = gemPos[c + 2] - gemPos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz); if (L < 1e-9) continue; nx /= L; ny /= L; nz /= L;
    let d = nx * gemPos[a] + ny * gemPos[a + 1] + nz * gemPos[a + 2]; if (nx * cx + ny * cy + nz * cz > d) { nx = -nx; ny = -ny; nz = -nz; d = -d; }
    planes.push([nx, ny, nz, d]);
  }
  return planes;
}
export function penetration(gemPos, gemIdx, metalPos, ymin = 8) {
  const planes = stonePlanes(gemPos, gemIdx); let cnt = 0, max = 0;
  for (let i = 0; i < metalPos.length; i += 3) {
    const x = metalPos[i], y = metalPos[i + 1], z = metalPos[i + 2]; if (y < ymin) continue;
    let s = -Infinity; for (const p of planes) { s = Math.max(s, p[0] * x + p[1] * y + p[2] * z - p[3]); if (s > 0) break; }
    if (s < 0) { const depth = -s; if (depth > 0.02) cnt++; max = Math.max(max, depth); }
  }
  return { verticesInside: cnt, maxDepth: +max.toFixed(3) };
}
