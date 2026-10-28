export function applySavedScene(project, file) {
  const saved = typeof file.config === 'string' ? JSON.parse(file.config) : file.config;
  if (!saved?.plugins?.RingConfigurator) {
    throw new Error('The saved Malani catalog is incomplete.');
  }
  // Use the saved scene only when it is a real scene (has Environment and Ground).
  // An empty PresetLibraryPlugin would wipe the project's HDR, ground shadow and vjson scene.
  const sc = saved.sceneConfig;
  const sceneIsReal = !!(sc && sc.Environment && sc.Ground);
  const baseBg = project.plugins.SimpleBackgroundEnvUiPlugin2;
  const savedBg = saved.plugins.SimpleBackgroundEnvUiPlugin2;
  // iJewel owns scene appearance and finger calibration; the site owns its color controls.
  return {
    ...project,
    sceneConfig: sceneIsReal ? sc : project.sceneConfig,
    tryonConfig: saved.tryonConfig?.enabled ? saved.tryonConfig : project.tryonConfig,
    plugins: {
      ...project.plugins,
      RingConfigurator: saved.plugins.RingConfigurator,
      SimpleBackgroundEnvUiPlugin2: sceneIsReal ? (savedBg || baseBg || {}) : (baseBg || savedBg || {})
    }
  };
}
