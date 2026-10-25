// Portal start settings: one central file (portal-settings.json) decides how every ring page OPENS.
// Used by every configurator page (app.js) and by the admin page (admin/), so the rules live in one place.
// With a missing, empty or broken settings file nothing changes: every page opens exactly as before.
//
// File shape (all parts optional):
//   { "version": 1,
//     "global":      { ...settings applied to every ring page... },
//     "rules":       [ { "name": "...", "filter": { "tone": "two"|"one", "band": true|false }, "set": { ...settings... } } ],
//     "collections": { "<slug>": { ...settings for that one collection... } },
//     "presets":     [ { "name": "...", "settings": { ...settings... } } ],
//     "scenes":      { "<name>": { "environmentIntensity": 1, "environmentRotation": 0, "sceneConfig": {...} } } }
// Settings keys (each optional): scene, carat, headColor, bodyColor, bandColor, angle {azimuth, elevation}, pose.
// Precedence per key: collection override > filter rule (later rule wins) > global > the page's own default.
// Starting shape is deliberately NOT a setting: the stone shape is chosen on the store website.

export const COLOR_NAMES = ['white', 'yellow', 'rose'];
export const POSE_NAMES = ['standing', 'lying'];
export const SETTING_KEYS = ['scene', 'carat', 'headColor', 'bodyColor', 'bandColor', 'angle', 'pose'];

// Built-in opening scenes: lighting variants of the saved iJewel scene. "default" = the saved scene untouched.
export const BUILTIN_SCENES = {
  default: {},
  bright: { environmentIntensity: 1.6 },
  soft: { environmentIntensity: 0.7 },
  dark: { environmentIntensity: 0.4 },
  'turned-light': { environmentRotation: 3.14159 },
  'bright-turned': { environmentIntensity: 1.6, environmentRotation: 1.5708 }
};

const isNum = value => typeof value === 'number' && Number.isFinite(value);

// Keep only valid, known settings. Returns a fresh object (never throws).
export function cleanSettings(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  if (typeof raw.scene === 'string' && raw.scene.trim()) out.scene = raw.scene.trim();
  if (isNum(raw.carat) && raw.carat > 0 && raw.carat <= 50) out.carat = raw.carat;
  for (const key of ['headColor', 'bodyColor', 'bandColor']) if (COLOR_NAMES.includes(raw[key])) out[key] = raw[key];
  if (raw.angle && isNum(raw.angle.azimuth) && isNum(raw.angle.elevation)) {
    out.angle = { azimuth: Math.round(raw.angle.azimuth * 10) / 10, elevation: Math.max(-5, Math.min(89, Math.round(raw.angle.elevation * 10) / 10)) };
  }
  if (POSE_NAMES.includes(raw.pose)) out.pose = raw.pose;
  return out;
}

// Rings of a page: tone (one/two) and band, from its configurators.json entry.
export function pageFacts(entry) {
  if (!entry) return { tone: null, band: null };
  const zones = entry.metalZones || [];
  return { tone: zones.includes('Head') ? 'two' : 'one', band: Boolean(entry.bands) };
}

export function ruleMatches(filter, facts) {
  if (!filter || typeof filter !== 'object') return false;
  if (filter.tone != null && filter.tone !== facts.tone) return false;
  if (filter.band != null && Boolean(filter.band) !== facts.band) return false;
  return filter.tone != null || filter.band != null;
}

// Pure resolver: global < matching rules in file order < collection override, key by key.
// Returns { settings, sources } where sources[key] says where each value came from.
export function resolveSettings(file, slug, facts) {
  const settings = {}, sources = {};
  const layer = (label, raw) => {
    for (const [key, value] of Object.entries(cleanSettings(raw))) { settings[key] = value; sources[key] = label; }
  };
  const data = file && typeof file === 'object' ? file : {};
  layer('global', data.global);
  if (Array.isArray(data.rules)) data.rules.forEach((rule, i) => { if (rule && ruleMatches(rule.filter, facts)) layer(`rule: ${rule.name || i + 1}`, rule.set); });
  if (data.collections && typeof data.collections === 'object') layer('collection', data.collections[slug]);
  return { settings, sources };
}

export function sceneDefinition(name, file) {
  if (!name) return null;
  const custom = file?.scenes && typeof file.scenes === 'object' ? file.scenes[name] : null;
  return custom && typeof custom === 'object' ? custom : BUILTIN_SCENES[name] || null;
}

function decodeOverride(value) {
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}
export function encodeOverride(object) {
  const bytes = new TextEncoder().encode(JSON.stringify(object));
  let binary = ''; bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Used by a ring page at load. Never throws; on any problem returns the "change nothing" result.
// URL parameter ?ps=<base64url JSON> (used by the admin live preview) replaces the settings file for that visit:
// it carries {"settings": {...}, "scenes": {...}} that are already resolved for this page.
export async function loadPortalStart({ slug, location = window.location } = {}) {
  const none = { settings: {}, sources: {}, scene: null, facts: { tone: null, band: null } };
  try {
    const name = slug || location.pathname.replace(/\/+$/, '').split('/').pop();
    let facts = { tone: null, band: null };
    try {
      const list = await (await fetch('../configurators.json', { cache: 'no-cache' })).json();
      facts = pageFacts(list.configurators.find(c => c.id === name || c.path === `${name}/`));
    } catch { /* tone stays unknown: tone rules do not match */ }
    const override = new URLSearchParams(location.search).get('ps');
    let file = null;
    if (override) {
      const decoded = decodeOverride(override);
      if (decoded) file = { global: decoded.settings || {}, scenes: decoded.scenes || {} };
    } else {
      try {
        const response = await fetch('../portal-settings.json', { cache: 'no-cache' });
        if (response.ok) file = await response.json();
      } catch { /* missing or unreadable file: pages behave exactly as before */ }
    }
    if (!file) return { ...none, facts };
    const { settings, sources } = resolveSettings(file, name, facts);
    return { settings, sources, scene: sceneDefinition(settings.scene, file), facts };
  } catch (error) { console.warn('Portal settings ignored', error); return none; }
}

// Scene: tweak the project scene before the viewer is created. Only touches fields the definition names.
export function applyPortalScene(project, scene) {
  if (!scene || !project) return false;
  let changed = false;
  const env = project.plugins ||= {};
  const plugin = env.SimpleBackgroundEnvUiPlugin2 ||= { type: 'SimpleBackgroundEnvUiPlugin2' };
  if (isNum(scene.environmentIntensity)) { plugin.sceneEnvironmentIntensity = scene.environmentIntensity; changed = true; }
  if (isNum(scene.environmentRotation)) { plugin.sceneEnvironmentRotation = scene.environmentRotation; changed = true; }
  if (scene.sceneConfig && typeof scene.sceneConfig === 'object') {
    project.sceneConfig = { ...(project.sceneConfig || {}), ...scene.sceneConfig }; changed = true;
  }
  return changed;
}

// Change the page's starting selection (carat, colours, pose) in place. Anything the set cannot do is skipped.
// `variations` = the Ring component's variations (optional; when absent the carat is checked later by guardDesired).
export function applyPortalDesired(desired, start, { colors = COLOR_NAMES, ringVariations = null, parseRing = null } = {}) {
  const s = start?.settings || {};
  const used = [];
  if (isNum(s.carat)) {
    const ok = !ringVariations || !parseRing || ringVariations.some(v => {
      const item = parseRing(v);
      return item && item.shape === desired.shape && item.carat === s.carat && (item.orientation || 'ns') === (desired.orientation || 'ns');
    });
    if (ok) { desired.carat = s.carat; used.push('carat'); }
  }
  const tone = start?.facts?.tone;
  if (s.bodyColor && colors.includes(s.bodyColor) && 'ringGold' in desired) {
    desired.ringGold = s.bodyColor; used.push('bodyColor');
    // One-tone pages keep head and shank the same gold.
    if (tone === 'one' && 'headGold' in desired) desired.headGold = s.bodyColor;
  }
  if (tone === 'two' && s.headColor && colors.includes(s.headColor) && 'headGold' in desired) { desired.headGold = s.headColor; used.push('headColor'); }
  if (s.bandColor && colors.includes(s.bandColor) && 'bandGold' in desired) { desired.bandGold = s.bandColor; used.push('bandColor'); }
  if (s.pose) { desired.pose = s.pose === 'lying' ? 'flat' : 'upright'; used.push('pose'); }
  return used;
}

// Safety net after the catalog exists: if the combination is impossible for this set, fall back to the page defaults.
export function guardDesired(desired, defaults, validate) {
  try { validate(desired); return desired; }
  catch (error) { console.warn('Portal start settings not possible for this ring; using page defaults', error); return { ...defaults }; }
}

// Camera angle: azimuth = degrees around the ring (0 = looking at the front, + turns to the right),
// elevation = degrees above the horizon. Keeps the camera distance chosen by the page's own fit.
export function readAngle(viewer) {
  const camera = viewer.scene.activeCamera;
  const d = camera.cameraObject.position.clone().sub(camera.target);
  const len = d.length() || 1;
  return {
    azimuth: Math.round(Math.atan2(d.x, d.z) * 1800 / Math.PI) / 10,
    elevation: Math.round(Math.asin(Math.max(-1, Math.min(1, d.y / len))) * 1800 / Math.PI) / 10
  };
}
export function applyStartAngle(viewer, angle) {
  if (!viewer || !angle) return false;
  const camera = viewer.scene.activeCamera;
  const target = camera.target.clone();
  const offset = camera.cameraObject.position.clone().sub(target);
  const dist = offset.length();
  if (!(dist > 0)) return false;
  const az = angle.azimuth * Math.PI / 180, el = angle.elevation * Math.PI / 180;
  offset.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist);
  camera.getControls()?.stopDamping();
  const object = camera.cameraObject;
  camera.setCameraOptions({ position: target.clone().add(offset).toArray(), target: target.toArray(), fov: object.fov, zoom: object.zoom });
  viewer.setDirty();
  return true;
}

// Lets the admin page (same origin, in an iframe) read the live camera angle: window.__portal.getAngle().
export function installPortalBridge(viewer, start) {
  window.__portal = { getAngle: () => readAngle(viewer), start, ready: () => document.body.dataset.ready === 'true' && document.body.dataset.busy === 'false' };
}
