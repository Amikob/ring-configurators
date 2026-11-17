import * as THREE from 'three';
import { MorphViewer } from './morph.js?v=m1';
import * as M from './morph-core.js?v=m1';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const REAL = [2, 3, 4, 5, 6];
const mobile = params.has('mobile') ? params.get('mobile') !== '0' : (matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 600);
const editing = params.has('edit');
const state = {
  ct: Math.min(6, Math.max(1, Number(params.get('ct')) || 3)),
  gold: params.get('gold') || 'yellow',
  mode: editing ? 'single' : (params.get('mode') === 'hybrid' ? 'hybrid' : 'single'),
  view: params.get('view') || 'normal',
  real: params.has('real'),          // show the real model of this carat instead of the morph (comparison screenshots)
};

const viewer = new MorphViewer($('viewer'), {
  pixelRatio: Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2),
  maxFrames: Number(params.get('frames')) || (mobile ? 32 : 48),
  bounces: 5, motionBounces: 5,
  cubeSize: mobile ? 128 : 256,
  metalInStone: 0.35,
  shadow: { samples: mobile ? 96 : 128 },
  bakePerFrame: mobile ? 16 : 32,
  preserveDrawingBuffer: params.has('capture'),
  metalRotationRef: 120 * Math.PI / 180,
});
viewer.pose = params.get('pose') === 'upright' ? 'upright' : 'flat';
window.morphViewer = viewer;
viewer.addEventListener('converged', () => { document.documentElement.dataset.converged = '1'; });
viewer.addEventListener('morphed', () => { delete document.documentElement.dataset.converged; });

// Environment (the iJewel-matched defaults of noya-selfhost v9: env_metal_002 at 120 deg, env-gem-001 x1.3).
$('startup-text').textContent = 'Loading lighting...';
await viewer.loadEnvironment('./env/diamond/d04.hdr', { saturation: 0, exposure: 1.3, target: 'gem' });
await viewer.loadEnvironment('./env/metal/m02.hdr', { saturation: 1, exposure: 1, lift: 0, target: 'metal' });
viewer.setMetalRotation(120 * Math.PI / 180);
viewer.setGold(state.gold);

$('startup-text').textContent = 'Loading ring...';
const anchorsUrl = './anchors/oval.json';
let A = await (await fetch(anchorsUrl + '?v=' + Date.now().toString(36).slice(0, -4))).json();
const base = await viewer.fetchModel(A.baseCarat, `./models/${A.baseFile}`);
const others = Promise.all(REAL.filter(c => c !== A.baseCarat).map(c => viewer.fetchModel(c, `./models/${c}_ct_oval.glb`)));
if (state.mode === 'hybrid' || state.real || state.view === 'ghost' || state.view === 'error') await others;
viewer.setAnchors(A, base);
others.then(() => { viewer.setAnchors(A, base); if (state.mode === 'hybrid') update(); renderView(); });

const nearestReal = ct => Math.min(6, Math.max(2, Math.round(ct)));
const realAt = ct => { const r = Math.round(ct); return Math.abs(ct - r) < 0.026 && REAL.includes(r) ? viewer.models.get(r) : null; };
let lastMs = 0;
function update({ settle = true } = {}) {
  let parts = base;
  if (state.real) parts = viewer.models.get(nearestReal(state.ct)) || base;
  else if (state.mode === 'hybrid') parts = viewer.models.get(nearestReal(state.ct))?.fields ? viewer.models.get(nearestReal(state.ct)) : base;
  viewer.install(parts);
  const t0 = performance.now();
  viewer.setCarat(state.real ? parts.ct : state.ct, { settle });
  lastMs = performance.now() - t0;
  $('ct-out').textContent = `${state.ct.toFixed(2)} ct`;
  const d = viewer.stoneSize();
  $('dims').textContent = d ? `Stone about ${d.length.toFixed(1)} × ${d.width.toFixed(1)} mm` : '';
  updateMarkers();
  hud();
}
function hud(extra = '') {
  const p = viewer.current; if (!p) return;
  const src = state.real ? `real ${p.ct} ct file (no morph)` : `from the ${p.ct} ct file, head ×${viewer.s.toFixed(3)}`;
  $('hud').textContent = `${src} · morph ${lastMs.toFixed(1)} ms${extra}`;
}
viewer.addEventListener('settled', () => {
  const o = viewer.overlap();
  hud(` · stone/metal overlap ${o.maxDepth.toFixed(3)} mm`);
  if (editing) $('ed-overlap').textContent = `Stone / metal overlap at ${state.ct.toFixed(2)} ct: ${o.maxDepth.toFixed(3)} mm (${o.verticesInside} vertices deeper than 0.02 mm)`;
  if (state.view !== 'normal') renderView();
});

// Carat slider
$('ct').value = state.ct;
$('ct').addEventListener('input', e => { state.ct = Number(e.target.value); update(); syncUrl(); });
// Gold
for (const b of $('golds').querySelectorAll('button')) b.addEventListener('click', () => { state.gold = b.dataset.gold; viewer.setGold(state.gold); seg(); syncUrl(); });
// Method
for (const b of $('modes').querySelectorAll('button')) b.addEventListener('click', async () => { if (editing) return; state.mode = b.dataset.mode; seg(); if (state.mode === 'hybrid') await others; update(); renderView(); syncUrl(); });
// View
for (const b of $('views').querySelectorAll('button')) b.addEventListener('click', async () => { state.view = b.dataset.view; seg(); if (state.view !== 'normal' && state.view !== 'weights') await others; renderView(); syncUrl(); });
function seg() {
  for (const b of $('golds').querySelectorAll('button')) b.classList.toggle('on', b.dataset.gold === state.gold);
  for (const b of $('modes').querySelectorAll('button')) { b.classList.toggle('on', b.dataset.mode === state.mode); b.disabled = editing && b.dataset.mode !== 'single'; }
  for (const b of $('views').querySelectorAll('button')) b.classList.toggle('on', b.dataset.view === state.view);
}
function renderView() {
  const real = realAt(state.ct), note = $('view-note');
  viewer.setGhost(null); viewer.setMetalView('normal');
  note.textContent = '';
  if (state.view === 'ghost' || state.view === 'error') {
    if (!real) { note.textContent = 'The real models exist at 2, 3, 4, 5 and 6 ct - move the slider to one of them.'; return; }
    if (state.view === 'ghost') { viewer.setGhost(real); note.textContent = `Blue wire = the modeller's real ${real.ct} ct file. Gold = our morph.`; }
    else {
      const info = viewer.setMetalView('error', real);
      note.textContent = `Distance from the morph to the real ${real.ct} ct file: average ${info.mean.toFixed(2)} mm, worst ${info.max.toFixed(2)} mm. Green = 0, red = 0.5 mm or more.`;
    }
  } else if (state.view === 'weights') { viewer.setMetalView('weights'); note.textContent = 'Red = moves fully with the stone, blue = fixed. In between = bends smoothly.'; }
}
function syncUrl() {
  const u = new URL(location.href);
  const set = (k, v, def) => { if (v === def) u.searchParams.delete(k); else u.searchParams.set(k, v); };
  set('ct', String(state.ct), '3'); set('gold', state.gold, 'yellow'); set('mode', state.mode, 'single'); set('view', state.view, 'normal');
  history.replaceState(null, '', u);
}

// ---------------- Anchor editor (?edit=1) ----------------
const markerGroup = new THREE.Group(); markerGroup.userData.noBounds = true;
const COLORS = { center: 0x00b36b, fixed: 0x1f6fff, prong: 0xff3b2f };
let tool = 'orbit';
function updateMarkers() {
  if (!editing || !viewer.helpers) return;
  if (markerGroup.parent !== viewer.helpers) viewer.helpers.add(markerGroup);
  markerGroup.clear();
  const p = viewer.current, k = viewer.k, o = [0, 0, 0];
  const add = (pt, r, color) => {
    M.unitDisp(pt[0], pt[1], pt[2], p.st, p.anchors, o);
    const pos = new THREE.Vector3(pt[0] + k * o[0], pt[1] + k * o[1], pt[2] + k * o[2]);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false }));
    dot.renderOrder = 10; dot.position.copy(pos); dot.layers.set(1); dot.userData.noBounds = true; markerGroup.add(dot);
    if (r) { const ring = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.18, depthTest: false }));
      ring.position.copy(pos); ring.layers.set(1); ring.userData.noBounds = true; markerGroup.add(ring); }
  };
  add(A.center, 0, COLORS.center);
  for (const f of A.fixed) add(f.p, f.r, COLORS.fixed);
  for (const f of A.prongs) add(f.p, f.r, COLORS.prong);
  viewer.reset();
}
function anchorsChanged() {
  viewer.setAnchors(A, base);
  update();
  renderList();
}
function renderList() {
  const f = v => v.map(x => x.toFixed(2)).join(', ');
  $('ed-list').innerHTML = `<div>Centre: ${f(A.center)}</div>` + A.fixed.map((a, i) => `<div>Fixed ${i + 1}: ${f(a.p)} r ${a.r}</div>`).join('') + A.prongs.map((a, i) => `<div>Prong ${i + 1}: ${f(a.p)} r ${a.r}</div>`).join('');
}
if (editing) {
  $('editor').hidden = false; $('edit-link').textContent = 'Leave the editor'; $('edit-link').href = '?';
  const bind = (id, get, set, fmt = v => v.toFixed(2)) => {
    const i = $(id), out = i.parentElement.querySelector('output');
    i.value = get(); out.textContent = fmt(get());
    i.addEventListener('input', () => { set(Number(i.value)); out.textContent = fmt(Number(i.value)); anchorsChanged(); });
  };
  let radius = 1.4;
  bind('ed-r', () => radius, v => { radius = v; });
  bind('ed-y0', () => A.deform.y0, v => { A.deform.y0 = Math.min(v, A.deform.y1 - 0.2); });
  bind('ed-y1', () => A.deform.y1, v => { A.deform.y1 = Math.max(v, A.deform.y0 + 0.2); });
  bind('ed-yc', () => A.deform.yc, v => { A.deform.yc = v; });
  bind('ed-rho', () => A.deform.rho0, v => { A.deform.rho0 = v; });
  for (const b of $('tools').querySelectorAll('button')) b.addEventListener('click', () => { tool = b.dataset.tool; for (const x of $('tools').querySelectorAll('button')) x.classList.toggle('on', x === b); });
  $('tools').querySelector('[data-tool="orbit"]').classList.add('on');
  $('ed-download').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(A, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'oval.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('ed-reset').addEventListener('click', async () => { A = await (await fetch(anchorsUrl + '?v=' + Date.now())).json(); anchorsChanged(); });
  // Click (not drag) on the ring = place / delete a point.
  const canvas = viewer.renderer.domElement, ray = new THREE.Raycaster(); let down = null;
  canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5 || tool === 'orbit') return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), viewer.camera);
    const hit = ray.intersectObjects(tool === 'center' ? [viewer.gemMesh, ...viewer.metalMeshes] : viewer.metalMeshes, false)[0];
    if (!hit) return;
    // Back to the base model's frame: undo the holder transform, then the current morph (fixed-point iteration).
    const q = viewer.holder.worldToLocal(hit.point.clone()), p = [q.x, q.y, q.z], o = [0, 0, 0], k = viewer.k;
    let x = [...p];
    for (let it = 0; it < 4; it++) { M.unitDisp(x[0], x[1], x[2], base.st, A, o); x = [p[0] - k * o[0], p[1] - k * o[1], p[2] - k * o[2]]; }
    x = x.map(v => Math.round(v * 100) / 100);
    if (tool === 'center') A.center = [x[0], A.center[1], x[2]];
    else if (tool === 'fixed') A.fixed.push({ p: x, r: radius });
    else if (tool === 'prong') A.prongs.push({ p: x, r: radius });
    else if (tool === 'delete') {
      let best = null;
      for (const list of [A.fixed, A.prongs]) list.forEach((a, i) => { const d = Math.hypot(a.p[0] - x[0], a.p[1] - x[1], a.p[2] - x[2]); if (d < 2 && (!best || d < best.d)) best = { d, list, i }; });
      if (best) best.list.splice(best.i, 1);
    }
    anchorsChanged();
  });
  renderList();
}

seg();
update({ settle: false });
viewer.bakeShadow(); viewer.cubeDirty = true;
const viewParams = () => ({ elevation: params.has('el') ? Number(params.get('el')) : (viewer.pose === 'flat' ? 20 : 6), azimuth: params.has('az') ? Number(params.get('az')) : (viewer.pose === 'flat' ? 0 : -30), fill: Number(params.get('fill')) || 0.45, lower: params.has('lower') ? Number(params.get('lower')) : 0.16 });
// Frame the ring as it is at 6 ct so the camera never has to move while the slider runs.
{ const keep = state.ct; viewer.setCarat(6, { settle: false }); viewer.frontView(viewParams()); viewer.setCarat(keep, { settle: false }); update(); }
renderView();
$('startup').hidden = true;
// For automated checks / screenshots.
window.morphApp = { setCt: ct => { state.ct = ct; $('ct').value = ct; update(); }, state, A: () => A };
