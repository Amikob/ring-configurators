// Arlet TEST only: on-device debug overlay, active only with ?debug=1.
import { viewerDiagnostics } from './viewer-diagnostics.js?v=15.1';
const KEY = 'arlet-test-debug-log';
const enabled = new URLSearchParams(location.search).get('debug') === '1';
const start = performance.now();
let getViewer = () => null, switches = 0, lastShape = null, panel, previous = null;
const mb = b => b == null ? '-' : (b / 1048576).toFixed(1) + 'MB';
function load() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function save(log) { try { localStorage.setItem(KEY, JSON.stringify(log.slice(-50))); } catch {} }
function glbStats() {
  const entries = performance.getEntriesByType('resource').filter(e => /\.glb|\.gltf|\.drc|\/files?\//i.test(e.name) || /octet/.test(e.initiatorType));
  const glb = entries.filter(e => /\.glb|\.gltf|\.drc/i.test(e.name));
  const list = glb.length ? glb : entries;
  return { count: list.length, bytes: list.reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0) };
}
function snapshot(sessionId) {
  const v = getViewer();
  let d = {}; try { d = viewerDiagnostics(v, window.Cache); } catch {}
  const info = v?.renderer?.rendererObject?.info;
  const pm = performance.memory;
  const g = glbStats();
  return { session: sessionId, t: new Date().toISOString(), uptime: Math.round((performance.now() - start) / 1000), switches, shape: lastShape,
    geometries: info?.memory?.geometries, textures: info?.memory?.textures, triangles: info?.render?.triangles, calls: info?.render?.calls,
    programs: info?.programs?.length, meshes: d.meshes, materials: d.materials, heapUsed: pm?.usedJSHeapSize, heapLimit: pm?.jsHeapSizeLimit,
    glbCount: g.count, glbBytes: g.bytes, dpr: devicePixelRatio, renderScale: v?.renderer?.displayCanvasScaling };
}
const session = Date.now().toString(36);
function draw() {
  const s = snapshot(session);
  const prev = previous ? `<b>Previous session ended ${new Date(previous.t).toLocaleTimeString()}</b><br>after ${previous.switches} switches, ${previous.uptime}s, geo ${previous.geometries} tex ${previous.textures} tri ${previous.triangles} heap ${mb(previous.heapUsed)}<hr>` : '';
  panel.innerHTML = prev + `switches ${s.switches} (${s.shape || '-'}) · up ${s.uptime}s<br>geo ${s.geometries ?? '-'} · tex ${s.textures ?? '-'} · prog ${s.programs ?? '-'}<br>tri ${s.triangles ?? '-'} · calls ${s.calls ?? '-'} · meshes ${s.meshes ?? '-'}<br>heap ${pm() ? mb(s.heapUsed) + ' / ' + mb(s.heapLimit) : 'n/a (iOS)'}<br>GLB ${s.glbCount} · ${mb(s.glbBytes)}<br>dpr ${s.dpr} · scale ${s.renderScale ?? '-'}`;
  return s;
}
const pm = () => Boolean(performance.memory);
export function initDebugOverlay(viewerGetter) {
  if (!enabled) return;
  try {
    getViewer = viewerGetter;
    const log = load();
    previous = log.filter(e => e.session !== session).pop() || null;
    performance.setResourceTimingBufferSize?.(2000);
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;max-width:300px;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.78);border-radius:6px;pointer-events:auto';
    panel.ondblclick = () => { localStorage.removeItem(KEY); previous = null; };
    document.body.appendChild(panel);
    setInterval(() => { try { draw(); } catch {} }, 1000);
    const heartbeat = () => { try { const l = load(); const s = snapshot(session); s.kind = 'tick'; if (l.length && l[l.length - 1].session === session && l[l.length - 1].kind === 'tick') l[l.length - 1] = s; else l.push(s); save(l); } catch {} };
    setInterval(heartbeat, 3000);
  } catch (e) { console.warn('debug overlay failed', e); }
}
export function noteSwitch(target) {
  if (!enabled || !target) return;
  try {
    if (target.shape !== lastShape) { if (lastShape !== null) switches++; lastShape = target.shape; }
    const l = load(); const s = snapshot(session); s.kind = 'switch'; s.selection = target; l.push(s); save(l);
  } catch {}
}
