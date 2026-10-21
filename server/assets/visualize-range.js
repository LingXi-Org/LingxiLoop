/* Explicit opt-in only: no selectors, source rewrites or host geometry changes.
 * Axis-aligned HTML elements; the caller supplies a rectangular selected range.
 * Geometry belongs to this binding; colors/border/radius belong to the author. */
window.lingxiVisualize = Object.assign(window.lingxiVisualize || {}, {
  bindRangeOverlay(container, overlay, selectedElements) {
    if (overlay.parentElement !== container || getComputedStyle(container).position === 'static') {
      throw new Error('Range overlay must be a direct child of a positioned container');
    }
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    // 100px avoids subpixel quantization of a 1px probe at fractional zoom.
    // Keep it before the origin so it does not enlarge positive scroll bounds.
    probe.style.cssText = 'position:absolute;left:-100px;top:-100px;width:100px;height:100px;margin:0;padding:0;border:0;box-sizing:border-box;visibility:hidden;pointer-events:none;transform:none;zoom:1;';
    container.append(probe);
    Object.assign(overlay.style, { position: 'absolute', margin: '0', padding: '0', boxSizing: 'border-box', transform: 'none', zoom: '1', pointerEvents: 'none', minWidth: '0', minHeight: '0', maxWidth: 'none', maxHeight: 'none', transition: 'none' });
    let disposed = false, pending = 0;
    function update() {
      if (disposed) return;
      const rects = Array.from(selectedElements()).filter(element => container.contains(element))
        .map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
      const origin = probe.getBoundingClientRect();
      if (!rects.length || !origin.width || !origin.height) {
        overlay.hidden = true;
        return;
      }
      // The invisible probe shares the outline's containing block. Its rendered
      // origin/scale already include fractional border, scroll, zoom and scale.
      const sx = origin.width / 100, sy = origin.height / 100;
      const left = Math.min(...rects.map(rect => rect.left));
      const top = Math.min(...rects.map(rect => rect.top));
      const right = Math.max(...rects.map(rect => rect.right));
      const bottom = Math.max(...rects.map(rect => rect.bottom));
      Object.assign(overlay.style, { left: `${(left - origin.right) / sx}px`, top: `${(top - origin.bottom) / sy}px`, width: `${(right - left) / sx}px`, height: `${(bottom - top) / sy}px` });
      overlay.hidden = false;
    }
    function schedule() {
      if (!disposed && !pending) pending = requestAnimationFrame(() => { pending = 0; update(); });
    }
    const resize = new ResizeObserver(update);
    function observeElements() {
      resize.disconnect();
      resize.observe(container);
      for (const element of container.querySelectorAll('*')) {
        if (element !== overlay && element !== probe && !overlay.contains(element)) resize.observe(element);
      }
    }
    const mutation = new MutationObserver(records => {
      const changes = records.filter(record => record.target !== overlay && record.target !== probe);
      if (!changes.length) return;
      if (changes.some(record => record.type === 'childList')) observeElements();
      schedule();
    });
    observeElements();
    mutation.observe(container, { subtree: true, childList: true, attributes: true, characterData: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    document.fonts.ready.then(schedule);
    document.fonts.addEventListener('loadingdone', schedule);
    update();
    return {
      update,
      destroy() {
        disposed = true;
        cancelAnimationFrame(pending);
        resize.disconnect();
        mutation.disconnect();
        window.removeEventListener('resize', schedule);
        window.removeEventListener('scroll', schedule, true);
        document.fonts.removeEventListener('loadingdone', schedule);
        probe.remove();
        overlay.hidden = true;
      },
    };
  },
});
