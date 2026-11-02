import renderMathInElement from 'katex/contrib/auto-render'
import katex from 'katex'
import { inlineDollarRanges } from './artifact-math-source'

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
  const ignoredTags = ['script','noscript','style','textarea','pre','code','kbd','samp','option','svg','math','x-dc','template'] as (keyof HTMLElementTagNameMap)[]
  const excluded = ignoredTags.join(',')+',.katex,.katex-display,.no-math,[contenteditable]:not([contenteditable="false"])'
  const options = {trust:false,throwOnError:true,maxExpand:1000,maxSize:20}
  function renderInlineDollars() {
    const walker = document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while(walker.nextNode()) if(!walker.currentNode.parentElement?.closest(excluded)) nodes.push(walker.currentNode as Text)
    for(const node of nodes) {
      const text = node.data, ranges = inlineDollarRanges(text)
      if(!ranges.length) continue
      const fragment = document.createDocumentFragment()
      let cursor = 0, rendered = false
      for(const range of ranges) {
        fragment.append(document.createTextNode(text.slice(cursor,range.start)))
        const formula = document.createElement('span')
        try {
          katex.render(range.source,formula,{...options,displayMode:false})
          const math = formula.querySelector<HTMLElement>('.katex')!
          math.tabIndex=0; math.setAttribute('role','region'); math.setAttribute('aria-label','数学公式')
          fragment.append(formula); rendered=true
        }
        catch { fragment.append(document.createTextNode(text.slice(range.start,range.end))) }
        cursor=range.end
      }
      if(rendered) { fragment.append(document.createTextNode(text.slice(cursor))); node.replaceWith(fragment) }
    }
  }
  let queued = false
  const observer = new MutationObserver(() => schedule())
  const observe = () => observer.observe(document.body, {childList:true,subtree:true,characterData:true})
  function render() {
    queued = false
    if (!document.body) return
    observer.disconnect()
    try {
      // Keep the official explicit-delimiter pass; the selected single-dollar
      // pass additionally protects prices, escaped dollars and backtick code.
      renderMathInElement(document.body, {
        ignoredTags,
        ignoredClasses: ['katex','katex-display','no-math'],
        ...options,
        errorCallback: () => {},
      })
      renderInlineDollars()
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
