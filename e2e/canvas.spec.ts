import { expect, test, type Locator, type Page } from '@playwright/test'

test.setTimeout(360_000)

async function openFixture(
  page: Page,
  options: { theme?: 'light' | 'dark'; viewport?: { width: number; height: number } } = {},
) {
  if (options.viewport) await page.setViewportSize(options.viewport)
  await page.goto(`/e2e/canvas.html?theme=${options.theme ?? 'light'}`, {
    waitUntil: 'commit',
    timeout: 90_000,
  })
  await expect(page.getByTestId('canvas-fixture-shell')).toBeVisible({ timeout: 240_000 })
  const preview = page.locator('[data-canvas-preview]')
  await expect(preview).toBeAttached({ timeout: 240_000 })
  const previewBox = await preview.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return { width: rect.width, height: rect.height, display: style.display, visibility: style.visibility, opacity: style.opacity }
  })
  if (previewBox.width === 0 || previewBox.height === 0 || previewBox.visibility === 'hidden') {
    throw new Error(`Canvas preview has no visible box: ${JSON.stringify(previewBox)}`)
  }
  await page.evaluate(() => document.fonts.ready)
}

async function openCanvas(page: Page) {
  const trigger = page.getByRole('button', { name: '打开完整画布' })
  await trigger.click()
  const root = page.locator('[data-canvas-ui="root"]')
  await expect(root).toBeVisible({ timeout: 30_000 })
  await expect(root.locator('[data-canvas-stage]')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(450)
  return { trigger, root }
}

async function fixtureEvents(page: Page) {
  return page.evaluate(() => window.canvasFixtureEvents)
}

async function expectSketchBorder(target: Locator) {
  const sketch = await target.evaluate((element) => {
    const surface = getComputedStyle(element)
    return {
      surface: {
        borderWidth: Number.parseFloat(surface.borderTopWidth),
        borderStyle: surface.borderTopStyle,
        radius: surface.borderTopLeftRadius,
        shadow: surface.boxShadow,
      },
      strokes: ['::before', '::after'].map((pseudo) => {
        const style = getComputedStyle(element, pseudo)
        return {
          content: style.content,
          borderWidth: Number.parseFloat(style.borderTopWidth),
          borderStyle: style.borderTopStyle,
          maskImage: style.maskImage || style.getPropertyValue('-webkit-mask-image'),
          pointerEvents: style.pointerEvents,
          radius: style.borderTopLeftRadius,
          transform: style.transform,
          zIndex: Number.parseInt(style.zIndex, 10),
        }
      }),
    }
  })
  if (sketch.strokes.every((stroke) => stroke.content !== 'none')) {
    for (const stroke of sketch.strokes) {
      expect(stroke.borderWidth).toBeGreaterThan(0.5)
      expect(stroke.borderStyle).toBe('solid')
      expect(stroke.maskImage).toContain('data:image/svg+xml')
      expect(stroke.pointerEvents).toBe('none')
      expect(stroke.radius).toContain('px')
      expect(stroke.transform).not.toBe('none')
      expect(stroke.zIndex).toBeLessThanOrEqual(3)
    }
    expect(sketch.strokes[0].transform).not.toBe(sketch.strokes[1].transform)
    return
  }
  expect(sketch.surface.borderWidth).toBeGreaterThan(0.5)
  expect(sketch.surface.borderStyle).toBe('solid')
  expect(sketch.surface.radius).toContain('px')
  expect(sketch.surface.shadow).not.toBe('none')
}

test.beforeEach(async ({ context }, testInfo) => {
  testInfo.snapshotSuffix = 'chromium'
  const baseURL = String(testInfo.project.use.baseURL)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(baseURL).origin,
  })
})

test('Canvas 字体、品牌色与 Portal 样式保持在专属作用域内', async ({ page }) => {
  await openFixture(page)
  const outside = page.getByTestId('outside-ui')
  const preview = page.locator('[data-canvas-preview]')
  const outsideFont = await outside.evaluate((element) => getComputedStyle(element).fontFamily)
  const previewFont = await preview.evaluate((element) => getComputedStyle(element).fontFamily)
  expect(outsideFont).not.toContain('Assistant')
  expect(outsideFont).not.toContain('Excalifont')
  expect(previewFont).toContain('Assistant')
  await expect(page.locator('.canvas-preview-shell')).toHaveCSS('box-shadow', 'none')
  await expect(page.locator('.canvas-preview-shell')).toHaveCSS('border-top-width', '0px')
  await expectSketchBorder(preview)
  await expectSketchBorder(preview.locator('.canvas-preview-frame').first())

  const { trigger, root } = await openCanvas(page)
  expect((await root.boundingBox())?.width ?? 0).toBeGreaterThan(1_000)
  const rootFont = await root.evaluate((element) => getComputedStyle(element).fontFamily)
  const contentFont = await root.locator('.canvas-frame-body').first().evaluate((element) => getComputedStyle(element).fontFamily)
  const stageBackground = await root.locator('[data-canvas-stage]').evaluate((element) => getComputedStyle(element).backgroundImage)
  expect(rootFont).toContain('Assistant')
  expect(contentFont).toContain('Excalifont')
  expect(contentFont).toContain('Xiaolai')
  expect(stageBackground).toContain('radial-gradient')

  const frame = root.locator('[data-canvas-frame="frame-notes"]')
  await expectSketchBorder(root.locator('.canvas-title-island'))
  await expectSketchBorder(frame)
  await frame.click()
  await expect(frame).toHaveClass(/is-selected/)
  expect(await frame.evaluate((element) => getComputedStyle(element).getPropertyValue('--canvas-frame-accent').trim())).toBe('#e8590c')

  const stage = root.locator('[data-canvas-stage]')
  const stageBox = await stage.boundingBox()
  expect(stageBox).not.toBeNull()
  await page.mouse.click(stageBox!.x + stageBox!.width - 28, stageBox!.y + stageBox!.height - 28, { button: 'right' })
  const menu = page.locator('[data-canvas-ui="portal"][data-canvas-context-menu]').first()
  await expect(menu).toBeVisible()
  await expect(menu).toHaveCSS('font-family', /Assistant/)
  await expectSketchBorder(menu)
  await page.keyboard.press('Escape')

  await root.getByRole('button', { name: '返回对话' }).click()
  await expect(root).toBeHidden()
  await expect(page.getByText('画布', { exact: true })).toBeVisible()
  await expect(trigger).toBeFocused()
  expect(await outside.evaluate((element) => getComputedStyle(element).fontFamily)).toBe(outsideFont)
})

test('Canvas Drawer 的 Escape 与遮罩关闭不会回弹到底层群聊资料', async ({ page }) => {
  await openFixture(page)
  let { root } = await openCanvas(page)
  await page.keyboard.press('Escape')
  await expect(root).toBeHidden()
  await expect(page.getByText('群聊资料已关闭')).toBeVisible()

  await page.getByRole('button', { name: '打开群聊资料' }).click()
  await expect(page.getByRole('button', { name: '打开完整画布' })).toBeVisible()
  ;({ root } = await openCanvas(page))
  const overlay = page.locator('[data-slot="drawer-overlay"]')
  await expect(overlay).toBeVisible()
  await overlay.click({ position: { x: 20, y: 120 } })
  await expect(root).toBeHidden()
  await expect(page.getByText('群聊资料已关闭')).toBeVisible()
})

test('Canvas 保留拖动、缩放、编辑、滚轮和双指缩放能力', async ({ page }) => {
  await openFixture(page)
  const { root } = await openCanvas(page)
  const frame = root.locator('[data-canvas-frame="frame-notes"]')

  const dragHandle = frame.getByLabel('移动研究结论')
  const beforePosition = await frame.evaluate((element: HTMLElement) => ({ left: element.style.left, top: element.style.top }))
  const dragBox = await dragHandle.boundingBox()
  expect(dragBox).not.toBeNull()
  await page.mouse.move(dragBox!.x + 100, dragBox!.y + 8)
  await page.mouse.down()
  await page.mouse.move(dragBox!.x + 148, dragBox!.y + 34, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => (await fixtureEvents(page)).some((event) => event.action === 'update' && event.frameId === 'frame-notes')).toBe(true)
  const afterPosition = await frame.evaluate((element: HTMLElement) => ({ left: element.style.left, top: element.style.top }))
  expect(afterPosition).not.toEqual(beforePosition)

  const resize = frame.getByRole('button', { name: '调整卡片大小' })
  const beforeSize = await frame.evaluate((element: HTMLElement) => ({ width: element.style.width, height: element.style.height }))
  const resizeBox = await resize.boundingBox()
  expect(resizeBox).not.toBeNull()
  await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(resizeBox!.x + 70, resizeBox!.y + 50, { steps: 4 })
  await page.mouse.up()
  const afterSize = await frame.evaluate((element: HTMLElement) => ({ width: element.style.width, height: element.style.height }))
  expect(afterSize).not.toEqual(beforeSize)

  await frame.locator('.canvas-frame-body').click()
  const editor = frame.getByRole('textbox', { name: '编辑研究结论' })
  await expect(editor).toBeFocused()
  const revisedContent = '# 更新后的研究结论\n\n中英混排 remains readable。'
  await editor.fill(revisedContent)
  await page.waitForTimeout(750)
  await editor.blur()
  await expect.poll(async () => (await fixtureEvents(page)).some((event) => {
    const detail = event.detail as { content?: string } | undefined
    return event.action === 'update' && event.frameId === 'frame-notes' && detail?.content === revisedContent
  })).toBe(true)

  const stage = root.locator('[data-canvas-stage]')
  const world = root.locator('[data-canvas-world="true"]')
  const stageBox = await stage.boundingBox()
  expect(stageBox).not.toBeNull()
  const beforeWheel = await world.getAttribute('style')
  await page.mouse.move(stageBox!.x + stageBox!.width - 36, stageBox!.y + stageBox!.height - 36)
  await page.mouse.wheel(0, -120)
  await expect.poll(() => world.getAttribute('style')).not.toBe(beforeWheel)

  const beforePan = await world.getAttribute('style')
  await page.mouse.down()
  await page.mouse.move(stageBox!.x + stageBox!.width - 96, stageBox!.y + stageBox!.height - 78, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => world.getAttribute('style')).not.toBe(beforePan)

  const beforePinch = await world.getAttribute('style')
  const cdp = await page.context().newCDPSession(page)
  const centerX = stageBox!.x + stageBox!.width - 170
  const centerY = stageBox!.y + stageBox!.height - 150
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: centerX - 30, y: centerY, id: 1 },
      { x: centerX + 30, y: centerY, id: 2 },
    ],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: centerX - 75, y: centerY, id: 1 },
      { x: centerX + 75, y: centerY, id: 2 },
    ],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => world.getAttribute('style')).not.toBe(beforePinch)
})

test('Canvas 菜单保留创建、任务、反馈、复制、下载和删除生命周期', async ({ page }) => {
  await openFixture(page)
  const { root } = await openCanvas(page)
  const stage = root.locator('[data-canvas-stage]')
  const stageBox = await stage.boundingBox()
  expect(stageBox).not.toBeNull()
  const blank = { x: stageBox!.x + stageBox!.width - 36, y: stageBox!.y + stageBox!.height - 36 }

  await page.mouse.click(blank.x, blank.y, { button: 'right' })
  let menu = page.locator('[data-canvas-ui="portal"][data-canvas-context-menu]').first()
  await menu.getByRole('menuitem', { name: /新增/ }).hover()
  const submenu = page.locator('[data-canvas-ui="portal"][data-canvas-context-menu]').last()
  await expect(submenu).toBeVisible()
  await submenu.getByRole('menuitem', { name: /文本卡片/ }).click()
  await expect.poll(async () => (await fixtureEvents(page)).some((event) => event.action === 'create')).toBe(true)

  await page.mouse.click(blank.x, blank.y, { button: 'right' })
  menu = page.locator('[data-canvas-ui="portal"][data-canvas-context-menu]').first()
  await menu.getByRole('menuitem', { name: '对话' }).click()
  const assignmentDialog = page.locator('[data-canvas-dialog="assign-agent"]')
  await expect(assignmentDialog).toBeVisible()
  await expectSketchBorder(assignmentDialog)
  await expectSketchBorder(assignmentDialog.locator('.canvas-agent-option').first())
  const assignmentInputStyle = await assignmentDialog.locator('.canvas-panel-input').evaluate((element) => {
    const style = getComputedStyle(element)
    return { borderWidth: Number.parseFloat(style.borderTopWidth), radius: style.borderTopLeftRadius, shadow: style.boxShadow }
  })
  expect(assignmentInputStyle.borderWidth).toBeGreaterThan(0.5)
  expect(assignmentInputStyle.radius).toContain('px')
  expect(assignmentInputStyle.shadow).not.toBe('none')
  await assignmentDialog.getByPlaceholder('描述希望智能助教在这块画布中完成的工作…').fill('补充对照案例并给出结论')
  await assignmentDialog.getByRole('button', { name: '@ 智能助教并新增工作' }).click()
  await expect.poll(async () => (await fixtureEvents(page)).some((event) => event.action === 'assign')).toBe(true)

  const frame = root.locator('[data-canvas-frame="frame-notes"]')
  await frame.click({ button: 'right', position: { x: 100, y: 80 } })
  menu = page.locator('[data-canvas-ui="portal"][data-canvas-context-menu]').first()
  await menu.getByRole('menuitem', { name: '反馈给智能助教' }).click()
  const feedback = page.locator('[data-canvas-dialog="feedback"]')
  await expect(feedback).toBeVisible()
  await expectSketchBorder(feedback)
  await feedback.getByPlaceholder('说明需要修改或继续完成的内容…').fill('请补充来源并说明限制条件')
  await feedback.getByRole('button', { name: '发送反馈' }).click()
  await expect.poll(async () => {
    const actions = (await fixtureEvents(page)).map((event) => event.action)
    return actions.includes('steer') && actions.includes('comment')
  }).toBe(true)

  await frame.click({ button: 'right', position: { x: 100, y: 80 } })
  menu = page.locator('[data-canvas-ui="portal"][data-canvas-context-menu]').first()
  await menu.getByRole('menuitem', { name: '复制内容' }).click()
  await expect(menu).toContainText('已复制内容')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('学习路径')
  const downloadPromise = page.waitForEvent('download')
  await menu.getByRole('menuitem', { name: '下载文件' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('研究结论.md')
  await page.keyboard.press('Escape')

  await frame.click({ button: 'right', position: { x: 100, y: 80 } })
  menu = page.locator('[data-canvas-ui="portal"][data-canvas-context-menu]').first()
  await menu.getByRole('menuitem', { name: '删除卡片' }).click()
  let alert = page.getByRole('alertdialog')
  await expect(alert).toContainText('“研究结论”将被永久删除')
  await alert.getByRole('button', { name: '取消' }).click()
  expect((await fixtureEvents(page)).some((event) => event.action === 'delete')).toBe(false)

  await frame.click({ button: 'right', position: { x: 100, y: 80 } })
  await page.locator('[data-canvas-ui="portal"][data-canvas-context-menu]').first().getByRole('menuitem', { name: '删除卡片' }).click()
  alert = page.getByRole('alertdialog')
  await alert.getByRole('button', { name: '删除卡片' }).click()
  await expect.poll(async () => (await fixtureEvents(page)).some((event) => event.action === 'delete')).toBe(true)
  await expect(frame).toHaveCount(0)
  await expect(page.getByText('画布卡片已删除')).toBeVisible()
})

test('Canvas 亮色桌面视觉基线', async ({ page }) => {
  await openFixture(page, { theme: 'light', viewport: { width: 1280, height: 800 } })
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
  const preview = page.locator('[data-canvas-preview]')
  await expect(preview).toHaveScreenshot('canvas-preview-light.png', {
    animations: 'disabled',
    mask: [preview.locator('svg'), preview.locator('iframe')],
    maskColor: 'transparent',
    maxDiffPixelRatio: 0.003,
  })
  const { root } = await openCanvas(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(root).toHaveScreenshot('canvas-full-light.png', {
    animations: 'disabled',
    mask: [root.locator('svg'), root.locator('iframe')],
    maskColor: 'transparent',
    maxDiffPixelRatio: 0.003,
  })
})

test('Canvas 深色窄屏视觉基线', async ({ page }) => {
  await openFixture(page, { theme: 'dark', viewport: { width: 520, height: 760 } })
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' })
  const { root } = await openCanvas(page)
  await page.evaluate(() => document.fonts.ready)
  await expect(root).toHaveScreenshot('canvas-full-dark-narrow.png', {
    animations: 'disabled',
    mask: [root.locator('svg'), root.locator('iframe')],
    maskColor: 'transparent',
    maxDiffPixelRatio: 0.003,
  })
})
