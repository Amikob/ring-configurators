import { RingViewer, GOLDS } from './viewer.js?v=sh11';
import { createStudio } from './studio.js?v=sh11';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
// Same catalogue as the live Erica page (erica/catalog.js): 8 shapes x 3-7 ct, matching band none / plain /
// half eternity (band group A/B/C by shape), independent ring and band gold.
const SHAPES = ['elocshn', 'elordnt', 'emrld', 'oldctcshn', 'oval', 'mrqs', 'sqrcshn', 'sqrrdnt'];
const LABELS = { elocshn: 'Elongated cushion', elordnt: 'Elongated radiant', emrld: 'Emerald', oldctcshn: 'Old-cut cushion', oval: 'Oval', mrqs: 'Marquise', sqrcshn: 'Square cushion', sqrrdnt: 'Square radiant' };
const CARATS = [3, 4, 5, 6, 7];
const COLORS = ['white', 'yellow', 'rose'];
const BANDS = [['none', 'No band'], ['plain', 'Plain'], ['pave', 'Half Eternity']];
const label = v => LABELS[v] || v.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());

const state = {
  shape: SHAPES.includes(params.get('shape')) ? params.get('shape') : 'oval',
  carat: Number(params.get('ct')) || 3,
  band: ['none', 'plain', 'pave'].includes(params.get('band')) ? params.get('band') : 'none',
  gold: params.get('gold') || 'yellow',
  bandGold: params.get('bgold') || params.get('gold') || 'yellow',
  pose: params.get('pose') === 'flat' ? 'flat' : 'upright',   // live Erica opens upright
};
const quality = Number(params.get('q')) || Number(localStorage.getItem('erica-sh-quality')) || (matchMedia('(pointer:coarse)').matches ? 1 : 1.5);

const manifest = await (await fetch('./models/manifest.json?v=e1')).json();
const ringFor = (s, c) => manifest.rings.find(r => r.shape === s && r.carat === c);
const bandFor = (s, c, style) => manifest.bands.find(b => b.group === manifest.groups[s] && b.min <= c && c <= b.max && b.style === style);
const have = new Set(manifest.rings.map(m => `${m.shape}:${m.carat}`));

// Adaptive quality: phones / tablets (coarse pointer or small screen) get fewer internal bounces,
// a lower pixel ratio cap and fewer accumulation frames; everyone drops to fewer bounces while dragging.
const mobile = params.has('mobile') ? params.get('mobile') !== '0' : (matchMedia('(pointer:coarse)').matches || Math.min(screen.width, screen.height) < 600);
// Defaults copied from the iJewel Noya scene (Tonemap: ACESFilmic, exposure 1; Bloom intensity 0.2).
// Test override: ?mcolor=<gold>:<r>,<g>,<b> (linear) to try a metal colour without editing the code.
if (params.has('mcolor')) { const [g, v] = params.get('mcolor').split(':'); if (GOLDS[g]) GOLDS[g] = v.split(',').map(Number); }
// Erica look: the iJewel saved config (ACES, exposure 1, contrast 1.1, env_metal_002 + env-gem-001 at rotation 0,
// ground-shadow-backleft) with our engine fixes (see README "Look"). Everything is editable in the Studio panel.
const STUDIO_PAGE_DEFAULTS = {
  env: { metalRotation: 0, diamondRotation: 0, metalIntensity: 0.7 },   // Erica: same model frame and env rotation 0 as on iJewel; larger, more reflective GLBs
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
  // iJewel ground-shadow-backleft light, in the Erica model frame (we load the same GLB frame as iJewel): az 45, el 34
  shadow: { samples: mobile ? 96 : 128, keyAzimuth: 45, keyElevation: 34, ...(params.has('keyaz') ? { keyAzimuth: Number(params.get('keyaz')) } : {}) },
  bakePerFrame: mobile ? 16 : 32,
  preserveDrawingBuffer: params.has('capture'),
  metalRotationRef: 0,   // shadow direction below is tuned for this metal HDRI rotation
});
window.noyaViewer = window.ericaViewer = viewer;
viewer.pose = state.pose;

function button(parent, html, onClick, cls) {
  const b = document.createElement('button'); b.type = 'button'; if (cls) b.className = cls; b.innerHTML = html; b.addEventListener('click', onClick); parent.appendChild(b); return b;
}
const shapeButtons = new Map(SHAPES.map(s => [s, button($('shapes'), `<img src="./assets/shapes/${s}.png" alt=""><span>${label(s)}</span>`, () => choose({ shape: s }), 'shape')]));
const caratButtons = new Map(CARATS.map(c => [c, button($('carats'), `${c} ct`, () => choose({ carat: c }))]));
const goldButtons = new Map(COLORS.map(c => [c, button($('ring-gold'), `<span class="swatch ${c}"></span>${label(c)}`, () => choose({ gold: c }), 'gold')]));
const bandButtons = new Map(BANDS.map(([v, t]) => [v, button($('bands'), t, () => choose({ band: v }))]));
const bandGoldButtons = new Map(COLORS.map(c => [c, button($('band-gold'), `<span class="swatch ${c}"></span>${label(c)}`, () => choose({ bandGold: c }), 'gold')]));
document.querySelectorAll('#quality button').forEach(b => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.quality) === quality));
  b.addEventListener('click', () => { localStorage.setItem('erica-sh-quality', b.dataset.quality); const u = new URL(location.href); u.searchParams.delete('q'); location.href = u; });
});

function render() {
  for (const [s, b] of shapeButtons) b.setAttribute('aria-pressed', String(s === state.shape));
  for (const [c, b] of caratButtons) { b.setAttribute('aria-pressed', String(c === state.carat)); b.disabled = !have.has(`${state.shape}:${c}`); }
  for (const [c, b] of goldButtons) b.setAttribute('aria-pressed', String(c === state.gold));
  for (const [v, b] of bandButtons) b.setAttribute('aria-pressed', String(v === state.band));
  for (const [c, b] of bandGoldButtons) b.setAttribute('aria-pressed', String(c === state.bandGold));
  $('band-gold-field').hidden = state.band === 'none';
  $('shape-label').textContent = label(state.shape);
  $('carat-label').textContent = `${state.carat} ct`;
  $('pose-label').textContent = state.pose === 'flat' ? 'Stand' : 'Rest';
  $('selection-summary').textContent = `${label(state.shape)} / ${state.carat} ct${state.band === 'none' ? '' : ` / ${state.band === 'pave' ? 'Half Eternity' : 'Plain'} band`}`;
  // keep the selection in the URL so a view can be shared / reloaded
  const u = new URL(location.href);
  for (const [k, v, d] of [['shape', state.shape, null], ['ct', state.carat, null], ['band', state.band, 'none'], ['gold', state.gold, null], ['bgold', state.bandGold, null], ['pose', state.pose, 'upright']]) {
    if (v === d) u.searchParams.delete(k); else u.searchParams.set(k, v);
  }
  history.replaceState(null, '', u);
}

let loadedKey = '';
async function choose(patch) {
  Object.assign(state, patch);
  if (!have.has(`${state.shape}:${state.carat}`)) state.carat = CARATS.filter(c => have.has(`${state.shape}:${c}`)).sort((a, b) => Math.abs(a - state.carat) - Math.abs(b - state.carat))[0];
  render();
  if (patch.gold) viewer.setGold(state.gold);
  if (patch.bandGold) viewer.setBandGold(state.bandGold);
  const key = `${state.shape}:${state.carat}:${state.band}`;
  if (key !== loadedKey) {
    $('update-status').textContent = 'Loading...';
    const ring = ringFor(state.shape, state.carat), band = state.band === 'none' ? null : bandFor(state.shape, state.carat, state.band);
    try {
      const ok = await viewer.loadSet(`./models/${ring.file}`, band ? `./models/${band.file}` : null, { rest: ring.rest, setRest: manifest.setRest[`${state.shape}:${state.carat}:${state.band}`] });
      if (ok && patch.band !== undefined && !patch.init) viewer.ijewelView(viewParams());
      if (ok) loadedKey = key;
      $('error').hidden = true;
    } catch (e) { console.error(e); $('error').textContent = 'This ring could not load. Please try again.'; $('error').hidden = false; }
    $('update-status').textContent = '';
  }
}

function viewParams() {
  // Same camera as the live Erica page: its saved direction (elevation 57.2, azimuth 150 in the model frame) and
  // centerView distance; Rest keeps the azimuth at a 30 deg floor-level angle, as on the live page.
  return { elevation: params.has('el') ? Number(params.get('el')) : (state.pose === 'flat' ? 30 : 57.2), azimuth: params.has('az') ? Number(params.get('az')) : 150 };
}
$('pose-toggle').addEventListener('click', () => { state.pose = state.pose === 'flat' ? 'upright' : 'flat'; viewer.applyPose(state.pose); viewer.ijewelView(viewParams()); render(); });
$('center-view').addEventListener('click', () => viewer.ijewelView(viewParams()));

viewer.applyPose(state.pose);
render();
// Studio panel (HDRI, tone mapping, bloom, ground, metal, diamond, presets): the "Studio" tab of the options column
// (on phones it temporarily replaces the ring options), so the ring stays fully visible while adjusting.
const studio = await createStudio({ viewer, root: $('studio'), page: 'erica', defaults: STUDIO_PAGE_DEFAULTS, params });
window.ericaStudio = studio;
function setStudio(open) {
  const before = $('viewer').clientHeight;
  $('studio').hidden = !open; $('env-toggle').setAttribute('aria-expanded', String(open));
  $('tab-studio').setAttribute('aria-selected', String(open)); $('tab-ring').setAttribute('aria-selected', String(!open));
  document.querySelector('.panel').classList.toggle('studio-open', open);
  requestAnimationFrame(() => requestAnimationFrame(() => { if (Math.abs($('viewer').clientHeight - before) > 8 && viewer.bounds) { viewer.resize(); viewer.ijewelView(viewParams()); } }));
}
$('env-toggle').addEventListener('click', () => setStudio($('studio').hidden));
$('tab-studio').addEventListener('click', () => setStudio(true));
$('tab-ring').addEventListener('click', () => setStudio(false));
if (params.has('hdri') || params.has('studio')) setStudio(true);
if (params.has('rot')) viewer.setEnvRotation(Number(params.get('rot')));   // old pilot param (radians, both)
viewer.setGold(state.gold); viewer.setBandGold(state.bandGold);
await choose({ init: true });
viewer.ijewelView(viewParams());
$('startup').hidden = true;
viewer.addEventListener('converged', () => { document.documentElement.dataset.converged = '1'; });
