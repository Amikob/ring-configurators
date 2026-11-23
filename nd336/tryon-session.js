// Mini Viewer prepares an assembly for each Try-On session.
// Restore that assembly before the configurator changes or disposes any models.
// While a session runs, ring changes can be swapped live inside it (canSwapLive):
// the camera stream, the chosen front/back camera and hand tracking all stay as they are.
export function manageTryonSession(viewer, { touchDevice = false, onChange = () => {} } = {}) {
  let plugin, phase = 'idle', previousScale, stopping, lastFacing;
  const afterStop = [];

  function limitRendering() {
    if (!touchDevice) return;
    previousScale ??= viewer.renderer.displayCanvasScaling;
    viewer.renderer.displayCanvasScaling = Math.min(viewer.renderer.displayCanvasScaling, 1);
  }
  function restoreRendering() {
    if (previousScale !== undefined) {
      viewer.renderer.displayCanvasScaling = previousScale;
      previousScale = undefined;
    }
  }
  // Front/back camera the shopper chose. The plugin opens every start on mediaSettings.facingMode
  // (the saved default, normally the front camera), so a restart would otherwise lose the back camera.
  function trackFacing() {
    try {
      const facing = plugin?._cameraBackgroundPlugin?.videoFeed?.track?.getSettings?.().facingMode;
      return facing === 'user' || facing === 'environment' ? facing : '';
    } catch { return ''; }
  }
  function syncFacing() {
    const reported = plugin?.running && trackFacing();
    if (reported) lastFacing = reported;
  }
  // Tracking tolerance (web-vto 0.3.3 defaults hide the ring too eagerly):
  // - tracking.minHandDistance (default 10) hides the ring whenever the estimated hand distance is below it,
  //   so a hand held close to the camera loses the ring. 0 turns that gate off.
  // - any single frame without a detected hand hides the ring at once (_hideAll(true)). Hold the last pose
  //   for a short moment instead, then fade, so brief dropouts (motion blur, farther hand, low light) do not blink it away.
  const HOLD_MS = 600;
  function steadyTracking(tryon) {
    if (!tryon || tryon.__steadyTracking) return;
    tryon.__steadyTracking = true;
    try { if (tryon.tracking) tryon.tracking.minHandDistance = 0; } catch {}
    let lastPlaced = 0;
    const place = tryon.updateJewelryAndEffects;
    if (typeof place === 'function') {
      tryon.updateJewelryAndEffects = function (...args) { lastPlaced = performance.now(); return place.apply(this, args); };
    }
    const hide = tryon._hideAll;
    if (typeof hide === 'function') {
      tryon._hideAll = function (immediate) {
        if (this.running && !this.isImageMode && phase === 'running' && !stopping && lastPlaced && performance.now() - lastPlaced < HOLD_MS) return;
        return hide.call(this, this.running && phase === 'running' && !stopping ? false : immediate);
      };
    }
  }
  // Called after the Flip button switched cameras.
  function rememberCamera() {
    if (!plugin?.running) return;
    const reported = trackFacing();
    // Browsers that do not report facingMode: Flip toggles between the two cameras.
    lastFacing = reported || ((lastFacing || plugin.mediaSettings?.facingMode || 'user') === 'environment' ? 'user' : 'environment');
  }
  // Before tryon.start(): open directly on the remembered camera (no second camera switch after start).
  // The plugin builds mediaSettings in a getter on every start, so wrap that getter on this instance.
  function prepareStart(tryon = plugin) {
    steadyTracking(tryon);
    if (!tryon || Object.prototype.hasOwnProperty.call(tryon, 'mediaSettings')) return;
    let proto = Object.getPrototypeOf(tryon), descriptor;
    while (proto && !(descriptor = Object.getOwnPropertyDescriptor(proto, 'mediaSettings'))) proto = Object.getPrototypeOf(proto);
    if (!descriptor?.get) return;
    Object.defineProperty(tryon, 'mediaSettings', {
      configurable: true,
      get() {
        const base = descriptor.get.call(this);
        return lastFacing && base && typeof base === 'object' ? { ...base, facingMode: lastFacing } : base;
      },
      set(value) { if (descriptor.set) descriptor.set.call(this, value); }
    });
  }
  function update(next) { phase = next; onChange(); }
  function started() { limitRendering(); update('starting'); }
  function initialized() { limitRendering(); update('running'); }
  function stopped() {
    restoreRendering(); update('idle');
    // Work deferred while AR owned the scene (shadow bake, material cleanup) runs once the normal view is back.
    const pending = afterStop.splice(0);
    if (pending.length) setTimeout(() => {
      for (const task of pending) {
        try { task(); } catch (error) { console.warn('Try-On deferred update failed', error); }
      }
    }, 0);
  }
  function bind() {
    const next = viewer.getPluginByType('RingTryonPlugin');
    if (!next || next === plugin) return;
    if (plugin) {
      plugin.removeEventListener('start', started);
      plugin.removeEventListener('initialized', initialized);
      plugin.removeEventListener('stop', stopped);
      plugin.removeEventListener('error', failed);
    }
    plugin = next;
    plugin.addEventListener('start', started);
    plugin.addEventListener('initialized', initialized);
    plugin.addEventListener('stop', stopped);
    plugin.addEventListener('error', failed);
    if (plugin.running) initialized();
  }
  async function stop() {
    bind();
    if (stopping) return stopping;
    if (!plugin || (phase === 'idle' && !plugin.running)) return false;
    syncFacing();
    stopping = (async () => {
      await plugin.stop(true);
      if (plugin.running) throw new Error('Try-On could not stop. Exit AR before changing the ring.');
      stopped();
      return true;
    })();
    try { return await stopping; }
    finally { stopping = undefined; }
  }
  function failed() {
    // The plugin owns startup failure recovery; retain its error UI.
    if (!plugin.running) stopped();
  }
  viewer.addEventListener('addPlugin', bind);
  bind();
  function captureView() {
    if (!plugin?.running) return null;
    syncFacing();
    return { finger: plugin.finger, videoScale: plugin.videoScale, cameraZoom: plugin.cameraZoom, facing: lastFacing };
  }
  function restoreView(view) {
    if (!view || !plugin?.running) return;
    if (view.finger !== undefined) plugin.finger = view.finger;
    for (const key of ['videoScale', 'cameraZoom']) {
      if (Number.isFinite(view[key])) plugin[key] = view[key];
    }
  }
  // A selection can be applied inside the running session instead of stopping and restarting it.
  function canSwapLive() {
    return Boolean(plugin?.running) && phase === 'running' && !stopping;
  }
  // True when a configurator component's model is inside the scene Try-On is showing.
  function holds(component) {
    let node = component?._rootObject?.modelObject;
    while (node && node !== viewer.scene?.modelRoot) node = node.parent;
    return Boolean(node);
  }
  function whenStopped(task) {
    if (phase === 'idle' && !plugin?.running) { task(); return; }
    afterStop.push(task);
  }
  return { stop, captureView, restoreView, canSwapLive, holds, whenStopped, rememberCamera, prepareStart, get facing() { return lastFacing; }, get phase() { return phase; } };
}
