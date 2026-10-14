import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: hidden summaries reappear after reload, tool names/failed approvals leak,
// memory-only runs create an empty activity panel, or ordinary tools/body disappear.
test.describe('Memory privacy fixture', {
  ...(process.env.E2E_MEMORY_PRIVACY_FIXTURE === '1' ? {} : { skip: 'Requires the isolated memory privacy fixture server.' }),
}, () => {
  for (const width of [1440,390]) test(`memory stays internal in history, streams and reloads (${width})`, async ({ app,browser,screen }) => {
    await browser.setViewport({ width,height: 960 })
    await app.open('/e2e/memory-privacy.html')
    for (const mode of ['history','stream','mixed']) {
      await screen.getByRole('button',mode,{ exact: true }).tap()
      await expect(screen.getByText('答复正文保持可见。')).toBeVisible()
      await expect(browser.locator('[data-slot="memory-chips"]')).toHaveCount(0)
      await expect(browser.locator('[data-slot="run-activity"]')).toHaveCount(mode === 'mixed' ? 1 : 0)
      if (mode === 'mixed') {
        await browser.locator('[data-slot="run-activity"] [data-slot="collapsible-trigger"]').tap()
        await expect(browser.locator('[data-activity-kind="tool"]')).toHaveCount(1)
        await expect(browser.locator('section[aria-label="阅读文档"]')).toBeVisible()
      }
      expect(await browser.evaluate(() => document.body.textContent)).not.toMatch(/PRIVATE|memory[._]|记忆摘要|更新记忆|恢复记忆|删除记忆|已记住|操作审批/)
      await app.screenshot(`memory-private-${mode}-${width}`)
      await app.open(`/e2e/memory-privacy.html?mode=${mode}`)
      await expect(screen.getByText('答复正文保持可见。')).toBeVisible()
      await expect(browser.locator('[data-slot="run-activity"]')).toHaveCount(mode === 'mixed' ? 1 : 0)
      expect(await browser.evaluate(() => document.body.textContent)).not.toMatch(/PRIVATE|memory[._]|记忆摘要|更新记忆|恢复记忆|删除记忆|已记住/)
      expect(await browser.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    }
  })
})
