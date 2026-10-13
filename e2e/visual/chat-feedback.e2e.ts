import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: ancestor clipping or overlap makes mention options unclickable;
// Enter sends instead of selecting; mobile overflows; completed answers leak
// internal assessment gaps; real errors, approval or delivery recovery disappear.
for (const width of [1440, 390]) {
  test(`conversation items and mention keyboard selection (${width})`, async ({ app, browser }) => {
    await browser.setViewport({ width, height: 960 })
    await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light')
    const row = browser.locator('[data-slot="sidebar"] [role="button"]').first()
    await expect(row).toBeVisible()
    await expect(browser.locator('[data-slot="sidebar"] [data-slot="item-title"]').first()).toBeVisible()
    expect(await row.getAttribute('class')).not.toContain('im-navigation-row')
    await app.screenshot(`native-conversation-items-${width}`)
    if (width < 768) await row.tap()
    const input = browser.locator('[contenteditable="true"]')
    await input.tap()
    await browser.keyboard.type('@')
    const menu = browser.locator('[aria-label="提及成员"]')
    await expect(menu).toBeVisible()
    await expect.poll(() => browser.evaluate(() => getComputedStyle(document.querySelector('[aria-label="提及成员"]')!).opacity)).toBe('1')
    const hit = await browser.evaluate(() => {
      const menu = document.querySelector('[aria-label="提及成员"]')!
      const options = Array.from(menu.querySelectorAll('[role="option"]'))
      return options.length > 0 && options.every(option => {
        const box = option.getBoundingClientRect()
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0
          && option.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
      })
    })
    expect(hit).toBe(true)
    await app.screenshot(`mention-menu-unclipped-${width}`)
    await browser.keyboard.press('ArrowDown')
    await browser.keyboard.press('Enter')
    await expect(menu).toHaveCount(0)
    await expect(browser.locator('[data-directive-id="maya"]').first()).toBeVisible()
    await expect(input).toBeFocused()
    await browser.keyboard.press('Control+A')
    await browser.keyboard.press('Backspace')
    await browser.keyboard.type('@')
    await expect(menu).toBeVisible()
    await browser.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(input).toBeFocused()
  })
}

for (const scenario of ['partial', 'blocked', 'failed', 'delivery', 'cancelled', 'approval', 'empty-blocked']) {
  test(`chat feedback keeps actionable state without internal task diagnostics (${scenario})`, async ({ app, browser, screen }) => {
    await app.open(`/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=chat-${scenario}`)
    await expect(browser.locator('[data-msg-id]').first()).toBeVisible()
    await expect(screen.getByText('任务结果', { exact: true })).toHaveCount(0)
    await expect(screen.getByText('Declared delivery limitation', { exact: false })).toHaveCount(0)
    if (scenario === 'failed') {
      await expect(screen.getByRole('alert')).toHaveText('模型服务请求失败(HTTP 402)。')
    } else if (scenario === 'delivery') {
      await expect(screen.getByRole('alert')).toContainText('答复投递失败')
      await expect(screen.getByRole('button', '重试投递')).toBeVisible()
    } else if (scenario === 'empty-blocked') {
      await expect(screen.getByRole('alert')).toContainText('未能生成答复')
    } else {
      await expect(screen.getByRole('alert')).toHaveCount(0)
      if (scenario === 'cancelled') await expect(screen.getByText('已取消', { exact: true })).toBeVisible()
      else if (scenario === 'approval') await expect(screen.getByRole('button', '批准并继续')).toBeVisible()
      else {
        await expect(screen.getByText('目前没有学习活动记录。')).toBeVisible()
        await expect(screen.getByRole('button', '停止全部智能助教')).toHaveCount(0)
      }
    }
    await app.screenshot(`chat-feedback-${scenario}`)
  })
}
