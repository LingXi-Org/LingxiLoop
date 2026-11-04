import { inlineDollarRanges } from './artifact-math-source'

declare global { interface Window { __lingxiMathReady?: Promise<void>; __lingxiMathOffline?: boolean } }

/** Small online-only observer. The full renderer owns subsequent mutations.
 * Source and the offline assembly remain separate from this transient UI. */
export function installArtifactMathLoader(url: string, integrity: string) {
  if (window.__lingxiMathOffline) return
  const excluded = 'script,noscript,style,textarea,pre,code,kbd,samp,option,svg,math,x-dc,template,.katex,.katex-display,.no-math,[contenteditable]:not([contenteditable="false"]),[data-lingxi-math-retry]'
  let pending = false, failed = false, scheduled = false
  let retry: HTMLButtonElement | undefined
  const observer = new MutationObserver(() => schedule())
  function needsMath() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      if (node.parentElement?.closest(excluded)) continue
      if (/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\\begin\{(?:equation|align|alignat|gather|CD)\}/.test(node.data)
        || inlineDollarRanges(node.data).length) return true
    }
    return false
  }
  function load() {
    if (pending) return
    pending = true
    failed = false
    retry?.remove()
    const script = document.createElement('script')
    script.src = url
    script.integrity = integrity
    script.crossOrigin = 'anonymous'
    window.__lingxiMathReady = new Promise<void>((resolve, reject) => {
      script.onload = () => {
        observer.disconnect()
        window.removeEventListener('online', onOnline)
        window.removeEventListener('click', retryMath, true)
        void document.fonts.ready.then(() => resolve())
      }
      script.onerror = () => {
        script.remove()
        pending = false
        failed = true
        retry ??= document.createElement('button')
        retry.type = 'button'
        retry.dataset.lingxiMathRetry = ''
        retry.textContent = '重试公式'
        document.body.append(retry)
        reject(new Error('Formula resource unavailable'))
      }
      document.head.append(script)
    })
    // The capture/export caller may await the original promise. Readable source
    // remains on screen when a network failure has no such caller.
    void window.__lingxiMathReady.catch(() => {})
  }
  function check() {
    scheduled = false
    if (!pending && !failed && needsMath()) load()
  }
  function schedule() {
    if (scheduled || pending || failed) return
    scheduled = true
    queueMicrotask(check)
  }
  function onOnline() { if (failed) load() }
  function retryMath(event: MouseEvent) {
    if (failed && event.target instanceof Element && event.target.closest('[data-lingxi-math-retry]') === retry) {
      event.preventDefault()
      event.stopImmediatePropagation()
      load()
    }
  }
  function start() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    check()
  }
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })
  window.addEventListener('online', onOnline)
  window.addEventListener('click', retryMath, true)
  window.addEventListener('pagehide', () => { observer.disconnect(); window.removeEventListener('online', onOnline); window.removeEventListener('click', retryMath, true) }, { once: true })
}
