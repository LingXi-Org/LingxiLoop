interface Box { x: number; y: number; w: number; h: number; page?: string }
interface Board extends Box { file: string; frameless?: boolean; is_interactive?: boolean }
interface Annotation { x: number; y: number; page?: string }

/** A viewport-relative page has no intrinsic height independent of its iframe.
 * Inspect authored declarations, not computed px values: calc()/var() and
 * descendants can otherwise feed each model height increase back into layout.
 * Conservatively opt out for authored height queries and unreadable CSS. */
export function hasViewportHeightDependency(root: HTMLElement): boolean {
  const viewportLength = /(?:^|[^a-z0-9_-])(?:\d+(?:\.\d*)?|\.\d+)(?:[sld]?v(?:h|b|i|min|max)|cq(?:h|b|min|max))\b/i
  const dependent = (style: CSSStyleDeclaration) => Array.from(style).some(property => {
    const value = style.getPropertyValue(property)
    return viewportLength.test(value) || /env\(\s*viewport-segment-(?:height|bottom)/i.test(value)
      || (/^(?:--.*|(?:min-|max-)?height|(?:min-|max-)?block-size|flex-basis)$/i.test(property) && /%|\b(?:stretch|fill-available)\b/i.test(value))
  })
  const elements: Element[] = [root, ...root.querySelectorAll('*')]
  for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement) elements.push(ancestor)
  for (const element of elements) {
    if (element.closest('[data-dc-editor-overlay-root],[data-dc-editor-overlay]')) continue
    if ('style' in element && dependent((element as HTMLElement).style)) return true
  }
  function rulesDepend(rules: CSSRuleList): boolean {
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.FONT_FACE_RULE) continue
      if (rule instanceof CSSMediaRule && (/height|block-size|aspect-ratio|orientation/i.test(rule.conditionText) || viewportLength.test(rule.conditionText))) return true
      if (rule.cssText.startsWith('@container') && /height|block-size|aspect-ratio|orientation/i.test(rule.cssText.split('{', 1)[0])) return true
      if ('style' in rule && dependent((rule as CSSStyleRule).style)) return true
      if ('cssRules' in rule && rulesDepend((rule as CSSGroupingRule).cssRules)) return true
      if (rule instanceof CSSImportRule && (!rule.styleSheet || sheetDepends(rule.styleSheet))) return true
    }
    return false
  }
  function sheetDepends(sheet: CSSStyleSheet): boolean {
    // This pinned native sheet sets a floor on .sc-host, not the authored root.
    // It does not make a naturally sized child viewport-relative.
    if (sheet.ownerNode instanceof Element && sheet.ownerNode.hasAttribute('data-dc-editor-style')) return false
    // The native no-preview wrapper gives the *host* a definite viewport. Its
    // block child still has intrinsic height; measure() excludes host stretching.
    if (sheet.ownerNode?.textContent === 'html,body{height:100%;margin:0}#dc-root,#dc-root>.sc-host{height:100%}') return false
    try { return rulesDepend(sheet.cssRules) }
    catch {
      // The editor allows Google's font CSS cross-origin. It provides font-face
      // declarations; unknown unreadable layout CSS cannot establish eligibility.
      return !sheet.href || new URL(sheet.href, document.baseURI).hostname !== 'fonts.googleapis.com'
    }
  }
  return Array.from(document.styleSheets).some(sheetDepends)
}

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
    // A flex/grid host can stretch an auto-height root to its own viewport floor.
    if (!root.parentElement || !['block', 'flow-root'].includes(getComputedStyle(root.parentElement).display)) return
    const typed = (root as HTMLElement & { computedStyleMap?(): Map<string, unknown> }).computedStyleMap?.().get('height')
    if (!root.style.minHeight || !(parseFloat(style.minHeight) > 0)
      || (typed ? String(typed) !== 'auto' : Boolean(root.style.height && root.style.height !== 'auto'))
      || style.maxHeight !== 'none' || !['static', 'relative'].includes(style.position)
      || style.transform !== 'none' || !['visible', ''].includes(style.overflowY)) return
    if (hasViewportHeightDependency(root)) return
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


/** A parent visibility signal changes only presentation work, never access. */
export function installDesignFrameVisibility() {
  if (window.parent === window || document.querySelector('[data-lingxi-frame-visibility]')) return
  const style = document.createElement('style')
  style.dataset.lingxiFrameVisibility = ''
  style.textContent = 'html[data-lingxi-hidden="true"] *{animation-play-state:paused!important}'
  document.head.append(style)
  let visible = true
  const send = (frame: HTMLIFrameElement) => frame.contentWindow?.postMessage({ __lingxi_editor_visibility: true, visible }, '*')
  const receive = (event: MessageEvent) => {
    if (event.source !== parent || event.data?.__lingxi_editor_visibility !== true || typeof event.data.visible !== 'boolean') return
    visible = event.data.visible
    document.documentElement.dataset.lingxiHidden = visible ? 'false' : 'true'
    for (const frame of document.querySelectorAll('iframe')) send(frame)
  }
  const loaded = (event: Event) => { if (event.target instanceof HTMLIFrameElement) send(event.target) }
  window.addEventListener('message', receive)
  document.addEventListener('load', loaded, true)
  window.addEventListener('pagehide', () => { window.removeEventListener('message', receive); document.removeEventListener('load', loaded, true) }, { once: true })
}
