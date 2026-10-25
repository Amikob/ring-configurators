import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cleanSettings, resolveSettings, ruleMatches, pageFacts, applyPortalDesired, SETTING_KEYS } from '../shared/portal-settings.js';

const root = new URL('../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const cfg = JSON.parse(read('configurators.json')).configurators;

// Schema: no shape setting, empty file is valid.
assert(!SETTING_KEYS.includes('shape'), 'no starting-shape setting');
const file = JSON.parse(read('portal-settings.json'));
assert.equal(file.version, 1);
assert.deepEqual(cleanSettings(file.global), {});
assert.deepEqual(resolveSettings(null, 'x', { tone: 'one', band: false }).settings, {});
assert.deepEqual(resolveSettings({}, 'x', {}).settings, {});
assert.deepEqual(resolveSettings('garbage', 'x', {}).settings, {});

// cleanSettings drops invalid values and unknown keys (including shape).
assert.deepEqual(cleanSettings({ shape: 'pear', carat: -1, bodyColor: 'purple', pose: 'flying', scene: ' dark ', angle: { azimuth: 'a', elevation: 1 } }), { scene: 'dark' });
assert.deepEqual(cleanSettings({ angle: { azimuth: 10.04, elevation: 200 } }), { angle: { azimuth: 10, elevation: 89 } });

// Precedence: global < rules (file order) < collection, per field.
const f = {
  global: { carat: 2, pose: 'lying', bodyColor: 'white' },
  rules: [{ name: 'two', filter: { tone: 'two' }, set: { headColor: 'white', bodyColor: 'yellow' } }, { name: 'band', filter: { band: true }, set: { bandColor: 'rose', carat: 3 } }],
  collections: { erica: { carat: 5, pose: 'standing' } }
};
let r = resolveSettings(f, 'erica', { tone: 'two', band: true });
assert.deepEqual(r.settings, { carat: 5, pose: 'standing', bodyColor: 'yellow', headColor: 'white', bandColor: 'rose' });
assert.equal(r.sources.carat, 'collection'); assert.equal(r.sources.bodyColor, 'rule: two'); assert.equal(r.sources.pose, 'collection');
r = resolveSettings(f, 'other', { tone: 'one', band: false });
assert.deepEqual(r.settings, { carat: 2, pose: 'lying', bodyColor: 'white' });
assert.equal(ruleMatches({}, { tone: 'one' }), false, 'empty filter matches nothing');

// Facts come from configurators.json.
const erica = cfg.find(c => c.id === 'erica'), ada = cfg.find(c => c.id === 'ada');
assert.deepEqual(pageFacts(ada), { tone: 'two', band: true });
assert.equal(pageFacts(erica).tone, 'one');

// Applying to a page's selection.
const d = { shape: 'oval', carat: 3, headGold: 'white', ringGold: 'yellow', bandGold: 'yellow', pose: 'flat' };
applyPortalDesired(d, { settings: { carat: 5, headColor: 'rose', bodyColor: 'white', pose: 'standing' }, facts: { tone: 'two' } });
assert.deepEqual(d, { shape: 'oval', carat: 5, headGold: 'rose', ringGold: 'white', bandGold: 'yellow', pose: 'upright' });
const one = { shape: 'oval', carat: 3, headGold: 'yellow', ringGold: 'yellow' };
applyPortalDesired(one, { settings: { headColor: 'white', bodyColor: 'rose' }, facts: { tone: 'one' } });
assert.deepEqual(one, { shape: 'oval', carat: 3, headGold: 'rose', ringGold: 'rose' }, 'one-tone ignores head colour');
const untouched = { shape: 'oval', carat: 3, ringGold: 'yellow' };
applyPortalDesired(untouched, { settings: {}, facts: { tone: 'one' } });
assert.deepEqual(untouched, { shape: 'oval', carat: 3, ringGold: 'yellow' }, 'empty settings change nothing');

// Every page is wired and has no fade.
const dirs = fs.readdirSync(root).filter(n => fs.existsSync(new URL(`${n}/app.js`, root)) && fs.existsSync(new URL(`${n}/viewer-transition.js`, root)));
assert(dirs.length >= cfg.length);
for (const dir of dirs) {
  const app = read(`${dir}/app.js`);
  assert(app.includes('shared/portal-settings.js'), `${dir}: reads portal settings`);
  assert(app.includes('loadPortalStart'), `${dir}: loads settings at start`);
  const tr = read(`${dir}/viewer-transition.js`);
  assert(!/opacity\s*=\s*['"]?0|setTimeout|requestAnimationFrame|transition\s*=\s*['"]opacity/.test(tr.replace(/\/\/.*$/gm, '')), `${dir}: no fade animation`);
  assert(/nofade/.test(app), `${dir}: uses the no-fade transition module`);
}
// The patcher reports nothing left to patch.
const out = execFileSync('python3', [new URL('../tools/apply-portal-settings.py', import.meta.url).pathname, '--check', new URL('.', root).pathname], { encoding: 'utf8' });
assert(/none/i.test(out), out);
console.log(`Portal settings: resolver, schema and ${dirs.length} pages verified (no fade).`);
