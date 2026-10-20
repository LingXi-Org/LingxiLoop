import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Production host + original SDK; local controlled transport, no provider calls.
test('visible history loads before five offscreen cards, which wake on scroll', async ({ app, browser }) => {
  await app.open('/e2e/visualize/loading.html?count=6&offscreen')
  const initial = await browser.evaluate(async () => {
    const start = performance.now()
    let content = false, scheduled = false
    const firstPaint = await new Promise<number>((resolve, reject) => {
      const inspect = () => {
        const card = document.querySelector('[data-testid="gen-ui-card"]')
        const frame = card?.querySelector('iframe[data-visualize-guest]')
        if (!scheduled && content && card?.getAttribute('data-gen-ui-phase') === 'ready' && frame?.checkVisibility()) {
          scheduled = true
          requestAnimationFrame(() => requestAnimationFrame(() => { stop(); resolve(performance.now() - start) }))
        }
      }
      const message = (event: MessageEvent) => {
        const frame = document.querySelector<HTMLIFrameElement>('iframe[data-visualize-guest]')
        if (frame?.contentWindow !== event.source || event.data?.method !== 'ui/notifications/size-changed' || event.data.params?.height <= 100) return
        content = true; inspect()
      }
      const observer = new MutationObserver(inspect)
      observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-gen-ui-phase', 'style'] })
      addEventListener('message', message)
      const timer = setTimeout(() => { stop(); reject(new Error('No visible content within 16s')) }, 16000)
      const stop = () => { clearTimeout(timer); observer.disconnect(); removeEventListener('message', message) }
      Array.from(document.querySelectorAll('button')).find(button => button.textContent === '进入 A')!.click()
    })
    return { firstPaint, frames: document.querySelectorAll('iframe[data-visualize-guest]').length,
      resources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/visualize/pages')).map(item => {
        const entry = item as PerformanceResourceTiming, url = new URL(entry.name)
        return { name: url.searchParams.get('name') ?? url.pathname.split('/').at(-1)!, start: entry.startTime - start, duration: entry.duration, bytes: entry.transferSize }
      }) }
  })
  const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-offscreen'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/initial.json`, JSON.stringify(initial, null, 2))
  await app.screenshot('first-visible-history')
  // Preserve the red timing/count artifact before the baseline assertion.
  expect(initial.frames).toBe(1)
  expect(initial.resources.filter(entry => entry.name === 'pages')).toHaveLength(1)
  expect(initial.resources.filter(entry => entry.name.includes('.'))).toHaveLength(8)
  const first = browser.frameLocator('[data-testid="gen-ui-card"]:first-child iframe[data-visualize-guest]').frameLocator('iframe[data-visualize-content]')
  await first.locator('#fixture-play').tap()
  await expect(first.locator('#fixture-play-label')).toHaveText('Play')
  await browser.evaluate(() => {
    document.querySelector('[data-testid="gen-ui-card"]:last-child')!.scrollIntoView()
    return true
  })
  const last = browser.frameLocator('[data-testid="gen-ui-card"]:last-child iframe[data-visualize-guest]').frameLocator('iframe[data-visualize-content]')
  await expect(last.locator('[data-fixture-ready="true"]')).toBeVisible()
  await last.locator('#fixture-play').tap()
  await expect(last.locator('#fixture-play-label')).toHaveText('Play')
  await browser.setViewport({ width: 390, height: 844 })
  await expect(last.locator('#fixture-play')).toBeVisible()
  await browser.evaluate(() => { scrollTo(0, 0); return true })
  await expect(first.locator('#fixture-play-label')).toHaveText('Play')
  const after = await browser.evaluate(async () => ({
    frames: document.querySelectorAll('iframe[data-visualize-guest]').length,
    resources: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.endsWith('/resources')).length,
    transport: await (await fetch('/__visualize_fixture/evidence')).json(),
  }))
  await writeFile(`${output}/after-scroll.json`, JSON.stringify(after, null, 2))
  expect(after.frames).toBe(2)
  expect(after.resources).toBe(16)
  expect(after.transport.denied).toHaveLength(0)
  await app.screenshot('returned-first-narrow')
})
