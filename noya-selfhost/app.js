import { RingViewer, GOLDS } from './viewer.js?v=sh11';
import { createStudio } from './studio.js?v=sh11';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const SHAPES = ['round', 'oval', 'elongated_cushion', 'elongated_radiant', 'emerald', 'old_cut_cushion', 'princess', 'marquise'];
const CARATS = [2, 3, 4, 5, 6];
const COLORS = ['white', 'yellow', 'rose'];
const label = v => v.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

const state = {
  shape: params.get('shape') || 'oval',
  carat: Number(params.get('ct')) || 3,
  gold: params.get('gold') || 'yellow',
  pose: params.get('pose') || 'flat',
};
const quality = Number(params.get('q')) || Number(localStorage.getItem('noya-sh-quality')) || (matchMedia('(pointer:coarse)').matches ? 1 : 1.5);

const manifest = await (await fetch('./models/manifest.json')).json();
const have = new Set(manifest.map(m => `${m.shape}:${m.carat}`));

// Adaptive quality: phones / tablets (coarse pointer or small screen) get fewer internal bounces,
// a lower pixel ratio cap and fewer accumulation frames; everyone drops to fewer bounces while dragging.
const mobile = params.has('mobile') ? params.get('mobile') !== '0' : (matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 600);
// Defaults copied from the iJewel Noya scene (Tonemap: ACESFilmic, exposure 1; Bloom intensity 0.2).
// Test override: ?mcolor=<gold>:<r>,<g>,<b> (linear) to try a metal colour without editing the code.
if (params.has('mcolor')) { const [g, v] = params.get('mcolor').split(':'); if (GOLDS[g]) GOLDS[g] = v.split(',').map(Number); }
// Noya look: the iJewel Noya scene (ss-001: ACES, exposure 1, contrast 1.1, bloom 0.2 / 2, env_metal_002 +
// env-gem-001) with our engine fixes (README "Look"). Everything is editable in the Studio panel.
const STUDIO_PAGE_DEFAULTS = {
  // HDRI rotation: our camera looks from +Z, iJewel's from -Z. Picked side by side + metal deltaE against live
  // iJewel (sweeps of 0-315 deg): metal 120, diamond 0 (star pattern).
  env: { metalRotation: 120, diamondRotation: 0 },
  render: { frames: mobile ? 32 : 48 },
};
const viewer = new RingViewer($('viewer'), {
  pixelRatio: Math.min((window.devicePixelRatio || 1), mobile ? 1.5 : 2) * (quality / 1.5),
  maxFrames: Number(params.get('frames')) || (mobile ? 32 : 48),
  bounces: Number(params.get('bounces')) || 5,   // iJewel diamond material: rayBounces 5
  // Same bounce count while dragging as at rest: fewer bounces changed the stone's reflection pattern,
  // so it visibly jumped when the drag ended. (?mbounces= still allows a test override.)
  motionBounces: Number(params.get('mbounces')) || Number(params.get('bounces')) || 5,
  cubeSize: mobile ? 128 : 256,
  shadow: { samples: mobile ? 96 : 128, ...(params.has('keyaz') ? { keyAzimuth: Number(params.get('keyaz')) } : {}) },
  bakePerFrame: mobile ? 16 : 32,
  preserveDrawingBuffer: params.has('capture'),
  headToward: '+z',   // Rest pose: the stone faces the default camera
  metalRotationRef: 120 * Math.PI / 180,   // shadow direction below is tuned for this metal HDRI rotation
});
window.noyaViewer = viewer;

function button(parent, html, onClick, cls) {
  const b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls; b.innerHTML = html; b.addEventListener('click', onClick); parent.appendChild(b); return b;
}
const shapeButtons = new Map(SHAPES.map(s => [s, button($('shapes'), `<img src="./assets/shapes/${s}.png" alt=""><span>${label(s)}</span>`, () => choose({ shape: s }), 'shape')]));
const caratButtons = new Map(CARATS.map(c => [c, button($('carats'), `${c} ct`, () => choose({ carat: c }))]));
const goldButtons = new Map(COLORS.map(c => [c, button($('ring-gold'), `<span class="swatch ${c}"></span>${label(c)}`, () => choose({ gold: c }), 'gold')]));
document.querySelectorAll('#quality button').forEach(b => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.quality) === quality));
  b.addEventListener('click', () => { localStorage.setItem('noya-sh-quality', b.dataset.quality); const u = new URL(location.href); u.searchParams.delete('q'); location.href = u; });
});

function render() {
  for (const [s, b] of shapeButtons) b.setAttribute('aria-pressed', String(s === state.shape));
  for (const [c, b] of caratButtons) { b.setAttribute('aria-pressed', String(c === state.carat)); b.disabled = !have.has(`${state.shape}:${c}`); }
  for (const [c, b] of goldButtons) b.setAttribute('aria-pressed', String(c === state.gold));
  $('shape-label').textContent = label(state.shape);
  $('carat-label').textContent = `${state.carat} ct`;
  $('pose-label').textContent = state.pose === 'flat' ? 'Stand' : 'Rest';
  $('selection-summary').textContent = `${label(state.shape)} / ${state.carat} ct`;
}

let loadedKey = '';
async function choose(patch) {
  Object.assign(state, patch);
  if (!have.has(`${state.shape}:${state.carat}`)) state.carat = CARATS.filter(c => have.has(`${state.shape}:${c}`)).sort((a, b) => Math.abs(a - state.carat) - Math.abs(b - state.carat))[0];
  render();
  if (patch.gold) viewer.setGold(state.gold);
  const key = `${state.shape}:${state.carat}`;
  if (key !== loadedKey) {
    $('update-status').textContent = 'Loading...';
    const entry = manifest.find(m => m.shape === state.shape && m.carat === state.carat);
    try {
      const ok = await viewer.loadRing(`./models/${entry.file}`);
      if (ok) loadedKey = key;
      $('error').hidden = true;
    } catch (e) { console.error(e); $('error').textContent = 'This ring could not load. Please try again.'; $('error').hidden = false; }
    $('update-status').textContent = '';
  }
}

function viewParams() {
  return { elevation: params.has('el') ? Number(params.get('el')) : (state.pose === 'flat' ? 20 : 6), azimuth: params.has('az') ? Number(params.get('az')) : (state.pose === 'flat' ? 0 : -30), fill: Number(params.get('fill')) || 0.45, lower: params.has('lower') ? Number(params.get('lower')) : 0.16 };
}
$('pose-toggle').addEventListener('click', () => { state.pose = state.pose === 'flat' ? 'upright' : 'flat'; viewer.applyPose(state.pose); viewer.frontView(viewParams()); render(); });
$('center-view').addEventListener('click', () => viewer.frontView(viewParams()));

viewer.applyPose(state.pose);
render();
// Studio panel (HDRI, tone mapping, bloom, ground, metal, diamond, presets): the "Studio" tab of the options column
// (on phones it temporarily replaces the ring options), so the ring stays fully visible while adjusting.
const studio = await createStudio({ viewer, root: $('studio'), page: 'noya', defaults: STUDIO_PAGE_DEFAULTS, params });
window.noyaStudio = studio;
function setStudio(open) {
  const before = $('viewer').clientHeight;
  $('studio').hidden = !open; $('env-toggle').setAttribute('aria-expanded', String(open));
  $('tab-studio').setAttribute('aria-selected', String(open)); $('tab-ring').setAttribute('aria-selected', String(!open));
  document.querySelector('.panel').classList.toggle('studio-open', open);
  requestAnimationFrame(() => requestAnimationFrame(() => { if (Math.abs($('viewer').clientHeight - before) > 8 && viewer.bounds) { viewer.resize(); viewer.frontView(viewParams()); } }));
}
$('env-toggle').addEventListener('click', () => setStudio($('studio').hidden));
$('tab-studio').addEventListener('click', () => setStudio(true));
$('tab-ring').addEventListener('click', () => setStudio(false));
if (params.has('hdri') || params.has('studio')) setStudio(true);
if (params.has('rot')) viewer.setEnvRotation(Number(params.get('rot')));   // old pilot param (radians, both)
viewer.setGold(state.gold);
await choose({});
viewer.frontView(viewParams());
$('startup').hidden = true;
viewer.addEventListener('converged', () => { document.documentElement.dataset.converged = '1'; });
