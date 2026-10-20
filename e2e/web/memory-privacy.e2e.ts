import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: missing steps, false saved states, lost attention, duplicate chips,
// broken forget/reload, private payloads, keyboard focus or mobile overflow.
test.describe('Official memory activity', {
  ...(process.env.E2E_MEMORY_PRIVACY_FIXTURE === '1' ? {} : { skip: 'Requires the isolated memory activity fixture server.' }),
}, () => {
  test('forget invalidates cards from two runs without receipt fallback',async({app,browser,screen})=>{
    await app.open('/e2e/memory-privacy.html?mode=pair&reset=1')
    for(const index of [0,1]) {
      await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > [data-slot="collapsible-trigger"]').nth(index).tap()
      await browser.locator('[data-slot="tool-group-trigger"]').nth(index).tap()
    }
    await expect(screen.getByText('偏好中文回答',{exact:true})).toHaveCount(2)
    await browser.locator('button[aria-label=\'Forget "偏好中文回答"\']').first().tap()
    await expect(screen.getByText('偏好中文回答',{exact:true})).toHaveCount(0)
    await expect(screen.getByText('更新后的学习目标',{exact:true})).toHaveCount(2)
    await app.screenshot('memory-two-run-forget')
  })
  for (const width of [1440, 390]) test(`memory activity, attention and forgetting (${width})`, async ({ app, browser, screen }) => {
    const settle = () => browser.evaluate(async () => {
      await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
      return true
    })
    await browser.setViewport({ width, height: 1100 })
    await app.open('/e2e/memory-privacy.html?reset=1')
    for (const mode of ['history', 'stream', 'mixed']) {
      await screen.getByRole('button', mode, { exact: true }).tap()
      await expect(screen.getByText('答复正文保持可见。')).toBeVisible()
      await expect(browser.locator('[data-slot="run-activity"]')).toHaveCount(1)
      await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > [data-slot="collapsible-trigger"]').tap()
      await browser.locator('[data-slot="tool-group-trigger"]').press('Enter')
      await expect(screen.getByText('偏好中文回答', { exact: true })).toBeVisible()
      for (const label of ['查看记忆', '读取记忆', '搜索记忆', '保存记忆', '查看记忆历史', '恢复记忆', '忘记记忆', '整理记忆', '检查记忆']) {
        await expect(browser.locator(`section[aria-label="${label}"]`)).toHaveCount(1)
      }
      expect(await browser.evaluate(() => document.body.textContent)).not.toMatch(/PRIVATE|im-memory:/)
      expect(await browser.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
      await settle()
      await app.screenshot(`memory-activity-${mode}-${width}`)
      await app.open(`/e2e/memory-privacy.html?mode=${mode}`)
    }
    await app.open('/e2e/memory-privacy.html?mode=failure')
    await expect(browser.locator('section[aria-label="恢复记忆"]')).toBeVisible()
    await expect(browser.locator('section[aria-label="忘记记忆"]')).toBeVisible()
    await expect(screen.getByText('答复正文保持可见。')).toBeVisible()
    await settle()
    await app.screenshot(`memory-attention-${width}`)
    await app.open('/e2e/memory-privacy.html?mode=forget-error')
    await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > [data-slot="collapsible-trigger"]').tap()
    await browser.locator('[data-slot="tool-group-trigger"]').press('Enter')
    await screen.getByRole('button', '忘记“偏好中文回答”', { exact: true }).tap()
    await expect(screen.getByText('忘记失败，请重试。', { exact: true })).toBeVisible()
    await expect(screen.getByText('偏好中文回答', { exact: true })).toBeVisible()
    await app.open('/e2e/memory-privacy.html?mode=history')
    await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > [data-slot="collapsible-trigger"]').tap()
    await browser.locator('[data-slot="tool-group-trigger"]').press('Enter')
    await screen.getByRole('button', '忘记“偏好中文回答”', { exact: true }).press('Enter')
    await expect(screen.getByText('偏好中文回答', { exact: true })).toHaveCount(0)
    await expect(screen.getByText('更新后的学习目标', { exact: true })).toBeVisible()
    await app.open('/e2e/memory-privacy.html?mode=history')
    await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > [data-slot="collapsible-trigger"]').tap()
    await browser.locator('[data-slot="tool-group-trigger"]').press('Enter')
    await expect(screen.getByText('偏好中文回答', { exact: true })).toHaveCount(0)
    await expect(screen.getByText('更新后的学习目标', { exact: true })).toBeVisible()
    await settle()
    await app.screenshot(`memory-forgotten-reload-${width}`)
    await app.open('/e2e/memory-privacy.html?mode=readonly')
    await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > [data-slot="collapsible-trigger"]').tap()
    await browser.locator('[data-slot="tool-group-trigger"]').tap()
    await expect(screen.getByText('更新后的学习目标', { exact: true })).toHaveCount(0)
    await expect(browser.locator('[data-slot="memory-chips"] button')).toHaveCount(0)
    await expect(screen.getByText('当前没有可显示的记忆。')).toHaveCount(2)
  })
})
