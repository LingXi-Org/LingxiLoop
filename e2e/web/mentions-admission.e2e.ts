import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test.describe('Multi-segment mention admission', {
  ...(process.env.E2E_GROUP_MENTIONS_FIXTURE === '1' ? {} : { skip: 'Requires the isolated synthetic mentions fixture.' }),
}, () => {
  for (const width of [1440, 390]) test(`admission and history retain each mention and surrounding prose (${width})`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width, height: 960 })
    await app.open('/e2e/mentions-admission.html')
    const body = browser.locator('.native-message-content')
    const expected = await body.textContent()
    await expect(browser.locator('[data-mention-id]')).toHaveCount(7)
    for (const id of ['nova', 'sage', 'milo', 'trace', 'scout', 'forge']) await expect(browser.locator(`[data-mention-id="${id}"]`).first()).toBeVisible()
    for (const action of ['执行准入', '执行准入', '读取历史']) {
      await screen.getByRole('button', action).tap()
      await expect(body).toHaveText(expected!)
      await expect(browser.locator('[data-mention-id]')).toHaveCount(7)
    }
    expect(await browser.evaluate(() => document.querySelector('.native-message-content')?.textContent?.includes('中文紧邻@明理检查；未知@unknown保持原文。'))).toBe(true)
    expect(await browser.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await app.screenshot(`mentions-admission-${width}`)
  })
})
