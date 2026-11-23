function num(value) {
  if (value == null || value === '') return value;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : value;
}

function vec3(value) {
  if (!value || typeof value !== 'object') return value;
  return { ...value, x: num(value.x), y: num(value.y), z: num(value.z) };
}

function group(value) {
  if (!value || typeof value !== 'object') return value;
  const out = { ...value };
  for (const [key, item] of Object.entries(value)) {
    if (item && typeof item === 'object' && !Array.isArray(item)) out[key] = group(item);
    else if (typeof item === 'string' && item.trim() !== '' && Number.isFinite(Number(item))) out[key] = num(item);
    else if (typeof item === 'number') out[key] = item;
  }
  return out;
}

// Playground may write modelScaleFactor and vector components as strings.
export function coerceTryonConfig(config) {
  if (!config || typeof config !== 'object') return config;
  return {
    ...config,
    enabled: Boolean(config.enabled),
    modelScaleFactor: num(config.modelScaleFactor),
    modelPosition: vec3(config.modelPosition),
    modelRotation: vec3(config.modelRotation),
    ssr: group(config.ssr),
    ssao: group(config.ssao)
  };
}

export function applySavedScene(project, file) {
  const saved = typeof file.config === 'string' ? JSON.parse(file.config) : file.config;
  if (!saved?.plugins?.RingConfigurator) {
    throw new Error('The saved ND1049 catalog is incomplete.');
  }
  // The site owns scene, camera, materials and background. Playground's Try-On
  // save also writes default scene/material/camera and may flip tonemapping, so
  // those must not replace the authored project.json look. iJewel owns the ring
  // catalog and the Try-On fit.
  const tryon = saved.tryonConfig?.enabled ? coerceTryonConfig(saved.tryonConfig) : project.tryonConfig;
  return {
    ...project,
    sceneConfig: project.sceneConfig,
    cameraConfig: project.cameraConfig,
    materialConfig: project.materialConfig,
    tryonConfig: tryon,
    plugins: {
      ...project.plugins,
      RingConfigurator: saved.plugins.RingConfigurator,
      SimpleBackgroundEnvUiPlugin2: project.plugins.SimpleBackgroundEnvUiPlugin2 || {}
    }
  };
}
