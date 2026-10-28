// Mini Viewer prepares an assembly for each Try-On session.
// Restore that assembly before the configurator changes or disposes any models.
export function manageTryonSession(viewer, { touchDevice = false, onChange = () => {} } = {}) {
  let plugin, phase = 'idle', previousScale, stopping;

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
  function update(next) { phase = next; onChange(); }
  function started() { limitRendering(); update('starting'); }
  function initialized() { limitRendering(); update('running'); }
  function stopped() { restoreRendering(); update('idle'); }
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
    return { finger: plugin.finger, videoScale: plugin.videoScale, cameraZoom: plugin.cameraZoom };
  }
  function restoreView(view) {
    if (!view || !plugin?.running) return;
    if (view.finger !== undefined) plugin.finger = view.finger;
    for (const key of ['videoScale', 'cameraZoom']) {
      if (Number.isFinite(view[key])) plugin[key] = view[key];
    }
  }
  return { stop, captureView, restoreView, get phase() { return phase; } };
}
