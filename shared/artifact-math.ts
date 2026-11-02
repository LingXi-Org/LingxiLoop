import renderMathInElement from 'katex/contrib/auto-render'

/** Installs only inside a content iframe, never the application/editor chrome. */
export function installArtifactMath(css: string) {
  const style = document.createElement('style')
  style.dataset.lingxiMath = ''
  style.textContent = css + `
    .katex-display{max-inline-size:100%;overflow-x:auto;overflow-y:hidden;padding-block:.3em}
    .katex-display>.katex{white-space:nowrap}
    .katex:not(.katex-display>.katex){display:inline-block;max-inline-size:100%;overflow-x:auto;overflow-y:hidden;vertical-align:middle;padding-block:.2em}
    .katex-display:focus-visible{outline:2px solid currentColor;outline-offset:2px}
  `
  document.head.append(style)
  let queued = false
  const observer = new MutationObserver(() => schedule())
  const observe = () => observer.observe(document.body, {childList:true,subtree:true,characterData:true})
  function render() {
    queued = false
    if (!document.body) return
    observer.disconnect()
    try {
      // KaTeX's standard auto-render deliberately excludes single dollars so
      // ordinary prices stay literal. Code and SVG stay authored.
      renderMathInElement(document.body, {
        ignoredTags: ['script','noscript','style','textarea','pre','code','kbd','samp','option','svg','math','x-dc','template'] as (keyof HTMLElementTagNameMap)[],
        ignoredClasses: ['katex','katex-display','no-math'],
        trust: false, throwOnError: true, maxExpand: 1000, maxSize: 20,
        errorCallback: () => {},
      })
      for (const element of document.querySelectorAll<HTMLElement>('.katex-display')) {
        element.tabIndex = 0
        element.setAttribute('role','region')
        element.setAttribute('aria-label','数学公式')
      }
      // Inform the existing preview-size owner after the fonts used by this
      // render settle. This event conveys no authority and writes no state.
      if (document.querySelector('.katex')) requestAnimationFrame(() => { void document.fonts.ready.then(() => {
        window.dispatchEvent(new Event('lingxi:math-ready'))
      }) })
    } finally { observe() }
  }
  function schedule() {
    if (queued) return
    queued = true
    queueMicrotask(render)
  }
  if (document.body) render()
  else document.addEventListener('DOMContentLoaded',render,{once:true})
  window.addEventListener('pagehide',()=>observer.disconnect(),{once:true})
}
