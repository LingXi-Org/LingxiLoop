import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: serial resource waterfalls; content placeholders mistaken for
// first visibility; dead controls; remount on return; cross-session DOM reuse;
// clipped toolbar, square guest background, or input blocked while loading.
for (const count of [1, 3]) for (const sample of [1, 2, 3]) {
  test(`historical loading: ${count} cards, sample ${sample}`, async ({ app, browser, screen }) => {
    // In-page paint/ready marks avoid including the runner's cross-frame screen
    // collection latency. Only actual initialized guests with a non-empty
    // official content-size notification count; no placeholder can satisfy it.
    await browser.addInitScript(() => {
      if (window !== window.top) return
      const content = new WeakSet<Window>()
      const measurements: Record<string, { firstContentPaintMs?: number; allCardsReadyMs?: number }> = {}
      Object.assign(window, { __loadingPaintEvidence: measurements })
      let scheduled = false
      const samplePaint = () => {
        scheduled = false
        const entry = performance.getEntriesByName('conversation-entry').at(-1)
        if (!entry) return
        const cards = Array.from(document.querySelectorAll('[data-testid="gen-ui-card"]'))
        const ready = cards.filter(card => {
          const frame = card.querySelector<HTMLIFrameElement>('iframe[data-visualize-guest]')
          if (!frame?.contentWindow || !content.has(frame.contentWindow) || !frame.checkVisibility()) return false
          const rect = frame.getBoundingClientRect()
          return card.getAttribute('data-gen-ui-phase') === 'ready' && rect.height > 100 && rect.width > 0 && rect.top < innerHeight && rect.bottom > 0
        }).length
        const result = measurements[String(entry.startTime)] ??= {}
        if (ready > 0) result.firstContentPaintMs ??= performance.now() - entry.startTime
        if (cards.length > 0 && ready === cards.length) result.allCardsReadyMs ??= performance.now() - entry.startTime
      }
      const schedule = () => {
        if (!scheduled) { scheduled = true; requestAnimationFrame(() => requestAnimationFrame(samplePaint)) }
      }
      addEventListener('message', event => {
        if (event.data?.method !== 'ui/notifications/size-changed' || event.data.params?.height <= 100) return
        const frame = Array.from(document.querySelectorAll('iframe[data-visualize-guest]')).find(frame => (frame as HTMLIFrameElement).contentWindow === event.source)
        if (frame && event.source) { content.add(event.source as Window); schedule() }
      })
      new MutationObserver(schedule).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-gen-ui-phase'] })
    })
    await app.open(`/e2e/visualize/loading.html?count=${count}&sample=${sample}`)
    const evidence: unknown[] = []
    for (const [scenario, session] of [['cold', 'A'], ['switch', 'B'], ['return', 'A'], ['reenter', 'A']]) {
      if (scenario === 'reenter') {
        await screen.getByRole('button', '退出', { exact: true }).tap()
        await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveCount(0)
      }
      await screen.getByRole('button', `进入 ${session}`, { exact: true }).tap()
      if (sample === 1 && scenario === 'cold') await app.screenshot(`loading-${count}`)
      const guest = browser.frameLocator('[data-testid="gen-ui-card"]:first-child iframe[data-visualize-guest]').frameLocator('iframe[data-visualize-content]')
      await expect(guest.locator('[data-fixture-ready="true"]')).toBeVisible()
      const visibleMs = await browser.evaluate(() => performance.now() - performance.getEntriesByName('conversation-entry').at(-1)!.startTime)
      await expect(browser.locator('[data-gen-ui-phase="ready"]')).toHaveCount(count)
      const geometry = await browser.evaluate(() => Array.from(document.querySelectorAll('[data-testid="gen-ui-card"], [data-testid="gen-ui-anchor"], [data-sandbox-page-root]')).map(node => {
        const rect = node.getBoundingClientRect()
        return { element: node.getAttribute('data-testid') ?? 'plane', height: rect.height, width: rect.width, display: getComputedStyle(node).display, scrollTop: node.scrollTop }
      }))
      const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-loading'
      await mkdir(output, { recursive: true })
      await writeFile(`${output}/geometry-${count}-${sample}-${scenario}.json`, JSON.stringify(geometry, null, 2))
      await guest.locator('#fixture-play').tap()
      await expect(guest.locator('#fixture-play-label')).toHaveText(scenario === 'return' ? 'Pause' : 'Play')
      const timing = await browser.evaluate(() => ({
        interactiveMs: performance.now() - performance.getEntriesByName('conversation-entry').at(-1)!.startTime,
        paint: (window as unknown as { __loadingPaintEvidence: Record<string, { firstContentPaintMs?: number; allCardsReadyMs?: number }> }).__loadingPaintEvidence[String(performance.getEntriesByName('conversation-entry').at(-1)!.startTime)],
        resources: performance.getEntriesByType('resource').filter(item => item.name.includes('/visualize/pages')).map(item => {
          const entry = item as PerformanceResourceTiming
          return { path: new URL(entry.name).pathname.replace(/\/pages\/[^/]+/, '/pages/:page'), resource: new URL(entry.name).searchParams.get('name'), start: entry.startTime - performance.getEntriesByName('conversation-entry').at(-1)!.startTime, duration: entry.duration, bytes: entry.transferSize }
        }),
        frames: document.querySelectorAll('iframe[data-visualize-guest]').length,
      }))
      expect(timing.paint.firstContentPaintMs).toBeGreaterThan(0)
      expect(timing.paint.allCardsReadyMs).toBeGreaterThan(0)
      if (scenario === 'return' || scenario === 'reenter') expect(timing.resources.filter(item => item.resource)).toHaveLength(0)
      evidence.push({ scenario, visibleMs, ...timing })
      if (sample === 1 && scenario === 'cold') {
        await browser.locator('[data-testid="gen-ui-actions"] button').first().focus()
        await app.screenshot(`ready-${count}`)
      }
    }
    const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-loading'
    await mkdir(output, { recursive: true })
    await writeFile(`${output}/loading-${count}-${sample}.json`, JSON.stringify({ count, sample, resourceDelayMs: Number(process.env.E2E_VISUALIZE_RESOURCE_DELAY ?? 0), evidence }, null, 2))
  })
}
