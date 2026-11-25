// Single-line shape scroller: keep the selected shape in view, and let a mouse (or pen)
// drag an icon to scroll. Touch stays native so iPhone swipe is unchanged.
(() => {
  const ROWS = '.shape-grid, #shapes.shapes';
  const SELECTED = '[aria-pressed="true"], button.on';
  const DRAG_THRESHOLD = 5;

  const reveal = (row) => {
    if (row._shapeRowDragging) return;
    const selected = row.querySelector(SELECTED);
    if (!selected) return;
    // Only when the selection changes (or on first load). Re-running on every
    // render() would pull the selected icon back and undo a user's drag or swipe.
    if (row._shapeRowSelected === selected) return;
    row._shapeRowSelected = selected;
    selected.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'auto' });
  };

  const lockImages = (row) => {
    row.querySelectorAll('img').forEach((img) => { img.draggable = false; });
  };

  const enableDragScroll = (row) => {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startScroll = 0;
    let dragging = false;
    let suppressClick = false;

    const isMouseLike = (event) => event.pointerType === 'mouse' || event.pointerType === 'pen';

    const setDragging = (on) => {
      dragging = on;
      row._shapeRowDragging = on;
      if (on) row.setAttribute('data-shape-row-dragging', '');
      else row.removeAttribute('data-shape-row-dragging');
    };

    row.addEventListener('pointerdown', (event) => {
      if (!isMouseLike(event) || event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScroll = row.scrollLeft;
      dragging = false;
      suppressClick = false;
    });

    row.addEventListener('pointermove', (event) => {
      if (pointerId !== event.pointerId || !isMouseLike(event)) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) <= DRAG_THRESHOLD) return;
        setDragging(true);
        suppressClick = true;
        try { row.setPointerCapture(event.pointerId); } catch { /* capture is optional */ }
      }
      event.preventDefault();
      row.scrollLeft = startScroll - dx;
    });

    const endDrag = (event) => {
      if (pointerId !== event.pointerId) return;
      if (dragging) {
        try { row.releasePointerCapture(event.pointerId); } catch { /* already released */ }
        setDragging(false);
      }
      pointerId = null;
    };

    row.addEventListener('pointerup', endDrag);
    row.addEventListener('pointercancel', endDrag);
    row.addEventListener('lostpointercapture', (event) => {
      if (pointerId === event.pointerId && dragging) setDragging(false);
    });

    // After a real drag, swallow the click that would otherwise select the shape under the pointer.
    row.addEventListener('click', (event) => {
      if (!suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }, true);

    row.addEventListener('dragstart', (event) => { event.preventDefault(); });
    lockImages(row);

    // Vertical mouse wheel scrolls the row sideways, only when it can scroll and the pointer is over it.
    row.addEventListener('wheel', (event) => {
      if (row.scrollWidth <= row.clientWidth + 1) return;
      if (event.deltaY === 0 || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      event.preventDefault();
      row.scrollLeft += event.deltaY;
    }, { passive: false });
  };

  const watch = (row) => {
    reveal(row);
    enableDragScroll(row);
    new MutationObserver(() => {
      lockImages(row);
      reveal(row);
    }).observe(row, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-pressed', 'class'],
    });
  };

  const start = () => {
    document.querySelectorAll(ROWS).forEach(watch);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
