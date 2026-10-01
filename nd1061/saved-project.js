export function applySavedScene(project, file) {
  const saved = typeof file.config === 'string' ? JSON.parse(file.config) : file.config;
  if (!saved?.plugins?.RingConfigurator) {
    throw new Error('The saved ND1061 catalog is incomplete.');
  }
  // iJewel owns scene appearance and finger calibration; the site owns its color controls.
  return {
    ...project,
    sceneConfig: saved.sceneConfig || project.sceneConfig,
    tryonConfig: saved.tryonConfig?.enabled ? saved.tryonConfig : project.tryonConfig,
    plugins: {
      ...project.plugins,
      RingConfigurator: saved.plugins.RingConfigurator,
      SimpleBackgroundEnvUiPlugin2: saved.plugins.SimpleBackgroundEnvUiPlugin2 || project.plugins.SimpleBackgroundEnvUiPlugin2 || {}
    }
  };
}
