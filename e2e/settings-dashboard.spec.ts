import { expect, test, type Page } from '@playwright/test'

type Scenario = 'personal' | 'learner' | 'teacher'

const menus: Record<Scenario, string[]> = {
  personal: ['概览', '日历', '资料'],
  learner: ['概览', '日历', '资料'],
  teacher: ['总览', '日历', '资料', '课程设置'],
}

async function mockTeacherApi(page: Page) {
  const requests: string[] = []
  await page.route('**/api/**', async (route) => {
    const requestUrl = new URL(route.request().url())
    const path = requestUrl.pathname
    requests.push(`${path}${requestUrl.search}`)

    let json: unknown
    if (path === '/api/projects/fixture-teacher/learning/overview') {
      json = {
        perspective: 'teacher',
        windowDays: 30,
        summary: { learnerCount: 24, pendingReviews: 1, attempts: 68, learnersWithEvidence: 19, dueReviews: 7 },
        masteryDistribution: [0, 1, 2, 3, 4].map((level) => ({ level, count: 4 + level })),
        missionDistribution: [{ status: 'ACTIVE', count: 14 }, { status: 'COMPLETED', count: 9 }],
        evaluationDistribution: [{ status: 'PENDING', count: 1 }, { status: 'VERIFIED', count: 31 }],
        attention: [{ learnerId: 'learner-1', displayName: '陈晓雨', reasons: ['due_reviews'] }],
      }
    } else if (path === '/api/projects/fixture-teacher/learning/knowledge-units') {
      json = [{
        id: 'objective-1', projectId: 'fixture-teacher', title: '用证据说明设计选择',
        successCriteria: '引用至少两条原始研究证据', targetLevel: 3, position: 0,
        status: 'PUBLISHED', prerequisiteIds: [],
      }]
    } else if (path === '/api/projects/fixture-teacher/learning/activities') {
      json = [{
        id: 'activity-1', projectId: 'fixture-teacher', title: '用户访谈证据',
        instructions: '提交一段结论及其原始证据。', kind: 'ASSESSMENT', status: 'PUBLISHED',
        evaluationMode: 'TEACHER_REQUIRED', targetLevel: 3, rubric: [],
        knowledgeUnitIds: ['objective-1'], dueAt: '2026-09-08T10:00:00.000Z',
      }]
    } else if (path === '/api/projects/fixture-teacher/learning/reviews') {
      json = [{
        id: 'evaluation-1', attempt_id: 'attempt-1', learner_id: 'learner-1',
        learner_display_name: '陈晓雨', activity_title: '用户访谈证据',
        demonstrated_level: 3, confidence: 0.86, feedback: '结论清楚，需核对原始访谈摘录。',
        verifier_verdict: 'supported', status: 'PENDING', assistance: 'NONE',
        created_at: '2026-09-01T09:00:00.000Z',
      }]
    } else if (path === '/api/projects/fixture-teacher/learning/learners/learner-1') {
      json = {
        learner: { learnerId: 'learner-1', displayName: '陈晓雨', email: 'xiaoyu@example.cn', joinedAt: '2026-08-01T08:00:00.000Z' },
        summary: { averageLevel: 2.8, verifiedObjectives: 3, dueReviews: 1, attemptCount: 6, activeMissions: 1 },
        masteryDistribution: [{ level: 3, count: 2 }],
        states: [{ knowledgeUnitId: 'objective-1', title: '用证据说明设计选择', level: 3, status: 'NEEDS_REVIEW', nextReviewAt: '2026-09-03T08:00:00.000Z', reviewIntervalDays: 7, lastEvidenceAt: '2026-09-01T09:00:00.000Z' }],
        missions: [{ missionId: 'mission-1', goal: '完成研究报告', successCriteria: '形成可验证结论', kind: 'PROJECT', status: 'ACTIVE', completedSteps: 2, totalSteps: 4, updatedAt: '2026-09-01T09:00:00.000Z' }],
        attempts: [{ attemptId: 'attempt-1', activityId: 'activity-1', missionStepId: null, title: '用户访谈证据', assistance: 'NONE', status: 'SUBMITTED', submittedAt: '2026-09-01T09:00:00.000Z', evaluation: { evaluationId: 'evaluation-1', demonstratedLevel: 3, confidence: 0.86, status: 'PENDING', feedback: '等待审核' } }],
      }
    } else if (path === '/api/projects/fixture-teacher/learning/attempts/attempt-1') {
      json = {
        attemptId: 'attempt-1',
        learner: { learnerId: 'learner-1', displayName: '陈晓雨', email: 'xiaoyu@example.cn' },
        source: { type: 'activity', id: 'activity-1', title: '用户访谈证据' },
        assistance: 'NONE', status: 'SUBMITTED', submittedAt: '2026-09-01T09:00:00.000Z',
        evidence: { evidenceId: 'evidence-1', kind: 'text', data: '<script>不会执行</script> 原始访谈显示用户需要更清晰的入口。', createdAt: '2026-09-01T09:00:00.000Z' },
        evaluations: [{ evaluationId: 'evaluation-1', demonstratedLevel: 3, confidence: 0.86, rubricResults: [{ criterion: '证据关联', met: true }], feedback: '结论与证据关联明确。', evaluatorId: 'agent-1', evaluatorKind: 'agent', status: 'PENDING', reviewReason: null, reviewedBy: null, reviewedAt: null, createdAt: '2026-09-01T09:01:00.000Z' }],
      }
    } else if (path === '/api/projects/fixture-teacher/learning/learners') {
      json = { data: [{ learnerId: 'learner-1', displayName: '陈晓雨', email: 'xiaoyu@example.cn', averageLevel: 2.8, verifiedObjectives: 3, dueReviews: 1, needsReview: 1, pausedMissions: 0, attemptCount: 6, lastAttemptAt: '2026-09-01T09:00:00.000Z', attentionReasons: ['due_reviews'] }], nextCursor: null }
    } else if (path === '/api/courses/fixture-course/members') {
      json = [{ id: 'learner-1', name: '陈晓雨', email: 'xiaoyu@example.cn', role: 'learner', joinedAt: '2026-08-01T08:00:00.000Z' }]
    } else if (path === '/api/projects/fixture-teacher/invitations') {
      json = [{ id: 'invite-1', email: 'new@example.cn', role: 'learner', note: null, maxUses: 1, useCount: 0, createdAt: '2026-09-01T08:00:00.000Z', expiresAt: '2026-09-08T08:00:00.000Z', status: 'active', acceptances: [] }]
    } else if (path === '/api/courses/fixture-course') {
      json = { id: 'fixture-course', companyId: 'fixture-company', projectId: 'fixture-teacher', projectKind: 'TEACHING', name: '产品设计基础', description: '从真实学习证据出发，建立可验证的产品设计能力。', color: '#5266d6', status: 'ACTIVE', createdBy: 'fixture-user', studyRoomId: 'fixture-room', companyRole: 'owner', courseRole: 'teacher', memberCount: 2, canManage: true }
    } else {
      json = { ok: true }
    }
    await route.fulfill({ json })
  })
  return requests
}

async function openFixture(page: Page, options: { scenario?: Scenario; theme?: 'light' | 'dark'; dashboard?: 'open' | 'closed'; readOnly?: boolean } = {}) {
  const requests = options.scenario === 'teacher' ? await mockTeacherApi(page) : []
  const query = new URLSearchParams({
    scenario: options.scenario ?? 'personal',
    theme: options.theme ?? 'dark',
    dashboard: options.dashboard ?? 'open',
    readonly: String(options.readOnly ?? false),
  })
  await page.goto(`/e2e/settings-dashboard.html?${query}`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await expect(page.getByTestId('desktop-shell')).toBeVisible()
  return requests
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
    if (scenario !== 'teacher') {
      await expect(overview.getByText(scenario === 'personal' ? '学习计划' : '学习任务', { exact: true })).toBeVisible()
      for (const title of ['目标掌握', '课程活动', '学习证据']) {
        await expect(overview.getByText(title, { exact: true })).toBeVisible()
      }
    }
  })
}

test('老师总览按需下钻学员与原始证据，并在同一 Dialog 内返回', async ({ page }) => {
  const requests = await openFixture(page, { scenario: 'teacher' })
  const overview = page.getByTestId('dashboard-overview')
  await expect(overview.getByText('课程脉搏')).toBeVisible()
  await expect(overview.getByText('课程内容状态')).toBeVisible()
  await expect(overview.getByText('课程学习者')).toBeVisible()
  expect(requests.filter((path) => path.includes('/learning/attempts/'))).toHaveLength(0)
  expect(requests.filter((path) => path.endsWith('/learning/learners/learner-1'))).toHaveLength(0)

  const reviewTrigger = overview.getByRole('button', { name: /陈晓雨 · 用户访谈证据/ })
  await reviewTrigger.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '用户访谈证据' })).toBeVisible()
  await expect(dialog).toContainText('<script>不会执行</script>')
  await expect(dialog.locator('script')).toHaveCount(0)
  expect(requests.filter((path) => path.includes('/learning/attempts/'))).toHaveLength(1)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(reviewTrigger).toBeFocused()

  const learnerTrigger = overview.getByRole('button', { name: '查看', exact: true })
  await learnerTrigger.click()
  await expect(dialog.getByRole('heading', { name: '陈晓雨' })).toBeVisible()
  expect(requests.filter((path) => path.endsWith('/learning/learners/learner-1'))).toHaveLength(1)
  await dialog.getByRole('button', { name: '查看证据' }).click()
  await expect(dialog.getByRole('heading', { name: '用户访谈证据' })).toBeVisible()
  await dialog.getByRole('button', { name: '返回学员' }).click()
  await expect(dialog.getByRole('heading', { name: '陈晓雨' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(learnerTrigger).toBeFocused()
})

test('老师课程设置在窄屏使用四栏标准设置并保持页面无横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 760 })
  await openFixture(page, { scenario: 'teacher' })
  await page.getByRole('list', { name: '学习看板菜单' }).getByRole('button', { name: '课程设置' }).click()

  const tabs = page.getByRole('tablist', { name: '课程设置分类' })
  await expect(tabs).toHaveAttribute('aria-orientation', 'horizontal')
  await expect(tabs.getByRole('tab')).toHaveText(['基本资料', '课程内容', '成员与邀请', '课程状态'])
  await expect(page.getByLabel('课程名称')).toHaveValue('产品设计基础')

  await tabs.getByRole('tab', { name: '课程内容' }).click()
  await expect(page.getByRole('button', { name: '创建目标' })).toBeVisible()
  await page.getByRole('button', { name: '创建活动' }).click()
  const activityDialog = page.getByRole('dialog', { name: '创建学习活动' })
  await expect(activityDialog.locator('input[type="datetime-local"]')).toBeVisible()
  await page.keyboard.press('Escape')

  await tabs.getByRole('tab', { name: '成员与邀请' }).click()
  await expect(page.getByRole('button', { name: '创建邀请' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: '变更 陈晓雨 的课程角色' })).toBeVisible()
  await tabs.getByRole('tab', { name: '课程状态' }).click()
  await expect(page.getByRole('button', { name: '结束课程' })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('学生四类详情均使用可滚动 Dialog，Escape 后焦点归还入口', async ({ page }) => {
  await openFixture(page, { scenario: 'learner' })
  for (const title of ['学习任务', '目标掌握', '课程活动', '学习证据']) {
    const trigger = page.getByRole('button', { name: `查看全部${title}` })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: title })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS('overflow', 'hidden')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  }
})

test('学生详情保留来源、rubric、已结束活动，且只读学习者不能提交', async ({ page }) => {
  await openFixture(page, { scenario: 'learner', readOnly: true })
  await page.getByRole('button', { name: '查看全部课程活动' }).click()
  const activityDialog = page.getByRole('dialog', { name: '课程活动' })
  await expect(activityDialog.getByText('第一轮假设复盘')).toBeVisible()
  await expect(activityDialog.getByText('评价标准', { exact: true }).first()).toBeVisible()
  await expect(activityDialog.getByRole('button', { name: '提交为学习证据' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '查看全部学习证据' }).click()
  const evidenceDialog = page.getByRole('dialog', { name: '学习证据' })
  await expect(evidenceDialog.getByText(/来源：提交可用性测试记录/)).toBeVisible()
  await expect(evidenceDialog.getByText(/关联目标：/).first()).toBeVisible()
  await expect(evidenceDialog.getByText(/置信度 88%/)).toBeVisible()
})

test('480×360 学生概览按容器重排且没有横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 360 })
  await openFixture(page, { scenario: 'learner' })
  const overview = page.getByTestId('dashboard-overview')
  const overflow = await overview.evaluate((element) => element.scrollWidth - element.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

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
