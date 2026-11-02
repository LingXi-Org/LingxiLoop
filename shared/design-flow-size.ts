interface Box { x: number; y: number; w: number; h: number; page?: string }
interface Board extends Box { file: string; frameless?: boolean; is_interactive?: boolean }
interface Annotation { x: number; y: number; page?: string }

/** Grow a natural-height page through the model, moving later rows together.
 * Existing layered compositions and fixed interaction viewports keep their geometry. */
export function resizeFlowManifest<T extends { artboards: Board[]; annotations?: Annotation[] }>(
  manifest: T, file: string, size: { w: number; h: number },
  moveAnnotation: (item: Annotation, x: number, y: number) => Annotation,
): T {
  const board = manifest.artboards.find(item => item.file === file)
  if (!board || board.frameless || board.is_interactive || !Number.isFinite(size.h)
    || size.h < 40 || size.h > 8000 || !Number.isFinite(size.w) || Math.abs(size.w - board.w) > 1) return manifest
  const h = Math.ceil(size.h)
  if (Math.abs(board.h - h) <= 1) return manifest
  const samePage = (item: { page?: string }) => (item.page ?? '') === (board.page ?? '')
  if (manifest.artboards.some(item => item !== board && samePage(item)
    && item.x < board.x + board.w && item.x + item.w > board.x
    && item.y < board.y + board.h && item.y + item.h > board.y)) return manifest
  const bottom = board.y + board.h
  // Shrinking leaves spare canvas space. Reuse it on the next expansion instead
  // of pushing later rows again on every expand/collapse of dynamic content.
  const intersectsLaterRow = [...manifest.artboards, ...(manifest.annotations ?? [])].some(item => samePage(item)
    && item.y >= bottom && item.y < board.y + h)
  const delta = intersectsLaterRow ? Math.max(0, h - board.h) : 0
  const move = <U extends Annotation>(item: U): U => samePage(item) && item.y >= bottom && delta
    ? { ...item, y: item.y + delta } : item
  return { ...manifest, artboards: manifest.artboards.map(item => item === board ? { ...item, h } : move(item)),
    ...(manifest.annotations ? { annotations: manifest.annotations.map(item => samePage(item) && item.y >= bottom && delta
      ? moveAnnotation(item, item.x, item.y + delta) : item) } : {}) }
}

/** Runs in the real artboard guest. It reports geometry, never edits the source.
 * An explicit min-height with automatic height is the authored flow-page signal.
 * Fixed height/max-height, positioned roots and authored scroll viewports opt out. */
export function installDesignFlowSize() {
  let root: HTMLElement | null = null, queued = false, last = ''
  const resize = new ResizeObserver(schedule)
  function measure() {
    queued = false
    if (!root?.isConnected || document.documentElement.hasAttribute('data-dc-frameless')) return
    const style = getComputedStyle(root)
    const typed = (root as HTMLElement & { computedStyleMap?(): Map<string, unknown> }).computedStyleMap?.().get('height')
    if (!root.style.minHeight || !(parseFloat(root.style.minHeight) > 0)
      || (typed ? String(typed) !== 'auto' : Boolean(root.style.height && root.style.height !== 'auto'))
      || style.maxHeight !== 'none' || !['static', 'relative'].includes(style.position)
      || style.transform !== 'none' || !['visible', ''].includes(style.overflowY)) return
    const rect = root.getBoundingClientRect()
    if (rect.width > innerWidth + 1 || rect.width <= 0 || rect.top + scrollY < -1) return
    const h = Math.ceil(rect.bottom + scrollY), w = innerWidth
    if (h < 40 || h > 8000) return
    const key = `${w}:${innerHeight}:${h}`
    if (key === last) return
    last = key
    parent.postMessage({ __dcEditorEvt: { type: 'flowSize', w, h } }, '*')
  }
  function schedule() {
    if (!queued) { queued = true; requestAnimationFrame(measure) }
  }
  function discover() {
    if (root?.isConnected) return
    const host = document.querySelector('.sc-host')
    const roots = host?.querySelectorAll(':scope > [data-dc-tpl]')
    resize.disconnect()
    root = roots?.length === 1 ? roots[0] as HTMLElement : null
    if (root) { resize.observe(root); schedule() }
  }
  const mutations = new MutationObserver(discover)
  const start = () => {
    mutations.observe(document.body, { childList: true, subtree: true })
    discover()
  }
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })
  window.addEventListener('resize', schedule)
  window.addEventListener('lingxi:math-ready', schedule)
  window.addEventListener('pagehide', () => { mutations.disconnect(); resize.disconnect() }, { once: true })
}
