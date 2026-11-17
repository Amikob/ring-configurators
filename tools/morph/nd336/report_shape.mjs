import * as T from './nd336eval.mjs';
import * as M from '../../../nd336-morph/morph-core.js';
import fs from 'fs';
const shape = process.argv[2], YMIN = 8;
const m = {}; for (const c of [1,2,3,4,5]) m[c] = await T.loadModel(shape, c);
const A3 = JSON.parse(fs.readFileSync(`../../../nd336-morph/anchors/${shape}.json`));
const st3 = M.stoneInfo(m[3].gem.pos, A3.center[0], A3.center[2]);
const Afor = b => b === 3 ? A3 : M.morphAnchors(A3, st3, M.scaleFor(b, 3) - 1);
const rep = { shape, fromBase3: {}, neighbours: {}, jumps: {}, penetration: {}, realPenetration: {} };
for (const ct of [1, 2, 4, 5]) {
  const r = T.morphModel(m[3], A3, ct, 3);
  rep.fromBase3[ct] = { morph: T.compare(r, m[ct], null, YMIN), noMorph: T.compare({ metal: m[3].metal }, m[ct], null, YMIN) };
}
for (const b of [1,2,3,4,5]) for (const t of [b - 1, b + 1]) if (t >= 1 && t <= 5) rep.neighbours[`${b}->${t}`] = T.compare(T.morphModel(m[b], Afor(b), t, b), m[t], null, YMIN).mean;
for (const b of [1,2,3,4]) { const ct = b + 0.5; const a = T.morphModel(m[b], Afor(b), ct, b), c = T.morphModel(m[b + 1], Afor(b + 1), ct, b + 1); rep.jumps[ct] = T.compare(a, c, null, YMIN); }
let worst = { metal: 0, accent: 0 };
for (const b of [1,2,3,4,5]) for (const ct of (b === 5 ? [4.5, 5.25, 5.5, 6] : b === 1 ? [1, 1.25, 1.5] : [b - 0.5, b - 0.25, b + 0.25, b + 0.5])) {
  const p = T.pen(T.morphModel(m[b], Afor(b), ct, b), m[b].gem.idx, YMIN); rep.penetration[`${b}@${ct}`] = p;
  worst.metal = Math.max(worst.metal, p.metal.maxDepth); worst.accent = Math.max(worst.accent, p.accent.maxDepth);
}
for (const b of [1,2,3,4,5]) rep.realPenetration[b] = T.pen({ metal: m[b].metal, gem: m[b].gem.pos, accent: m[b].accent }, m[b].gem.idx, YMIN);
rep.worstPenetration = worst;
fs.writeFileSync(`./report_${shape}.json`, JSON.stringify(rep, null, 1));
const nb = Object.values(rep.neighbours);
console.log(shape, 'base3 err', JSON.stringify(Object.fromEntries(Object.entries(rep.fromBase3).map(([k, v]) => [k, `${v.morph.mean}/${v.morph.max} (none ${v.noMorph.mean})`]))),
  '| +-1ct mean avg', (nb.reduce((a, b) => a + b, 0) / nb.length).toFixed(3), 'max', Math.max(...nb).toFixed(3),
  '| jumps', JSON.stringify(Object.fromEntries(Object.entries(rep.jumps).map(([k, v]) => [k, `${v.mean}/${v.max}`]))),
  '| worst pen', JSON.stringify(worst), '| real pen', JSON.stringify(Object.fromEntries(Object.entries(rep.realPenetration).map(([k, v]) => [k, [v.metal.maxDepth, v.accent.maxDepth]]))));
