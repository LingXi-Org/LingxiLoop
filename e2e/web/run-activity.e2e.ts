import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Written before implementation. Fixture evidence is distinct from provider integration.
test.describe('Public run activity', { tags: ['web', 'run-activity'], timeout: 120_000,
  ...(process.env.E2E_ACTIVITY_FIXTURE === '1' ? {} : { skip: 'Requires isolated run activity fixture.' }),
}, () => {
  for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
    test(`native chronology, Markdown, attention and replay ${theme} ${width}`, async ({ app, browser, screen }) => {
      await browser.setViewport({ width, height: 960 })
      await app.open(`/e2e/run-activity.html?theme=${theme}`)
      const disclosure = browser.locator('[data-slot="run-activity"] [data-slot="collapsible-trigger"]').first()
      await expect(screen.getByText('最终答复始终可见。', { exact: true })).toBeVisible()
      await disclosure.focus()
      await browser.keyboard.press('Enter')
      await expect(screen.getByRole('progressbar', '处理计划进度')).toHaveAttribute('aria-valuenow', '50')
      await expect(browser.locator('[data-slot="reasoning-root"]')).toBeVisible()
      await browser.locator('[data-slot="reasoning-trigger"]').tap()
      await expect(browser.locator('[data-slot="reasoning-text"] .katex').first()).toBeVisible()
      await expect(browser.locator('[data-streamdown="mermaid"] svg').first()).toBeVisible()
      await browser.locator('[data-slot="tool-group-trigger"]').tap()
      await expect(screen.getByRole('region', '查看附件 1')).toBeVisible()
      await screen.getByRole('button', '已完成 查看附件 1').tap()
      await expect(screen.getByText('耗时 0.5 秒', { exact: true })).toBeVisible()
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(await browser.evaluate(() => document.body.textContent?.includes('PRIVATE_SECRET'))).toBe(false)
      await app.screenshot(`activity-expanded-${theme}-${width}`)
      await screen.getByRole('button', '等待确认').tap()
      await expect(screen.getByText('等待有权限的成员审批。', { exact: true })).toBeVisible()
      await disclosure.tap()
      await expect(screen.getByText('等待有权限的成员审批。', { exact: true })).toBeVisible()
      await expect(screen.getByText('最终答复始终可见。', { exact: true })).toBeVisible()
      await app.screenshot(`activity-attention-${theme}-${width}`)
      await screen.getByRole('button', '失败').tap()
      await expect(screen.getByText('这一步未完成，请重试。', { exact: true })).toBeVisible()
      await app.screenshot(`activity-failure-${theme}-${width}`)
      await browser.reload()
      await expect(screen.getByText('最终答复始终可见。', { exact: true })).toBeVisible()
    })
  }
  test('long histories keep early calls and reveal all later calls', async ({ app, browser, screen }) => {
    await app.open('/e2e/run-activity.html?long=1')
    await browser.locator('[data-slot="run-activity"] [data-slot="collapsible-trigger"]').first().tap()
    await expect(screen.getByText('最终答复始终可见。', { exact: true })).toBeVisible()
    for (let index = 0; index < 7; index++) await browser.locator('button').filter({ hasText: '显示更多活动' }).tap()
    await browser.locator('[data-slot="tool-group-trigger"]').tap()
    await expect(screen.getByRole('region', '查看附件 1', { exact: true })).toBeVisible()
    await expect(screen.getByRole('region', '查看附件 300', { exact: true })).toBeVisible()
    await app.screenshot('activity-long-300')
  })
  test('official reference screenshots at fixed viewport', async ({ app, browser }) => {
    await browser.setViewport({ width: 1440, height: 960 })
    for (const component of ['run-activity', 'reasoning', 'tool-call', 'tool-group', 'tool-timeline', 'agent-plan']) {
      await app.open(`https://www.assistant-ui.com/elements/${component}`)
      await app.screenshot(`official-${component}-1440`)
    }
  })
  test('wire history pages replace the page while answer and attention stay visible', async ({ app, browser, screen }) => {
    await app.open('/e2e/run-activity.html?paged=1')
    await expect(screen.getByText('最终答复始终可见。', { exact: true })).toBeVisible()
    await screen.getByRole('button', '查看全部活动（1100 条）').tap()
    await expect(screen.getByText('活动记录 · 1–40 / 1100', { exact: true })).toBeVisible()
    await screen.getByRole('button', '下一页活动').tap()
    await expect(screen.getByText('活动记录 · 41–80 / 1100', { exact: true })).toBeVisible()
    await screen.getByRole('button', '上一页活动').tap()
    await expect(screen.getByText('活动记录 · 1–40 / 1100', { exact: true })).toBeVisible()
    await screen.getByRole('button', '查看需要注意的记录（110 条）').tap()
    await expect(screen.getByText('活动记录 · 1–40 / 110', { exact: true })).toBeVisible()
    expect(await browser.locator('[data-tool-state="incomplete"]').count()).toBeLessThanOrEqual(40)
    await expect(screen.getByText('最终答复始终可见。', { exact: true })).toBeVisible()
    await app.screenshot('activity-wire-pages')
  })
  test('math fonts load through the production asset pipeline', async ({ app, browser }) => {
    await app.open('/e2e/run-activity.html')
    expect(await browser.evaluate(async () => {
      const fonts = await document.fonts.load('16px KaTeX_Main')
      return fonts.length > 0 && fonts.every(font => font.status === 'loaded')
    })).toBe(true)
    await app.screenshot('activity-math-fonts')
  })
})
