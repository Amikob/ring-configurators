export function applySavedScene(project, file) {
  const saved = typeof file.config === 'string' ? JSON.parse(file.config) : file.config;
  if (!saved?.sceneConfig || !saved?.plugins?.RingConfigurator) {
    throw new Error('The saved DIOR scene is incomplete.');
  }
  // iJewel owns scene appearance and finger calibration; the site owns its color controls.
  return {
    ...project,
    sceneConfig: saved.sceneConfig,
    tryonConfig: saved.tryonConfig || {enabled:false},
    plugins: {
      ...project.plugins,
      RingConfigurator: saved.plugins.RingConfigurator,
      SimpleBackgroundEnvUiPlugin2: saved.plugins.SimpleBackgroundEnvUiPlugin2 || {}
    }
  };
}
