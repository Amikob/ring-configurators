import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// Every configurator page except the PRESERVED ones must carry the three page fixes first made on nd1046:
//  1. swap hold + first-load gem shading + lying default   2. lying front view from the head side   3. camera kept on Stand/Rest.
// Roll out with: python3 tools/apply-page-fixes.py [--only <slug>]   (see SWAPHOLD notes). No per-slug list: new pages must carry them too.
const PRESERVED = ['erica', 'arlet', 'arlet-test', 'ada', 'dior', 'nd1061', 'nd336', 'nd344p']; // live before this work: must stay byte-identical
const BASELINE = '764f696'; // origin/main before the page-fix work
const FIX_VERSION = '20261026zhold5';
const fail = msg => { console.error(`page-fixes: ${msg}`); process.exit(1); };
const read = f => readFileSync(f, 'utf8');
const sceneTemplate = read('shared/scene-refresh.template.js'), viewTemplate = read('shared/view-controls.template.js');
for (const [re, what] of [[/export function holdFrame\(/, 'holdFrame'], [/export function whenGemsShaded\(/, 'whenGemsShaded']]) if (!re.test(sceneTemplate)) fail(`shared/scene-refresh.template.js: ${what}() missing`);
for (const [re, what] of [[/export function headAzimuth\(/, 'headAzimuth'], [/export async function settleCameraAnimations\(/, 'settleCameraAnimations'], [/export function zoomRatio\(/, 'zoomRatio'], [/keepRatio/, 'keepRatio'],
  [/headAzimuth\(viewer\) \?\? Math\.atan2/, 'resting view on the head side'], [/elevation = Math\.PI \/ 9/, '20 degree resting elevation']]) if (!re.test(viewTemplate)) fail(`shared/view-controls.template.js: ${what} missing`);
const pages = readdirSync('.', { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(`${d.name}/app.js`) && existsSync(`${d.name}/scene-refresh.js`) && !PRESERVED.includes(d.name)).map(d => d.name);
if (pages.length < 30) fail(`only ${pages.length} pages found, expected the full set`);
if (!pages.includes('eva')) fail('eva (the template newpage.py clones for new pages) must be a patched page');
for (const slug of pages) {
  const f = m => fail(`${slug}: ${m} (run: python3 tools/apply-page-fixes.py --only ${slug})`);
  const app = read(`${slug}/app.js`), html = read(`${slug}/index.html`);
  if (read(`${slug}/scene-refresh.js`) !== sceneTemplate) f('scene-refresh.js differs from shared/scene-refresh.template.js');
  if (read(`${slug}/view-controls.js`) !== viewTemplate) f('view-controls.js differs from shared/view-controls.template.js');
  if (!app.includes('beginSceneUpdate(viewer, { hold: !resumeView })')) f('selection update (incl. the first load) does not hold the previous frame');
  if (!app.includes('whenGemsShaded } from \'./scene-refresh.js?v=hold-5\'')) f('scene-refresh.js import not versioned for the hold');
  if (!app.includes('await drain(); await whenGemsShaded(viewer); $(\'startup\').hidden = true;')) f('loading screen is not kept until the stones are shaded');
  if (!/let desired = \{[^\n]*pose: 'flat' \}/.test(app)) f("default pose is not lying ('flat')");
  if (!/import \{ captureView, centerView, settleCameraAnimations, zoomRatio \} from '\.\/view-controls\.js\?v=keepcam-1';/.test(app)) f('view-controls import missing/unversioned');
  if (!/await settleCameraAnimations\(viewer\);\n\s*restoreView\(\);/.test(app)) f('SDK camera animation is not stopped before framing/restoring the view');
  if (!/const keepRatio = applied && !resumeView \? zoomRatio\(viewer\) : null;/.test(app)) f('keepRatio missing');
  if (!/if \(!applied\) centerView\(viewer, \{resting:target\.pose === 'flat'\}\);\n\s*else if \(target\.pose !== applied\.pose\) centerView\(viewer, \{keepRatio\}\);/.test(app)) f('front view must apply only on the first load; pose toggles must keep the camera');
  if (/enteringRest/.test(app)) f('pose toggles must not re-enter the fixed front view (enteringRest)');
  const version = html.match(/\.\/app\.js\?v=([^"]*)"/)?.[1];
  if (!(version >= FIX_VERSION)) f(`index.html must load ./app.js?v=${FIX_VERSION} (or a later cache-buster), found ${version}`);
}
// The patcher itself must report nothing left to do.
try { execFileSync('python3', ['tools/apply-page-fixes.py', '--check'], { stdio: 'pipe' }); }
catch (error) { fail(`tools/apply-page-fixes.py --check: ${error.stdout?.toString().trim() || error.message}`); }
let guarded = 0;
try {
  execFileSync('git', ['cat-file', '-e', `${BASELINE}^{commit}`], { stdio: 'ignore' });
  for (const slug of PRESERVED) {
    if (!existsSync(slug)) fail(`${slug}: preserved page is missing`);
    const diff = execFileSync('git', ['diff', '--name-only', BASELINE, '--', slug]).toString().trim();
    if (diff) fail(`${slug}: preserved live page changed since ${BASELINE}: ${diff.split('\n').join(', ')}`);
    guarded++;
  }
} catch (error) { if (error.status !== undefined && error.status !== 128) throw error; console.warn('baseline commit not available, skipping preserved-page check'); }
console.log(`Page fixes: ${pages.length} pages carry swap hold + first-load shading + lying default + head-side front view + kept camera; ${guarded} preserved pages byte-identical to ${BASELINE}.`);
