import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test.describe('Public activity presentation', {
  ...(process.env.E2E_ACTIVITY_FIXTURE === '1' ? {} : { skip: 'Requires isolated public-receipt fixture.' }),
}, () => {
  test('client public-receipt render budget', async ({ app, browser }) => {
    await app.open('/e2e/run-activity.html?public=1&bench=1')
    const timing = await browser.evaluate(async () => {
      const button = document.querySelector<HTMLButtonElement>('#receive-public-fixture')!
      button.click()
      const start = performance.getEntriesByName('activity-fixture-trigger').at(-1)!.startTime
      let textMs: number | null = null
      const visible = (node: Element) => node.checkVisibility({ checkVisibilityCSS: true }) && node.getBoundingClientRect().width > 0
      while (performance.now() - start < 1200) {
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        const receive = performance.getEntriesByName('activity-fixture-receive').at(-1)?.startTime
        if (receive !== undefined && [...document.querySelectorAll('[data-slot="run-activity"] p')].some(node => visible(node) && node.textContent?.includes('公开说明增量'))) {
          textMs = performance.now() - receive
          break
        }
      }
      const value = { scope: 'synthetic public receipt; no provider or network send', visibility: document.visibilityState, receiveToPaintMs: textMs }
      document.getElementById('activity-fixture-measurements')!.textContent = JSON.stringify(value)
      return value
    })
    const output = process.env.E2E_ACTIVITY_TIMING_OUTPUT ?? '.e2e/activity-timing'
    await mkdir(output, { recursive: true })
    await writeFile(`${output}/timing.json`, JSON.stringify(timing, null, 2))
    await app.screenshot('public-receipt-timing')
    expect(timing.visibility).toBe('visible')
    expect(timing.receiveToPaintMs).not.toBeNull()
    expect(timing.receiveToPaintMs!).toBeLessThanOrEqual(300)
  })
  for (const width of [390, 1440]) test(`known aliases, persisted generic titles and distinct official cards ${width}`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width, height: 1100 })
    await app.open('/e2e/run-activity.html?catalog=1')
    await browser.locator('[data-slot="tool-group-trigger"]').press('Enter')
    for (const label of ['查看可视化参考', '阅读对话历史', '回查引用依据', '查找可用工具', '查找资料', '查看记忆', '重命名文档', '检索课程资料']) {
      await expect(browser.locator(`section[aria-label="${label}"]`)).toHaveCount(1)
    }
    await expect(browser.locator('[data-slot="memory-chips"]')).toBeVisible()
    await expect(browser.locator('[data-slot="web-search"]')).toBeVisible()
    const referenceTrigger = browser.locator('section[aria-label="查看可视化参考"] [data-slot="tool-call"] > [data-slot="collapsible-trigger"]')
    await expect(referenceTrigger).toHaveAttribute('aria-expanded', 'false')
    await referenceTrigger.press('Enter')
    await expect(referenceTrigger).toHaveAttribute('aria-expanded', 'true')
    await expect(browser.locator('section[aria-label="查看可视化参考"] [data-slot="tool-call"] > [data-slot="collapsible-content"]')).toBeVisible()
    await expect(screen.getByText('查阅当前可视化组件的使用说明。', { exact: true })).toBeVisible()
    expect(await browser.evaluate(() => document.body.textContent)).not.toMatch(/处理任务|历史通用说明|visualize__|memory__/)
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await app.screenshot(`known-official-cards-${width}`)
    await referenceTrigger.press('Enter')
    await expect(referenceTrigger).toHaveAttribute('aria-expanded', 'false')
    for (const label of ['运行中', '失败', '取消', '结果待核对']) {
      await screen.getByRole('button', label, { exact: true }).press('Enter')
      const stateLabel = label === '运行中' ? '正在处理' : label === '失败' ? '执行失败' : label === '取消' ? '已取消' : '结果待核对'
      await expect(screen.getByRole('button', `${stateLabel} 查找资料${label === '失败' ? ' 未完成' : ''}`, { exact: true })).toBeVisible()
      const summary = label === '运行中' ? '正在执行这一步。' : label === '失败' ? '这一步未完成，请检查相关信息后重试。'
        : label === '取消' ? '这一步已停止。' : '操作结果尚未确认，请先核对结果，避免重复执行。'
      for (const title of ['查找资料', '检索课程资料']) {
        const trigger = browser.locator(`section[aria-label="${title}"] [data-slot="tool-call"] > [data-slot="collapsible-trigger"]`)
        const details = browser.locator(`section[aria-label="${title}"] [data-slot="tool-call"] > [data-slot="collapsible-content"]`)
        await expect(trigger).toHaveAttribute('aria-expanded', 'false')
        await trigger.press('Enter')
        await expect(trigger).toHaveAttribute('aria-expanded', 'true')
        await expect(details).toBeVisible()
        await expect(details).toContainText('操作目的')
        await expect(details).toContainText(summary)
        await app.screenshot(`known-${title}-${label}-expanded-${width}`)
        await trigger.press('Enter')
        await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      }
      if (label === '取消' || label === '结果待核对') {
        expect(await browser.locator('section[aria-label="查找资料"]').textContent()).not.toMatch(/失败|请重试/)
        expect(await browser.locator('section[aria-label="检索课程资料"]').textContent()).not.toMatch(/已完成|检索未完成|请重试/)
      }
      await app.screenshot(`known-cards-${label}-${width}`)
    }
  })
  test('official reference components', async ({ app, browser }) => {
    await browser.setViewport({ width: 1440, height: 1100 })
    for (const name of ['memory-chips', 'web-search', 'run-activity']) {
      await app.open(`https://www.assistant-ui.com/elements/${name}`)
      await app.screenshot(`official-${name}`)
    }
  })
})
