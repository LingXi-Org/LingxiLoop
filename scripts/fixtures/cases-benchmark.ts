// Fixture-only paint timings and request counts, exposed in the DOM for browser checks.
export function instrumentCases() {
  const metrics = document.documentElement.dataset
  let clicked: { start: number; label: string; cards: number; requests: number; hero: Element | null } | null = null
  let scheduled = false
  let opened = false
  const samples: unknown[] = []
  const ready = () => document.querySelector('[data-case-grid]') && !Array.from(document.querySelectorAll('[role=status]')).some(node => node.textContent?.includes('正在加载案例'))
  document.addEventListener('click', event => {
    const target = (event.target as Element).closest('.case-categories button')
    if (!target || target.getAttribute('aria-pressed') === 'true') return
    const label = target.textContent ?? ''
    if (label !== '全部' && label !== '推理优化') return
    clicked = { start: performance.now(), label, cards: label === '全部' ? 6 : 2,
      requests: Number(metrics.caseRequests || 0), hero: document.querySelector('.case-featured') }
  }, true)
  const observer = new MutationObserver(() => {
    if (scheduled || !ready()) return
    if (!opened) {
      opened = true
      requestAnimationFrame(() => requestAnimationFrame(() => {
        metrics.caseReadyMs = String(performance.now())
        metrics.caseResources = JSON.stringify(performance.getEntriesByType('resource').map(entry => {
          const resource = entry as PerformanceResourceTiming
          return { path: new URL(resource.name).pathname, bytes: resource.encodedBodySize, end: resource.responseEnd }
        }).sort((a, b) => b.end - a.end).slice(0, 12))
      }))
    }
    if (!clicked || document.querySelector('.case-categories [aria-pressed=true]')?.textContent !== clicked.label) return
    scheduled = true
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scheduled = false
      if (!clicked || !ready() || document.querySelectorAll('[data-case-grid] > article').length !== clicked.cards) return
      samples.push({ label: clicked.label, ms: performance.now() - clicked.start,
        requests: Number(metrics.caseRequests || 0) - clicked.requests,
        retainedHero: clicked.hero !== null && clicked.hero === document.querySelector('.case-featured'),
        cards: document.querySelectorAll('[data-case-grid] > article').length })
      clicked = null
      metrics.caseSamples = JSON.stringify(samples)
    }))
  })
  observer.observe(document.getElementById('root')!, { childList: true, subtree: true, attributes: true })
}
