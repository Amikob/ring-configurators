import assert from 'node:assert/strict';
import fs from 'node:fs';

// Every ring opens on Oval 3 ct. Single-tone gold is yellow; two-tone is white head + yellow shank.
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
  // Try-on uses each ring's own original session module (live-swap experiment is on a branch).
  assert(/from '\.\/tryon-session\.js/.test(app), `${site}: original try-on module`);
  assert(fs.existsSync(new URL(`../${site}/tryon-session.js`, import.meta.url)), `${site}: tryon-session.js present`);
}
console.log(`Defaults verified on ${sites.length} rings; original try-on flow in place.`);
