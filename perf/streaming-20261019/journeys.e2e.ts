import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Whole product baseline with a disposable authenticated session. No model calls
// are issued; token and completion measurements live in the protocol fixture.
process.env.ACCEPTANCE_FIXTURE_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const { mintSession, expireSession } = await import('../../e2e/acceptance/session-fixture.mjs')
for (const scenario of ['login', 'conversation']) for (let run = 0; run < Number(process.env.PERF_RUNS ?? 10); run++) {
  test(`${scenario} usable ${run}`, async ({ browser }) => {
    const session = scenario === 'conversation' ? await mintSession() : null
    if (session) await browser.setCookies([session.cookie])
    await browser.addInitScript(() => {
      const values = { interactiveMs: 0, workspaceMs: 0, longTaskMs: 0 }
      Object.assign(window, { __journey: values })
      new PerformanceObserver(list => { for (const entry of list.getEntries()) values.longTaskMs += entry.duration }).observe({ type: 'longtask', buffered: true })
      const check = () => {
        const input = document.querySelector<HTMLElement>('[contenteditable="true"],input[type="email"]')
        if (input?.getBoundingClientRect().width && !input.hasAttribute('disabled')) values.interactiveMs ||= performance.now()
        if (document.querySelector('[aria-label="工作区与功能"]')) values.workspaceMs ||= performance.now()
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
    try {
      await browser.goto('http://127.0.0.1:5180/' + (session ? '?project=e2e-classroom&view=conversations&conversation=e2e-study-room' : ''))
      const input = browser.locator(session ? '[contenteditable="true"]' : 'input[type="email"]')
      await expect(input).toBeVisible()
      await input.fill(session ? '可重复输入基线' : 'perf@example.invalid')
      if (session) await expect(input).toHaveText('可重复输入基线')
      const result = await browser.evaluate(() => ({ ...(window as unknown as { __journey: Record<string, number> }).__journey,
        inputConfirmedMs: performance.now(), requests: performance.getEntriesByType('resource').length,
        apiRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/api/')).length,
        requestPaths: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/api/')).map(entry => new URL(entry.name).pathname),
        heapBytes: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
      }))
      await mkdir('journey-results', { recursive: true })
      await writeFile(`journey-results/${scenario}-${run}.json`, JSON.stringify({ scenario, run, ...result, errors: 0,
        mode: 'production web build, local real control/API/PG/Redis/WuKongIM, native CPU/network, cold browser context; synthetic session bypasses captcha only' }) + '\n')
    } finally { if (session) expireSession(session.id) }
  })
}
