import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure inventory: perf/issue-244/BRIEF.md. These exercise the product host,
// original guest and SDK through an explicit failing local transport.
for (const stage of ['create', 'resources', 'state', 'handshake']) {
  test(`initialization deadline covers ${stage} and retry survives stalled cleanup`, async ({ app, browser, screen }) => {
    await app.open('/e2e/visualize/loading.html?count=1')
    await browser.evaluate(async stage => {
      await fetch(`/__visualize_fixture/fault?stage=${stage},delete`)
      const phases: { phase: string | null; at: number }[] = []
      Object.assign(window, { __deadlinePhases: phases })
      new MutationObserver(() => {
        const phase = document.querySelector('[data-testid="gen-ui-card"]')?.getAttribute('data-gen-ui-phase') ?? null
        if (phase !== phases.at(-1)?.phase) phases.push({ phase, at: performance.now() })
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-gen-ui-phase'] })
      return true
    }, stage)
    await screen.getByRole('button', '进入 A', { exact: true }).tap()
    await screen.getByLabel('对话输入').fill('等待时仍可输入')
    // A real wall-clock deadline; no patched browser timers or SDK success.
    await browser.evaluate(async () => {
      const start = performance.getEntriesByName('conversation-entry').at(-1)!.startTime
      await new Promise(resolve => setTimeout(resolve, Math.max(0, start + 16500 - performance.now())))
      return true
    })
    const evidence = await browser.evaluate(async () => ({
      phase: document.querySelector('[data-testid="gen-ui-card"]')?.getAttribute('data-gen-ui-phase') ?? null,
      elapsed: performance.now() - performance.getEntriesByName('conversation-entry').at(-1)!.startTime,
      phases: (window as unknown as { __deadlinePhases: { phase: string | null; at: number }[] }).__deadlinePhases,
      input: document.querySelector<HTMLInputElement>('input')?.value ?? null,
      transport: await (await fetch('/__visualize_fixture/evidence')).json(),
    }))
    const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-timeout'
    await mkdir(output, { recursive: true })
    await writeFile(`${output}/deadline-${stage}.json`, JSON.stringify(evidence, null, 2))
    await app.screenshot(`deadline-${stage}`)
    expect(evidence.input).toBe('等待时仍可输入')
    expect(evidence.phase).toBe('error')
    // Old requests must have aborted; DELETE remains held throughout retry.
    await browser.evaluate(async () => { await fetch('/__visualize_fixture/fault?stage=delete'); return true })
    await screen.getByRole('button', '重试', { exact: true }).tap()
    const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
    await expect(guest.locator('[data-fixture-ready="true"]')).toBeVisible()
    await guest.locator('#fixture-play').tap()
    await expect(guest.locator('#fixture-play-label')).toHaveText('Play')
    await expect(browser.locator('[data-gen-ui-phase="ready"]')).toHaveCount(1)
    const cleanup = await browser.evaluate(async () => {
      await fetch('/__visualize_fixture/fault?release=1')
      for (let i = 0; i < 30; i++) {
        dispatchEvent(new Event('focus'))
        const evidence = await (await fetch('/__visualize_fixture/evidence')).json()
        if (evidence.activePages === 1) return evidence
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return (await fetch('/__visualize_fixture/evidence')).json()
    })
    await writeFile(`${output}/cleanup-${stage}.json`, JSON.stringify(cleanup, null, 2))
    expect(cleanup.activePages).toBe(1)
    await app.screenshot(`recovered-${stage}`)
  })
}
