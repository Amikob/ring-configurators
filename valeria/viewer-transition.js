export function needsModelTransition(previous, next) {
  return Boolean(previous && ['shape', 'carat', 'band'].some(key => previous[key] !== next[key]));
}

export async function fadeViewer(element, hidden) {
  const opacity = hidden ? '0' : '1';
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : hidden ? 160 : 240;
  const start = element.style.opacity || '1';
  element.style.pointerEvents = hidden ? 'none' : '';
  element.dataset.transition = hidden ? 'loading' : 'revealing';
  element.style.opacity = opacity;
  if (duration && element.animate) {
    const animation = element.animate([{ opacity: start }, { opacity }], { duration, easing: 'ease-in-out' });
    let timer;
    // A background tab must not leave the selection queue waiting indefinitely.
    await Promise.race([animation.finished.catch(() => {}), new Promise(resolve => { timer = setTimeout(resolve, duration + 100); })]);
    clearTimeout(timer);
    animation.cancel();
  }
  if (!hidden) delete element.dataset.transition;
}

export function paintViewer() {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 120);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(timer); resolve(); }));
  });
}
