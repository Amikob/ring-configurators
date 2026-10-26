import { readFileSync } from 'node:fs';
// nd1046 opens lying (Rest) and must be framed from the head side (stone facing the camera), not from behind.
const fail = msg => { console.error(`lying-front: ${msg}`); process.exit(1); };
const view = readFileSync('nd1046/view-controls.js', 'utf8'), app = readFileSync('nd1046/app.js', 'utf8');
if (!/export function headAzimuth\(/.test(view)) fail('headAzimuth() missing');
if (!/headAzimuth\(viewer\) \?\? Math\.atan2/.test(view)) fail('resting view does not place the camera on the head side');
if (!/elevation = Math\.PI \/ 9/.test(view)) fail('resting elevation is not 20 degrees');
if (!/export async function settleCameraAnimations\(/.test(view)) fail('settleCameraAnimations() missing (SDK fit-to-view animation overrides the first framing)');
if (!/await settleCameraAnimations\(viewer\);\n\s*restoreView\(\);/.test(app)) fail('app.js must stop the SDK camera animation before framing/restoring the view');
if (!/view-controls\.js\?v=keepcam-1/.test(app)) fail('view-controls.js import not versioned');
// The fixed front view is first-load only; pose toggles keep the user's camera direction and zoom.
if (!/if \(!applied\) centerView\(viewer, \{resting:target\.pose === 'flat'\}\);/.test(app)) fail('resting front view must apply only when !applied (first load)');
if (/centerView\(viewer, \{resting:enteringRest\}\)/.test(app) || /enteringRest/.test(app)) fail('pose toggles must not re-enter the fixed front view');
if (!/else if \(target\.pose !== applied\.pose\) centerView\(viewer, \{keepRatio\}\);/.test(app)) fail('pose toggle must keep camera direction (keepRatio)');
if (!/export function zoomRatio\(/.test(view) || !/keepRatio/.test(view)) fail('zoomRatio/keepRatio missing in view-controls.js');
console.log('Lying first view: camera sits on the head side at 20 degrees; SDK fit animation cancelled before framing.');
