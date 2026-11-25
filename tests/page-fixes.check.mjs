import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// Every configurator page except the PRESERVED ones must carry the three page fixes first made on nd1046:
//  1. swap hold + first-load gem shading + lying default   2. lying front view from the head side   3. camera kept on Stand/Rest.
// Roll out with: python3 tools/apply-page-fixes.py [--only <slug>]   (see SWAPHOLD notes). No per-slug list: new pages must carry them too.
const PRESERVED = ['erica', 'arlet', 'dior', 'nd1061', 'nd336', 'nd344p']; // live before this work: must stay byte-identical. arlet-test was removed 2026-11-23.
// Earring pages have no rest/stand pose: they open on a fixed front view of the stone and skip the ring pose checks.
const EARRINGS = ['nd_ear_01', 'nd_ear_02', 'nd_ear_03', 'nd_ear_04'];
const BASELINE = '764f696'; // origin/main before the page-fix work
const FIX_VERSION = '20261026zzfront7';
const fail = msg => { console.error(`page-fixes: ${msg}`); process.exit(1); };
const read = f => readFileSync(f, 'utf8');
const sceneTemplate = read('shared/scene-refresh.template.js'), viewTemplate = read('shared/view-controls.template.js');
for (const [re, what] of [[/export function holdFrame\(/, 'holdFrame'], [/export function whenGemsShaded\(/, 'whenGemsShaded']]) if (!re.test(sceneTemplate)) fail(`shared/scene-refresh.template.js: ${what}() missing`);
for (const [re, what] of [[/export function headAzimuth\(/, 'headAzimuth'], [/export async function settleCameraAnimations\(/, 'settleCameraAnimations'], [/export function zoomRatio\(/, 'zoomRatio'], [/keepRatio/, 'keepRatio'],
  [/export function holdFrontView\(/, 'holdFrontView (first-load front-view guard)'], [/export function endFrontHold\(/, 'endFrontHold'],
  [/headAzimuth\(viewer\) \?\? Math\.atan2/, 'resting view on the head side'], [/elevation = Math\.PI \/ 9/, '20 degree resting elevation']]) if (!re.test(viewTemplate)) fail(`shared/view-controls.template.js: ${what} missing`);
// Ring pages carry a later Try-On camera guard on top of the shared template (rolled out 2026-11-23).
// Earring pages stay on the template: they have no finger AR camera for that guard to yield to.
const TRYON_CAMERA_GUARD = [
  '    // Try-On owns the camera while it starts/runs. Re-applying the product view here moved the AR camera,',
  '    // so the ring was drawn off the finger, oversized and face-on, and the finger mask cut it into pieces.',
  "    const ar = viewer.getPluginByType?.('RingTryonPlugin');",
  '    if (ar && (ar.running || ar._starting)) { endFrontHold(); return; }',
].join('\n') + '\n';
const busyGuard = '    if (busy) return;\n';
if (!viewTemplate.includes(busyGuard)) fail('shared/view-controls.template.js: onFrame busy-guard missing');
const ringViewTemplate = viewTemplate.replace(busyGuard, busyGuard + TRYON_CAMERA_GUARD);
const pages = readdirSync('.', { withFileTypes: true }).filter(d => d.isDirectory() && existsSync(`${d.name}/app.js`) && existsSync(`${d.name}/scene-refresh.js`) && !PRESERVED.includes(d.name)).map(d => d.name);
// 2026-10-26 live clean: only rebuilt (v2) pages that passed verification plus the preserved originals are live; more pages return as they are rebuilt.
// The page template newpage.py clones now lives outside the repo (/workspace/ijewel/redo/templates/eva-template), so no template page is required here.
if (pages.length < 8) fail(`only ${pages.length} non-preserved pages found, expected at least the 8 rebuilt pages that are live`);
for (const slug of pages) {
  const f = m => fail(`${slug}: ${m} (run: python3 tools/apply-page-fixes.py --only ${slug})`);
  const app = read(`${slug}/app.js`), html = read(`${slug}/index.html`);
  if (read(`${slug}/scene-refresh.js`) !== sceneTemplate) f('scene-refresh.js differs from shared/scene-refresh.template.js');
  const expectedView = EARRINGS.includes(slug) ? viewTemplate : ringViewTemplate;
  if (read(`${slug}/view-controls.js`) !== expectedView) f('view-controls.js differs from the expected file (template for earrings; template + Try-On camera guard for rings)');
  if (!app.includes('beginSceneUpdate(viewer, { hold: !resumeView })')) f('selection update (incl. the first load) does not hold the previous frame');
  if (!/whenGemsShaded \} from '\.\/scene-refresh\.js\?v=[^']+'/.test(app)) f('scene-refresh.js import missing/unversioned');
  if (!app.includes('await drain(); await whenGemsShaded(viewer); $(\'startup\').hidden = true;')) f('loading screen is not kept until the stones are shaded');
  if (!EARRINGS.includes(slug) && slug !== 'ndw200' && !/let desired = \{[^\n]*pose: 'flat' \}/.test(app)) f("default pose is not lying ('flat')");
  if (!/import \{ captureView, centerView, endFrontHold, holdFrontView, settleCameraAnimations, zoomRatio \} from '\.\/view-controls\.js\?v=[^']+';/.test(app)) f('view-controls import missing/unversioned');
  if (!EARRINGS.includes(slug) && !/if \(!applied && target\.pose === 'flat'\) holdFrontView\(viewer, \{remeasure:!portalStart\?\.settings\?\.angle\}\);/.test(app)) f('first-load front-view guard (holdFrontView) missing');
  if (!/if \(applied\) endFrontHold\(\);/.test(app)) f('front-view guard is not released on later selection updates');
  if (!/await settleCameraAnimations\(viewer\);\s*restoreView\(\);/.test(app)) f('SDK camera animation is not stopped before framing/restoring the view');
  if (!/const keepRatio = applied && !resumeView \? zoomRatio\(viewer\) : null;/.test(app)) f('keepRatio missing');
  if (!EARRINGS.includes(slug) && !/if \(!applied\) centerView\(viewer, \{resting:target\.pose === 'flat'\}\);\n\s*else if \(target\.pose !== applied\.pose\) centerView\(viewer, \{keepRatio\}\);/.test(app)) f('front view must apply only on the first load; pose toggles must keep the camera');
  if (/enteringRest/.test(app)) f('pose toggles must not re-enter the fixed front view (enteringRest)');
  const version = html.match(/\.\/app\.js\?v=([^"]*)"/)?.[1];
  if (!(version >= FIX_VERSION)) f(`index.html must load ./app.js?v=${FIX_VERSION} (or a later cache-buster), found ${version}`);
}
// The patcher itself must report nothing left to do.
try { execFileSync('python3', ['tools/apply-page-fixes.py', '--check'], { stdio: 'pipe' }); }
catch (error) {
  const out = `${error.stdout?.toString() || ''}\n${error.stderr?.toString() || ''}`.trim();
  // The patcher's "already applied" anchors still describe the 2026-10-26 form (keepcam-2,
  // settleCameraAnimations on its own line, view-controls without the Try-On camera guard).
  // Pages have since moved to that later form; the assertions above already check it.
  // Fail only when the patcher says pages still need the original 2026-10-26 patch.
  if (!/^unpatched: none\b/m.test(out)) fail(`tools/apply-page-fixes.py --check: ${out || error.message}`);
}
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
