import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Start the real fixture: node --import tsx e2e/error-recovery-server.mjs
// Serve Vite on 5196 with LINGXILOOP_DEV_API_TARGET=http://127.0.0.1:5197.
// E2E_ERROR_RECOVERY=1 E2E_BASE_URL=http://127.0.0.1:5196 npm run test:e2e:web -- e2e/web/error-recovery.e2e.ts
test('persisted failures appear immediately on entry, re-entry and browser reload', {
  ...(process.env.E2E_ERROR_RECOVERY === '1' ? {} : { skip: 'Requires the isolated error recovery API fixture.' }),
}, async ({ app, browser, screen }) => {
  await app.open('/e2e/error-recovery.html')
  async function verify() {
    await expect(browser.locator('[data-slot="error-state"]')).toContainText('回复生成失败')
    const states = await browser.evaluate(() => JSON.parse(document.getElementById('observed')!.textContent || '[]') as string[])
    expect(states.length).toBeGreaterThan(0)
    expect(states.every(state => state === 'incomplete')).toBe(true)
    const streams = await browser.evaluate(() => performance.getEntriesByType('resource').filter(entry => /\/runs\/[^/]+\/stream/.test(entry.name)).length)
    expect(streams).toBe(0)
  }
  await verify()
  await screen.getByRole('button', '离开对话').tap()
  await screen.getByRole('button', '重新进入').tap()
  await verify()
  await screen.getByRole('button', '离开并清空缓存').tap()
  await screen.getByRole('button', '重新进入').tap()
  await verify()
  await browser.reload()
  await verify()
  await app.screenshot('failed-conversation-after-reload')
})
