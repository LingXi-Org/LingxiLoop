import { expect, test, type Page } from '@playwright/test'

type Scenario = 'personal' | 'learner' | 'teacher'

const menus: Record<Scenario, string[]> = {
  personal: ['概览', '学习计划', '学习目标', '学习证据', '日历', '资料'],
  learner: ['概览', '学习任务', '学习目标', '课程活动', '学习证据', '日历', '资料'],
  teacher: ['总览', '学员', '课程内容', '学习活动', '评价审核', '分享与成员', '日历', '资料', '课程设置'],
}

async function openFixture(page: Page, options: { scenario?: Scenario; theme?: 'light' | 'dark'; dashboard?: 'open' | 'closed' } = {}) {
  const query = new URLSearchParams({
    scenario: options.scenario ?? 'personal',
    theme: options.theme ?? 'dark',
    dashboard: options.dashboard ?? 'open',
  })
  await page.goto(`/e2e/settings-dashboard.html?${query}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await expect(page.getByTestId('desktop-shell')).toBeVisible()
}

async function openSettings(page: Page) {
  const trigger = page.getByRole('button', { name: '打开账户菜单' })
  await trigger.click()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await menu.getByRole('menuitem', { name: '设置' }).click()
  const dialog = page.getByRole('dialog', { name: 'LingxiLoop 设置' })
  await expect(dialog).toBeVisible()
  return { trigger, dialog }
}

test('头像菜单依次显示账号摘要、设置和退出登录', async ({ page }) => {
  await openFixture(page)
  await page.getByRole('button', { name: '打开账户菜单' }).click()
  const menu = page.getByRole('menu')
  const orderedItems = menu.locator('[data-slot="dropdown-menu-label"], [data-slot="dropdown-menu-item"]')
  await expect(orderedItems).toHaveCount(3)
  await expect(orderedItems.nth(0)).toContainText('林小溪')
  await expect(orderedItems.nth(0)).toContainText('xiaoxi@example.cn')
  await expect(orderedItems.nth(1)).toHaveText('设置')
  await expect(orderedItems.nth(2)).toHaveText('退出登录')
})

test('设置使用 Dialog，Escape 关闭后焦点回到账户头像', async ({ page }) => {
  await openFixture(page)
  const { trigger, dialog } = await openSettings(page)
  await expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
  await expect(page.locator('[data-slot="drawer-content"], [data-slot="sheet-content"]')).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: '账号', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('窄屏设置仍是带中文语义的 Dialog 图标栏', async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 760 })
  await openFixture(page)
  const { dialog } = await openSettings(page)
  const settingsNavigation = dialog.getByRole('list', { name: '设置栏目' })
  await expect(settingsNavigation).toBeVisible()
  await expect(settingsNavigation.getByRole('button')).toHaveCount(5)
  for (const label of ['账号', '外观与声音', '通知', '数据与账号']) {
    await expect(settingsNavigation.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  const sidebar = dialog.locator('[data-slot="sidebar"]')
  const sidebarWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width)
  expect(sidebarWidth).toBeLessThanOrEqual(60)
  await expect(page.locator('[data-slot="drawer-content"], [data-slot="sheet-content"]')).toHaveCount(0)
})

test('设置中的浅色和深色主题会立即作用于整个界面', async ({ page }) => {
  await openFixture(page, { theme: 'dark' })
  const sharedMain = page.getByTestId('shared-main')
  const darkCardColor = await sharedMain.evaluate((element) => getComputedStyle(element).backgroundColor)
  const { dialog } = await openSettings(page)
  await dialog.getByRole('button', { name: '外观与声音' }).click()
  const theme = dialog.getByRole('combobox', { name: '主题' })
  await expect(page.locator('html')).toHaveClass(/dark/)
  await theme.click()
  await page.getByRole('option', { name: '浅色' }).click()
  await expect(page.locator('html')).toHaveClass(/light/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  const lightCardColor = await sharedMain.evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(lightCardColor).not.toBe(darkCardColor)
  await theme.click()
  await page.getByRole('option', { name: '深色' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

for (const scenario of ['personal', 'learner', 'teacher'] as const) {
  test(`${scenario} 学习区显示正确中文菜单和可访问图表`, async ({ page }) => {
    await openFixture(page, { scenario })
    const navigation = page.getByRole('list', { name: '学习看板菜单' })
    await expect(navigation.getByRole('button')).toHaveText(menus[scenario])
    const overview = page.getByTestId('dashboard-overview')
    await expect(overview).toBeVisible()
    const charts = overview.locator('[data-slot="chart"]')
    await expect(charts.first()).toBeVisible()
    expect(await charts.count()).toBeGreaterThanOrEqual(3)
    const accessibleCharts = charts.locator('svg[role="application"]')
    await expect(accessibleCharts.first()).toBeVisible()
    expect(await accessibleCharts.count()).toBe(await charts.count())
    await expect(overview).not.toContainText(/风险预测|学习时长|连续学习|排名/)
  })
}

test('品牌头像在左侧工作区栏打开右侧共享圆角主内容', async ({ page }) => {
  await openFixture(page, { dashboard: 'closed' })
  const brand = page.getByRole('button', { name: '打开学习看板' })
  await expect(page.getByText('点击左上角品牌头像打开学习看板。')).toBeVisible()
  await brand.click()
  await expect(brand).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('list', { name: '学习看板菜单' })).toBeVisible()
  const main = page.getByTestId('shared-main')
  await expect(main).toHaveCSS('overflow', 'hidden')
  const shape = await main.evaluate((element) => {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    return { radius: Number.parseFloat(style.borderTopLeftRadius), left: box.left, right: box.right }
  })
  expect(shape.radius).toBeGreaterThanOrEqual(12)
  expect(shape.left).toBeGreaterThanOrEqual(64)
  expect(shape.right).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth - 7))
  await expect(page.locator('[data-slot="drawer-content"], [data-slot="sheet-content"]')).toHaveCount(0)
})

test('200% 界面缩放下设置仍可键盘操作且不会横向溢出', async ({ page }) => {
  // A 480×360 CSS viewport is the relayout area produced when a 960×720
  // desktop viewport is viewed at 200% browser zoom.
  await page.setViewportSize({ width: 480, height: 360 })
  await openFixture(page)
  const { dialog } = await openSettings(page)
  await expect(dialog.getByRole('button', { name: '账号', exact: true })).toBeFocused()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '打开账户菜单' })).toBeFocused()
})
