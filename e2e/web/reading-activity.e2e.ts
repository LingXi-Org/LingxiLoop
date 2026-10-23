import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test.describe('Reading activity uses the shared compact row', { tags: ['web', 'reading-activity'], timeout: 120_000,
  ...(process.env.E2E_READING_ACTIVITY_FIXTURE === '1' ? {} : { skip: 'Requires isolated reading activity fixture.' }),
}, () => {
  for (const [theme, width] of [['light', 1440], ['dark', 390]] as const) {
    test(`one row preserves public details and reply ${theme} ${width}`, async ({ app, browser, screen }) => {
      await browser.setViewport({ width, height: 900 })
      await app.open(`/e2e/reading-activity.html?theme=${theme}`)
      await expect(screen.getByText('有效正文与引用必须保留：', { exact: false })).toBeVisible()
      await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
      expect(await browser.locator('[data-slot="tool-call"]').count()).toBe(1)
      expect(await browser.locator('[data-slot="progress-tracker"]').count()).toBe(0)
      await screen.getByRole('button', '已读取原文 阅读课程原文').tap()
      await expect(screen.getByText('公开记录摘要：已核对资料状态。', { exact: true })).toBeVisible()
      await expect(screen.getByText('合成公开手册', { exact: false })).toBeVisible()
      await expect(screen.getByRole('button', '合成资料', { exact: true })).toBeVisible()
      expect(await browser.evaluate(() => document.body.textContent)).not.toContain('PRIVATE_SOURCE_CANARY')
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await app.screenshot(`reading-compact-${theme}-${width}`)
      await screen.getByRole('button', '合成资料', { exact: true }).tap()
      await expect(screen.getByText('https://example.com/reference', { exact: true })).toBeVisible()
      await browser.reload()
      await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
      expect(await browser.locator('[data-slot="tool-call"]').count()).toBe(1)
      expect(await browser.locator('[data-slot="progress-tracker"]').count()).toBe(0)
    })
  }
  test('source outcomes and actionable states remain explicit', async ({ app, browser, screen }) => {
    for (const [mode, label] of [['no_matches', '没有匹配资料'], ['empty', '资料没有可读正文'], ['processing', '资料处理中'], ['unavailable', '检索服务不可用'], ['failed', '执行失败'], ['cancelled', '已取消'], ['unknown', '结果待核对'], ['approval', '等待审批']]) {
      await app.open(`/e2e/reading-activity.html?mode=${mode}`)
      if (['no_matches', 'empty', 'processing', 'cancelled'].includes(mode)) await browser.locator('[data-slot="run-activity"] button').first().press('Enter')
      await expect(screen.getByRole('button', `${label} 阅读课程原文${['unavailable', 'failed'].includes(mode) ? ' 未完成' : ''}`)).toBeVisible()
      expect(await browser.locator('[data-slot="progress-tracker"]').count()).toBe(0)
      if (['unavailable', 'failed'].includes(mode)) await expect(screen.getByText('这一步未完成，请重试。', { exact: true })).toBeVisible()
      if (mode === 'approval') await expect(screen.getByText('等待有权限的成员审批。', { exact: true })).toBeVisible()
      await expect(screen.getByRole('button', '合成资料', { exact: true })).toBeVisible()
    }
    await app.screenshot('reading-approval-preserved')
  })
})
