import assert from 'node:assert/strict';
import fs from 'node:fs';

// Every ring opens on Oval 3 ct (smallest carat if no 3 ct). Single-tone gold is yellow; two-tone is white head + yellow shank.
const sites = JSON.parse(fs.readFileSync(new URL('../configurators.json', import.meta.url))).configurators.map(c => c.id);
for (const site of sites) {
  const app = fs.readFileSync(new URL(`../${site}/app.js`, import.meta.url), 'utf8');
  const line = app.match(/^let desired = (\{[^\n]*\});$/m)?.[1];
  assert(line, `${site}: default selection not found`);
  const desired = Function(`return ${line}`)();
  if (site === 'nd_ear_01') { // earrings open on Round 1 ct, yellow gold, upright (no ring pose)
    assert.deepEqual([desired.shape, desired.carat, desired.ringGold, desired.pose], ['round', 1, 'yellow', 'upright'], site);
    continue;
  }
  assert.equal(desired.shape, 'oval', site);
  // Oval 3 ct, or the smallest carat when the set has no 3 ct (e.g. 4-10 ct sets).
  const carats = (fs.existsSync(new URL(`../${site}/catalog.js`, import.meta.url)) ? fs.readFileSync(new URL(`../${site}/catalog.js`, import.meta.url), 'utf8') : '').match(/CARATS\s*=\s*\[([^\]]*)\]/)?.[1]?.split(',').map(Number).filter(n => !isNaN(n));
  assert.equal(desired.carat, !carats || carats.includes(3) ? 3 : Math.min(...carats), site);
  if ('headGold' in desired) assert.equal(desired.headGold, 'white', site);
  assert.equal(desired.ringGold, 'yellow', site);
  if ('bandGold' in desired) assert.equal(desired.bandGold, 'yellow', site);
  // Try-on uses each ring's own original session module (live-swap experiment is on a branch).
  assert(/from '\.\/tryon-session\.js/.test(app), `${site}: original try-on module`);
  assert(fs.existsSync(new URL(`../${site}/tryon-session.js`, import.meta.url)), `${site}: tryon-session.js present`);
}
console.log(`Defaults verified on ${sites.length} rings; original try-on flow in place.`);
