export type PublicScript = { url: string; integrity: string }
/** Capability-free enhancements; no page token or authored content reaches URLs. */
export function optionalKitBootstrap(assets: Record<string, PublicScript>, loaded: string[] = []) {
  const pending = new Map<string, Promise<void>>(loaded.map(name=>[name,Promise.resolve()]))
  const load = (name: string) => {
    let result = pending.get(name)
    if (!result) {
      result = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script')
        script.src = assets[name].url
        script.integrity = assets[name].integrity
        script.crossOrigin = 'anonymous'
        script.onload = () => { script.remove(); resolve() }
        script.onerror = () => { script.remove(); pending.delete(name); reject(new Error('Optional visualization resource failed')) }
        document.head.append(script)
      })
      pending.set(name, result)
    }
    return result
  }
  const roots = new Set<Document | ShadowRoot>()
  const icons = (root: Document | ShadowRoot) => (window as unknown as {lucide?: {createIcons(options: unknown): void}}).lucide?.createIcons({root,attrs:{width:16,height:16}})
  const scan = () => {
    for (const root of roots) {
      if (root.querySelector('[data-tooltip]')) void load('kit-tooltip.js').catch(() => undefined)
      if (root.querySelector('.viz-carousel')) void load('kit-carousel.js').catch(() => undefined)
      if (root.querySelector('[data-lucide]:not(svg),[icon-name]:not(svg)')) void load('vendor/lucide-1.17.0.js').then(()=>icons(root)).catch(() => undefined)
    }
  }
  const discover = (root: ParentNode) => {
    if ('shadowRoot' in root && root.shadowRoot instanceof ShadowRoot) observe(root.shadowRoot)
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot && !roots.has(element.shadowRoot)) observe(element.shadowRoot)
  }
  const observer = new MutationObserver(records=>{
    // Appending/removing our loader scripts must never retry their own failure.
    if (records.every(record=>record.target===document.head)) return
    for (const record of records) for (const node of record.addedNodes) if (node instanceof Element) discover(node)
    scan()
  })
  const observe = (root: Document | ShadowRoot) => { roots.add(root); observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-tooltip','data-lucide','icon-name','class']}) }
  observe(document)
  discover(document)
  scan()
  // Retry a failed optional read on subsequent user intent, without delaying
  // the authored content or replaying a click into author handlers.
  document.addEventListener('pointerover',scan,{passive:true})
  document.addEventListener('focusin',scan)
  window.addEventListener('pagehide',()=>{observer.disconnect();roots.clear();document.removeEventListener('pointerover',scan);document.removeEventListener('focusin',scan)},{once:true})
}
