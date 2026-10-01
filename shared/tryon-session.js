// Mini Viewer prepares an assembly for each Try-On session.
// Restore that assembly before the configurator changes or disposes any models.
//
// Live swap (2026-10-01): while AR is running, a new shape/carat/band no longer stops and
// restarts the camera. The app calls detach() before replacing the model and attach()
// afterwards, so the new ring appears on the same finger with the same camera.
// If live swap fails, the app falls back to a restart and restoreView() puts the
// camera back on the same side (front/back) the shopper had chosen.
export function manageTryonSession(viewer, { touchDevice = false, onChange = () => {} } = {}) {
  let plugin, phase = 'idle', previousScale, stopping, prepared, flipped = false;

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
  // Every fresh start opens the plugin's default camera.
  function started() { flipped = false; limitRendering(); update('starting'); }
  function initialized() { limitRendering(); update('running'); }
  function stopped() { prepared = undefined; restoreRendering(); update('idle'); }
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

  // Group the ring (and band) into the single assembly the Try-On plugin tracks.
  function prepare(api, tryon) {
    prepared?.restore();
    prepared = api.prepareConfiguratorTryon(viewer, tryon);
    return prepared;
  }
  // Undo the assembly while AR keeps running, so components can swap their models.
  function detach() {
    if (!plugin?.running || !prepared || phase !== 'running') return false;
    try {
      prepared.restore();
      prepared = undefined;
      return true;
    } catch (error) {
      console.warn('Try-On detach failed', error);
      return false;
    }
  }
  // Rebuild the assembly around the new models on the same finger.
  function attach(api, view) {
    if (!plugin?.running) return false;
    try {
      prepare(api, plugin);
      // Re-assigning the finger makes the plugin re-read the ring it is placing.
      plugin.finger = view?.finger ?? plugin.finger;
      viewer.setDirty();
      return true;
    } catch (error) {
      console.warn('Live ring swap failed', error);
      return false;
    }
  }
  async function flipCamera() {
    bind();
    if (!plugin?.running) return false;
    const result = await plugin.flipCamera();
    flipped = !flipped;
    return result;
  }
  function captureView() {
    if (!plugin?.running) return null;
    return { finger: plugin.finger, videoScale: plugin.videoScale, cameraZoom: plugin.cameraZoom, flipped };
  }
  async function restoreView(view) {
    if (!view || !plugin?.running) return;
    if (view.flipped && !flipped) {
      try { await flipCamera(); } catch (error) { console.warn('Try-On camera side could not be restored', error); }
    }
    if (view.finger !== undefined) plugin.finger = view.finger;
    for (const key of ['videoScale', 'cameraZoom']) {
      if (Number.isFinite(view[key])) plugin[key] = view[key];
    }
  }
  return {
    stop, prepare, detach, attach, flipCamera, captureView, restoreView,
    get phase() { return phase; },
    get prepared() { return prepared; }
  };
}
