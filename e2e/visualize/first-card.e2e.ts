import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// One cold visible card: separate resource/state time, iframe creation,
// official SDK initialization and actual content paint. Failure model is in
// perf/issue-259/FAILURE-MODEL.md.
// Keep runner screen collection outside the timed interval.
test('first visible card overlaps authored vendors with kit and slow runtime', async ({ app, browser }) => {
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
  for (const sample of [1]) {
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
      return { ...result, paint: result.paint, initialized: result.initialized, documents, longTasks, resources: performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('/visualize/pages'))
        .map(item => { const entry = item as PerformanceResourceTiming; const url = new URL(entry.name)
          return { name: url.searchParams.get('name') ?? url.pathname.split('/').at(-1)!, start: entry.startTime - start, end: entry.responseEnd - start, duration: entry.duration, bytes: entry.transferSize }
        }) }
    })
    const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
    await expect(guest.locator('[data-fixture-ready="true"]')).toBeVisible()
    await expect(guest.locator('#fixture-chart rect')).toHaveCount(3)
    await guest.locator('#fixture-play').tap()
    await expect(guest.locator('#fixture-play-label')).toHaveText('Play')
    samples.push({ sample, result })
    await app.screenshot('first-card-usable')
  }
  const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-first-card'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/startup.json`, JSON.stringify(samples, null, 2))
  const result = samples[0].result
  const runtime = result.resources.find(item => item.name === 'gen-ui.js')!
  const kit = result.resources.find(item => item.name === 'visualize.html')!
  const vendors = result.resources.filter(item => item.name.startsWith('vendor/'))
  expect(result.resources.filter(item => item.name === 'pages')).toHaveLength(1)
  expect(result.resources.filter(item => item.name.includes('.'))).toHaveLength(8)
  expect(new Set(vendors.map(item => item.name)).size).toBe(4)
  for (const vendor of vendors) {
    // The authored D3 import is known before the kit returns. This legacy
    // fixture omits its kit hash, so the other vendors still need discovery.
    if (vendor.name === 'vendor/d3-7.9.0.min.js') expect(vendor.start).toBeLessThan(kit.end)
    else expect(vendor.start).toBeGreaterThanOrEqual(kit.end)
    if (!process.env.E2E_VISUALIZE_SLOW_KIT) expect(vendor.start).toBeLessThan(runtime.end)
  }
  expect(result.paint).toBeGreaterThan(result.initialized)

})
