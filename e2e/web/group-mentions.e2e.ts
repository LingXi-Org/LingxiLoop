import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: whitespace or Markdown breaks a mention, raw IDs leak, mentions
// dispatch/render twice, an incomplete stream creates a badge, or mobile overflows.
test.describe('Group mention fixture', {
  ...(process.env.E2E_GROUP_MENTIONS_FIXTURE === '1' ? {} : { skip: 'Requires the isolated group mention fixture server.' }),
}, () => {
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    test(`human and agent mentions (${width}, ${theme})`, async ({ app, browser, screen }) => {
      await browser.setViewport({ width, height: 960 })
      await app.open(`/e2e/group-mentions.html?theme=${theme}`)
      const chips = browser.locator('[data-mention-id]')
      await expect(chips).toHaveCount(10)
      await expect(browser.locator('[data-mention-id="sage"]')).toHaveCount(5)
      await expect(browser.locator('[data-mention-id="all"]')).toHaveCount(2)
      await expect(browser.locator('code').first()).toHaveText('@sage')
      await expect(browser.locator('blockquote').first()).toContainText('@sage')
      await expect(browser.locator('blockquote [data-mention-id], pre [data-mention-id], code [data-mention-id]')).toHaveCount(0)
      await expect(browser.locator('[data-slot="tool"]')).toHaveCount(0)
      await expect(screen.getByText('执行结束', { exact: true })).toHaveCount(0)
      await expect(screen.getByText('已查证并保留证据。', { exact: false })).toBeVisible()
      await screen.getByRole('button', '流式完成').tap()
      await expect(chips).toHaveCount(11)
      await screen.getByRole('button', '修改名字').tap()
      await expect(browser.locator('[data-mention-id="sage"]').first()).toContainText('新的明理')
      expect(await browser.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      await app.screenshot(`group-mentions-${width}-${theme}`)
    })
  }
  test('composer serializes a selected member to its stable ID', async ({ app, browser, screen }) => {
    await app.open('/e2e/group-mentions.html')
    await screen.getByRole('button', '流式完成').tap()
    await browser.locator('[contenteditable="true"]').fill('@明')
    await browser.keyboard.press('Enter')
    await expect(browser.locator('[data-directive-id="sage"]')).toBeVisible()
    await screen.getByRole('button', '发送提及').tap()
    await expect(screen.getByLabel('已提交正文')).toHaveText('@sage')
    await app.screenshot('group-mentions-composer')
  })
})
