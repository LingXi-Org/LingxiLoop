import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Diagnostic before further performance edits: separate resource/state time,
// iframe creation, official SDK initialization and actual content paint.
// Keep runner screen collection outside the timed interval.
test('three short startup traces through the original SDK', async ({ app, browser }) => {
  // Test-only, cross-frame timestamps. No product protocol, capability or
  // transport is changed. Record document creation before author/runtime code.
  await browser.addInitScript(() => {
    if (window === window.top) {
      const trace: { frame: string; event: string; time: number; url: string }[] = []
      Object.assign(window, { __startupDocuments: trace })
      addEventListener('message', event => {
        if (event.data?.fixtureStartupDocument === true) trace.push(event.data.entry)
      })
    } else {
      const mark = (event: string) => window.top!.postMessage({
        fixtureStartupDocument: true,
        entry: { frame: window.parent === window.top ? 'outer' : 'inner', event,
          time: performance.timeOrigin + performance.now(), url: location.href },
      }, '*')
      mark('created')
      addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'), { once: true })
      addEventListener('load', () => mark('load'), { once: true })
    }
  })
  const samples = []
  for (const sample of [1, 2, 3]) {
    await app.open('/e2e/visualize/loading.html?count=1')
    const result = await browser.evaluate(async () => {
      const stamps: Record<string, number> = {}
      const longTasks: { start: number; duration: number }[] = []
      let content = false, pending = false
      const start = performance.now()
      const result = await new Promise<Record<string, number>>((resolve, reject) => {
        const taskObserver = new PerformanceObserver(entries => {
          for (const task of entries.getEntries()) longTasks.push({ start: task.startTime - start, duration: task.duration })
        })
        taskObserver.observe({ entryTypes: ['longtask'] })
        const stop = () => {
          clearTimeout(timer); observer.disconnect(); taskObserver.disconnect(); removeEventListener('message', message)
        }
        const inspect = () => {
          const card = document.querySelector('[data-testid="gen-ui-card"]')
          const frame = card?.querySelector('iframe[data-visualize-guest]')
          if (frame) stamps.frame ??= performance.now() - start
          if (card?.getAttribute('data-gen-ui-phase') === 'ready') stamps.ready ??= performance.now() - start
          if (!pending && content && stamps.ready && frame?.checkVisibility()) {
            pending = true
            requestAnimationFrame(() => requestAnimationFrame(() => {
              stamps.paint = performance.now() - start
              stop(); resolve(stamps)
            }))
          }
        }
        const message = (event: MessageEvent) => {
          const frame = document.querySelector<HTMLIFrameElement>('iframe[data-visualize-guest]')
          if (!frame || event.source !== frame.contentWindow) return
          const method = event.data?.method
          if (method === 'ui/initialize') stamps.initializeRequest ??= performance.now() - start
          if (method === 'ui/notifications/initialized') stamps.initialized ??= performance.now() - start
          if (method === 'ui/notifications/size-changed' && event.data.params?.height > 100) {
            stamps.contentSize ??= performance.now() - start; content = true
          }
          inspect()
        }
        const observer = new MutationObserver(inspect)
        observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-gen-ui-phase', 'style'] })
        addEventListener('message', message)
        const timer = setTimeout(() => { stop(); reject(new Error('No real content within 16s')) }, 16000)
        // Ordinary fixture navigation, not a user-gesture permission action.
        Array.from(document.querySelectorAll('button')).find(button => button.textContent === '进入 A')!.click()
      })
      const documents = (window as unknown as { __startupDocuments: { frame: string; event: string; time: number; url: string }[] }).__startupDocuments
        .map(entry => ({ ...entry, time: entry.time - performance.timeOrigin - start }))
      return { ...result, documents, longTasks, resources: performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('/visualize/pages'))
        .map(item => { const entry = item as PerformanceResourceTiming; const url = new URL(entry.name)
          return { name: url.searchParams.get('name') ?? url.pathname.split('/').at(-1)!, start: entry.startTime - start, end: entry.responseEnd - start, duration: entry.duration, bytes: entry.transferSize }
        }) }
    })
    const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
    await guest.locator('#fixture-play').tap()
    await expect(guest.locator('#fixture-play-label')).toHaveText('Play')
    samples.push({ sample, result })
  }
  const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-startup'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/startup.json`, JSON.stringify(samples, null, 2))
})
