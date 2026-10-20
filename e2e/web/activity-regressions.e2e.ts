import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Written before the product fix. Synthetic receipts isolate product component
// integration; they do not stand in for a provider or authorized backend test.
test.describe('Activity integration regressions', {
  ...(process.env.E2E_MEMORY_PRIVACY_FIXTURE === '1' ? {} : { skip: 'Requires the isolated component fixture.' }),
}, () => {
  test('latest committed public explanation stays visible through the next tool and terminal history', async ({ app, browser, screen }) => {
    await app.open('/e2e/run-activity.html?mode=running&public=1')
    await expect(screen.getByText('已经核对条件，接下来检查资料。', { exact: true })).toBeVisible()
    await app.screenshot('public-explanation-running')
    for (const state of ['取消', '失败', '完成']) {
      await screen.getByRole('button', state, { exact: true }).tap()
      await expect(screen.getByText('已经核对条件，接下来检查资料。', { exact: true })).toBeVisible()
      await expect(screen.getByText('最终答复始终可见。', { exact: true })).toBeVisible()
      await app.screenshot(`public-explanation-${state}`)
    }
  })
  test('memory renders with the product context and reloads authorized history', async ({ app, browser, screen }) => {
    await app.open('/e2e/memory-privacy.html?reset=1&mode=history')
    await app.screenshot('memory-product-context')
    expect(await browser.evaluate(() => document.documentElement.dataset.cardException ?? '')).toBe('')
    await expect(screen.getByText('偏好中文回答', { exact: true })).toBeVisible()
    await browser.reload()
    await expect(screen.getByText('偏好中文回答', { exact: true })).toBeVisible()
  })
  for (const [mode, expected] of [['empty', '当前没有可显示的记忆。'], ['loading', '正在核对记忆状态…'], ['load-error', '记忆状态暂时无法加载。']]) {
    test(`memory ${mode} is explicit and recoverable`, async ({ app, browser, screen }) => {
      await app.open(`/e2e/memory-privacy.html?reset=1&mode=${mode}`)
      await expect(screen.getByText(expected, { exact: mode !== 'load-error' }).first()).toBeVisible()
      await app.screenshot(`memory-${mode}`)
      if (mode === 'load-error') {
        await screen.getByRole('button', '重试', { exact: true }).first().tap()
        await expect(screen.getByText('偏好中文回答', { exact: true })).toBeVisible()
      }
      expect(await browser.evaluate(() => document.documentElement.dataset.cardException ?? '')).toBe('')
    })
  }
})
