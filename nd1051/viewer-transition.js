// Selection changes switch directly: the previous ring stays on screen until the new one is fully built, then it is swapped.
// There is no fade and no white stage (this replaces the old 160 ms fade-out / 240 ms fade-in).
export function needsModelTransition(previous, next) {
  return Boolean(previous && ['shape', 'carat', 'band'].some(key => previous[key] !== next[key]));
}

// Kept as no-ops so existing callers keep working; they must never hide the viewer.
export async function fadeViewer(element, hidden) {
  if (!hidden) delete element.dataset.transition;
}

export function paintViewer() {
  return Promise.resolve();
}
