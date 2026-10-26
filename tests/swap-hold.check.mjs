import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// Pages that already carry the swap hold (rolled out one page at a time, after the owner approves each step).
const ROLLED_OUT = ['nd1046'];
// Live before the swap-hold work started: must stay byte-identical to what was live.
const PRESERVED = ['erica', 'arlet', 'arlet-test', 'ada', 'dior', 'nd1061', 'nd336', 'nd344p'];
const BASELINE = '764f696'; // origin/main before the swap-hold work
const template = readFileSync('shared/scene-refresh.template.js', 'utf8');
const fail = msg => { console.error(msg); process.exit(1); };
for (const slug of ROLLED_OUT) {
  const app = readFileSync(`${slug}/app.js`, 'utf8');
  const f = m => fail(`${slug}: ${m}`);
  if (readFileSync(`${slug}/scene-refresh.js`, 'utf8') !== template) f('scene-refresh.js differs from shared/scene-refresh.template.js');
  if (!app.includes('beginSceneUpdate(viewer, { hold: !resumeView })')) f('selection update (incl. the first load) does not hold the previous frame');
  if (!app.includes('scene-refresh.js?v=hold-4')) f('scene-refresh.js import not versioned for the hold');
  if (!app.includes('await drain(); await whenGemsShaded(viewer); $(\'startup\').hidden = true;')) f('loading screen is not kept until the stones are shaded');
  if (!/let desired = \{[^\n]*pose: 'flat' \}/.test(app)) f("default pose is not lying ('flat')");
}
for (const d of readdirSync('.', { withFileTypes: true })) {
  if (!d.isDirectory() || ROLLED_OUT.includes(d.name) || !existsSync(`${d.name}/app.js`)) continue;
  if (readFileSync(`${d.name}/app.js`, 'utf8').includes('hold: !resumeView')) fail(`${d.name}: carries the swap hold but is not in ROLLED_OUT`);
}
let guarded = 0;
try {
  execFileSync('git', ['cat-file', '-e', `${BASELINE}^{commit}`], { stdio: 'ignore' });
  for (const slug of PRESERVED) {
    if (!existsSync(slug)) continue;
    const diff = execFileSync('git', ['diff', '--name-only', BASELINE, '--', slug]).toString().trim();
    if (diff) fail(`${slug}: preserved live page changed since ${BASELINE}: ${diff.split('\n').join(', ')}`);
    guarded++;
  }
} catch (error) { if (error.status !== undefined && error.status !== 128) throw error; console.warn('baseline commit not available, skipping preserved-page check'); }
console.log(`Swap hold: ${ROLLED_OUT.join(', ')} hold the previous frame until the new ring is posed and shaded (first load keeps the loading screen until the stones are shaded); ${guarded} preserved pages untouched.`);
