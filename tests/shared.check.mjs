import assert from 'node:assert/strict';
import fs from 'node:fs';
import {manageTryonSession} from '../shared/tryon-session.js';

// 1. Every ring opens on Oval 3 ct. Single-tone gold is yellow; two-tone is white head + yellow shank.
const sites = JSON.parse(fs.readFileSync(new URL('../configurators.json', import.meta.url))).configurators.map(c => c.id);
for (const site of sites) {
  const app = fs.readFileSync(new URL(`../${site}/app.js`, import.meta.url), 'utf8');
  const line = app.match(/^let desired = (\{[^\n]*\});$/m)?.[1];
  assert(line, `${site}: default selection not found`);
  const desired = Function(`return ${line}`)();
  assert.equal(desired.shape, 'oval', site);
  assert.equal(desired.carat, 3, site);
  if ('headGold' in desired) assert.equal(desired.headGold, 'white', site);
  assert.equal(desired.ringGold, 'yellow', site);
  if ('bandGold' in desired) assert.equal(desired.bandGold, 'yellow', site);
  assert(app.includes("from '../shared/tryon-session.js"), `${site}: uses shared try-on session`);
  assert(app.includes('tryonSession.detach()') && app.includes('tryonSession.attach('), `${site}: live swap wired`);
}

// 2. Live swap keeps AR running and the camera side survives a fallback restart.
const listeners = {};
const plugin = {
  running: true, finger: 'ring', videoScale: 1, cameraZoom: 1, flips: 0,
  addEventListener(type, fn) { listeners[type] = fn; }, removeEventListener() {},
  async flipCamera() { this.flips++; }, async stop() { this.running = false; listeners.stop?.(); }
};
// Minimal stand-in for the scene: scale is a 3-number array like three.js toArray/fromArray.
const vec = v => ({ v: [...v], toArray() { return [...this.v]; }, fromArray(a) { this.v = [...a]; } });
const object3d = (s = [1, 1, 1]) => ({ position: vec([0, 0, 0]), quaternion: vec([0, 0, 0, 1]), scale: vec(s), parent: null, children: [] });
const root = object3d([0.1, 0.1, 0.1]);
root.updateMatrixWorld = () => {};
const scale = root.scale;
const addChild = child => { child.parent = root; root.children.push(child); return child; };
const removeChild = child => { child.parent = null; root.children.splice(root.children.indexOf(child), 1); };
const oldRing = addChild(object3d());
const viewer = { renderer: { displayCanvasScaling: 1 }, scene: { modelRoot: root }, getPluginByType: () => plugin, addEventListener() {}, setDirty() {} };
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
let assemblies = 0, restored = 0, repaired = 0;
// Mirrors the SDK assembly: remember the current scale, use unit scale in AR, restore on exit.
const api = { prepareConfiguratorTryon: () => {
  assemblies++; const saved = scale.toArray(); scale.fromArray([1, 1, 1]);
  return { restore: () => { restored++; scale.fromArray(saved); } };
} };
const session = manageTryonSession(viewer, { onRestored: () => { repaired++; } });
assert.equal(session.phase, 'running');
plugin.running = false; // the first assembly is built before AR starts
session.prepare(api, plugin);
plugin.running = true;
await session.flipCamera();
const view = session.captureView();
assert.equal(view.flipped, true);
assert.equal(session.detach(), true);
assert.equal(restored, 1);
scale.fromArray([7, 7, 7]); // AR fits the ring to the finger between frames
removeChild(oldRing); const newRing = addChild(object3d()); // the configurator swaps the ring model
assert.equal(session.attach(api, view), true);
newRing.position.fromArray([30, -12, 4]); newRing.quaternion.fromArray([0.5, 0.5, 0.5, 0.5]); // tracked on the finger
assert.equal(assemblies, 2);
assert.equal(plugin.running, true, 'AR keeps running during a live swap');
// Exiting AR after a live swap returns the studio scale (the bug: the ring came back zoomed in).
const assembly = session.prepared;
await plugin.stop();
assembly.restore(); // the SDK restores its assembly from its own stop listener
assert.deepEqual(scale.v, [0.1, 0.1, 0.1], 'studio scale is back after AR');
await new Promise(r => setTimeout(r, 10));
assert.equal(repaired, 1, 'scene repair runs once after a session with live swaps');
assert.deepEqual(newRing.position.v, [0, 0, 0], 'swapped-in ring returns to its studio position');
assert.deepEqual(newRing.quaternion.v, [0, 0, 0, 1], 'swapped-in ring returns to its studio rotation');
assert.deepEqual(root.scale.v, [0.1, 0.1, 0.1]);
plugin.running = true;
// Fallback restart: a fresh start resets the camera; restoreView flips it back once.
listeners.start(); listeners.initialized();
await session.restoreView(view);
assert.equal(plugin.flips, 2);
assert.equal(session.captureView().flipped, true);
console.log(`Defaults verified on ${sites.length} rings; live try-on swap and camera side restore verified.`);
