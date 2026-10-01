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
const viewer = { renderer: { displayCanvasScaling: 1 }, getPluginByType: () => plugin, addEventListener() {}, setDirty() {} };
let assemblies = 0, restored = 0;
const api = { prepareConfiguratorTryon: () => { assemblies++; return { restore: () => { restored++; } }; } };
const session = manageTryonSession(viewer);
assert.equal(session.phase, 'running');
session.prepare(api, plugin);
await session.flipCamera();
const view = session.captureView();
assert.equal(view.flipped, true);
assert.equal(session.detach(), true);
assert.equal(restored, 1);
assert.equal(session.attach(api, view), true);
assert.equal(assemblies, 2);
assert.equal(plugin.running, true, 'AR keeps running during a live swap');
// Fallback restart: a fresh start resets the camera; restoreView flips it back once.
listeners.start(); listeners.initialized();
await session.restoreView(view);
assert.equal(plugin.flips, 2);
assert.equal(session.captureView().flipped, true);
console.log(`Defaults verified on ${sites.length} rings; live try-on swap and camera side restore verified.`);
