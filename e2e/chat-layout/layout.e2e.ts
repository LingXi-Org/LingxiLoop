import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

const baseline = process.env.CHAT_LAYOUT_BASELINE === '1'
const phase = baseline ? 'before' : 'after'
const firstRow = '.fixture-list [data-index="0"] [role="button"]'
const helpLabels = ['给我一点提示', '解释这个原理', '检查我的思路']

async function saveEvidence(name: string, value: unknown) {
  await mkdir('.e2e/chat-layout', { recursive: true })
  await writeFile(`.e2e/chat-layout/${phase}-${name}.json`, JSON.stringify(value, null, 2))
  console.log('CHAT_LAYOUT_EVIDENCE', JSON.stringify({ phase, name, evidence: value }))
}

// #445 failure: status adds a third line and grows the real virtual row.
test('conversation rows keep two equal lines through status changes and virtual scrolling', async ({ app, browser, screen }) => {
  for (const width of [1440, 390]) {
    await browser.setViewport({ width, height: 1100 })
    await app.open('/e2e/chat-layout/index.html')
    await expect(browser.locator(firstRow)).toBeVisible()
    await expect(browser.locator('.fixture-list [data-index="5"] [role="button"]')).toBeVisible()
    const inspect = () => browser.evaluate(() => {
      const boxes = [...document.querySelectorAll<HTMLElement>('.fixture-list [data-index]')].filter(node => Number(node.dataset.index) < 6).map(wrapper => {
        const row = wrapper.querySelector<HTMLElement>('[role="button"]')!
        const content = row.querySelector<HTMLElement>('[data-slot="item-content"]')!
        const title = row.querySelector<HTMLElement>('[data-slot="item-title"]')!
        const description = row.querySelector<HTMLElement>('[data-slot="item-description"]')!
        const titleBox = title.getBoundingClientRect(), rect = row.getBoundingClientRect()
        const time = title.nextElementSibling!.getBoundingClientRect()
        const preview = description.firstElementChild!.getBoundingClientRect()
        const icons = [...description.querySelectorAll<HTMLElement>('[aria-label="已置顶"], [aria-label="已静音"]')]
        const status = row.querySelector<HTMLElement>('[aria-label^="任务状态："]')
        return { index: Number(wrapper.dataset.index), top: rect.top, height: rect.height,
          lineCount: [...content.children].filter(child => child.getBoundingClientRect().height > 0).length,
          titleHeight: titleBox.height, descriptionHeight: description.getBoundingClientRect().height,
          status: status?.textContent ?? null, titleEllipsis: getComputedStyle(title).textOverflow,
          titleClipped: title.scrollWidth > title.clientWidth, titleTimeGap: time.left - titleBox.right,
          iconGaps: icons.map(icon => icon.getBoundingClientRect().left - preview.right),
          overflow: row.scrollWidth - row.clientWidth }
      })
      return { rows: boxes, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
        renderedCount: document.querySelectorAll('.fixture-list [data-index]').length,
        blockedNetwork: (window as unknown as { __chatLayoutNetwork: string[] }).__chatLayoutNetwork }
    })
    const initial = await inspect()
    await app.screenshot(`${phase}-list-${width}`)
    await saveEvidence(`list-${width}`, initial)
    expect(initial.rows.length).toBe(6)
    const heights = initial.rows.map(row => row.height)
    if (baseline) {
      expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1)
      expect(initial.rows.some(row => row.lineCount === 3)).toBe(true)
      continue
    }
    expect(initial.rows.map(row => row.status)).toEqual([null, '处理中', '等你回答', '等你审批', '已完成', '执行失败'])
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.5)
    expect(initial.renderedCount).toBeLessThan(140)
    for (const row of initial.rows) {
      expect(row.height).toBe(70)
      expect(row.lineCount).toBe(2)
      expect(row.titleHeight).toBe(20)
      expect(row.descriptionHeight).toBe(20)
      expect(row.titleEllipsis).toBe('ellipsis')
      expect(row.titleClipped).toBe(true)
      expect(row.titleTimeGap).toBeGreaterThanOrEqual(0)
      expect(row.iconGaps.every(gap => gap >= 0)).toBe(true)
      expect(row.overflow).toBeLessThanOrEqual(1)
    }
    for (let index = 1; index < initial.rows.length; index++) {
      expect(Math.abs(initial.rows[index].top - initial.rows[index - 1].top - initial.rows[index - 1].height - 8)).toBeLessThan(0.5)
    }
    const transitions = []
    for (const [value, label] of [['processing', '处理中'], ['waiting_input', '等你回答'], ['waiting_approval', '等你审批'], ['completed', '已完成'], ['failed', '执行失败'], ['', null]] as const) {
      await screen.getByLabel('首项任务状态', { exact: true }).selectOption({ value })
      await expect.poll(async () => (await inspect()).rows[0].status).toBe(label)
      const next = (await inspect()).rows[0]
      expect(Math.abs(next.height - initial.rows[0].height)).toBeLessThan(0.5)
      expect(Math.abs(next.top - initial.rows[0].top)).toBeLessThan(0.5)
      expect(next.lineCount).toBe(2)
      expect(next.titleTimeGap).toBeGreaterThanOrEqual(0)
      transitions.push({ value, ...next })
    }
    await screen.getByRole('button', '正在输入', { exact: true }).tap()
    await expect(browser.locator(`${firstRow} [data-slot="item-description"]`)).toContainText('公开助教 正在输入')
    expect((await inspect()).rows[0].height).toBe(initial.rows[0].height)
    await browser.locator(firstRow).focus()
    await browser.keyboard.press('Enter')
    await expect(browser.locator(firstRow)).toHaveAttribute('aria-current', 'page')
    await browser.evaluate(() => { const scroller = document.querySelector<HTMLElement>('.fixture-list [data-virtuoso-scroller]')!; scroller.scrollTop = scroller.scrollHeight; return true })
    await expect(browser.locator('.fixture-list [data-index="139"] [role="button"]')).toBeVisible()
    await expect(browser.locator('[data-index="139"] [data-slot="item-title"]')).toHaveText('最后一条 synthetic conversation 139')
    await browser.locator('.fixture-list [data-index="139"] [role="button"]').tap()
    await expect(browser.locator('.fixture-list [data-index="139"] [role="button"]')).toHaveAttribute('aria-current', 'page')
    await browser.evaluate(() => { document.querySelector<HTMLElement>('.fixture-list [data-virtuoso-scroller]')!.scrollTop = 0; return true })
    await expect(browser.locator(firstRow)).toBeVisible()
    await expect.poll(async () => Math.abs((await inspect()).rows[0].top - initial.rows[0].top)).toBeLessThan(0.5)
    await browser.locator(firstRow).tap()
    await expect(browser.locator(firstRow)).toHaveAttribute('aria-current', 'page')
    const final = await inspect()
    expect(final.documentWidth).toBeLessThanOrEqual(width)
    expect(final.blockedNetwork).toEqual([])
    await saveEvidence(`list-interactions-${width}`, { transitions, final, selectedLast: true, returnedFirst: true })
  }
})

// #446 failure: permanent learning-help group/buttons add an empty shortcut row.
test('normal and compact composers retain input, menus, attachment, quote and stop without learning shortcuts', async ({ app, browser, screen }) => {
  for (const width of [1440, 390]) {
    await browser.setViewport({ width, height: 1100 })
    await app.open('/e2e/chat-layout/index.html')
    const editor = browser.locator('[contenteditable="true"]')
    await expect(editor).toBeVisible()
    const inspect = () => browser.evaluate(() => {
      const composer = document.querySelector<HTMLElement>('.chat-composer')!
      const rect = composer.getBoundingClientRect()
      const visibleChildren = [...composer.children].filter(child => child.getBoundingClientRect().height > 0)
      const toolbar = visibleChildren.at(-1)!.getBoundingClientRect()
      const help = document.querySelector('[role="group"][aria-label="学习帮助"]')
      return { formHeight: rect.height, toolbarHeight: toolbar.height, visibleChildren: visibleChildren.length,
        helpPresent: !!help, helpButtons: help?.querySelectorAll('button').length ?? 0,
        horizontalOverflow: composer.scrollWidth - composer.clientWidth,
        blockedNetwork: (window as unknown as { __chatLayoutNetwork: string[] }).__chatLayoutNetwork }
    })
    const modes = []
    for (const mode of ['normal', 'compact']) {
      if (mode === 'compact') await screen.getByRole('button', '切换密度', { exact: true }).tap()
      const metrics = await inspect()
      modes.push({ mode, ...metrics })
      await app.screenshot(`${phase}-composer-${mode}-${width}`)
      if (baseline) {
        expect(metrics.helpPresent).toBe(true)
        expect(metrics.helpButtons).toBe(3)
      } else {
        expect(metrics.helpPresent).toBe(false)
        expect(metrics.visibleChildren).toBe(1)
        expect(metrics.formHeight - metrics.toolbarHeight).toBeLessThanOrEqual(20)
        expect(metrics.horizontalOverflow).toBeLessThanOrEqual(1)
        for (const label of helpLabels) await expect(screen.getByRole('button', label, { exact: true })).toHaveCount(0)
        await expect(screen.getByRole('button', '添加', { exact: true })).toBeVisible()
        await expect(screen.getByRole('button', '发送', { exact: true })).toBeVisible()
      }
    }
    await saveEvidence(`composer-${width}`, modes)
    if (baseline) continue
    await editor.fill('第一行公开尝试')
    await browser.keyboard.press('Shift+Enter')
    await browser.keyboard.type('第二行推导')
    await expect(browser.locator('[data-fixture-draft]')).toHaveText('第一行公开尝试\n第二行推导')
    await screen.getByRole('button', '添加', { exact: true }).tap()
    await expect(screen.getByRole('dialog', '添加', { exact: true })).toBeVisible()
    for (const text of ['上传文件', '提及成员', '发起投票']) await expect(browser.locator('[role="dialog"][aria-label="添加"]')).toContainText(text)
    await expect.poll(() => browser.evaluate(() => {
      const menu = document.querySelector('[role="dialog"][aria-label="添加"]')!.getBoundingClientRect()
      const composer = document.querySelector('.chat-composer')!.getBoundingClientRect()
      return Math.abs(composer.top - menu.bottom - 8)
    })).toBeLessThan(2)
    const menuBounds = await browser.evaluate(() => { const box = document.querySelector('[role="dialog"][aria-label="添加"]')!.getBoundingClientRect(); return { left: box.left, right: box.right, bottom: box.bottom, composerTop: document.querySelector('.chat-composer')!.getBoundingClientRect().top } })
    expect(menuBounds.left).toBeGreaterThanOrEqual(0)
    expect(menuBounds.right).toBeLessThanOrEqual(width)
    expect(Math.abs(menuBounds.composerTop - menuBounds.bottom - 8)).toBeLessThan(2)
    await browser.keyboard.press('Escape')
    await expect(screen.getByRole('dialog', '添加', { exact: true })).toHaveCount(0)
    await expect(browser.locator('[data-fixture-draft]')).toHaveText('第一行公开尝试\n第二行推导')
    await screen.getByLabel('上传文件', { exact: true }).setInputFiles([fileURLToPath(new URL('./public-notes.txt', import.meta.url))])
    await expect(screen.getByRole('group', '待发送附件', { exact: true })).toContainText('public-notes.txt')
    await screen.getByRole('button', '准备引用', { exact: true }).tap()
    await expect(browser.locator('[data-composer-quote]')).toContainText('公开引用：先写下自己的推导。')
    await screen.getByRole('button', '准备停止', { exact: true }).tap()
    await expect(screen.getByRole('button', '停止全部智能助教', { exact: true })).toBeVisible()
    await screen.getByRole('button', '停止全部智能助教', { exact: true }).tap()
    await expect.poll(() => browser.evaluate(() => document.documentElement.dataset.cancelled ?? null)).toBe('layout-0')
    await expect(screen.getByRole('button', '发送', { exact: true })).toBeVisible()
    await expect(browser.locator('[data-fixture-draft]')).toHaveText('第一行公开尝试\n第二行推导')
    await expect(browser.locator('[data-composer-quote]')).toBeVisible()
    await expect(screen.getByRole('group', '待发送附件', { exact: true })).toContainText('public-notes.txt')
    await screen.getByRole('button', '发送', { exact: true }).tap()
    await expect.poll(() => browser.evaluate(() => document.documentElement.dataset.sendCount ?? null)).toBe('1')
    const sent = await browser.evaluate(() => JSON.parse(document.documentElement.dataset.sent!) as { text: string; attachmentCount: number })
    expect(sent.text).toBe('第一行公开尝试\n第二行推导')
    expect(sent.attachmentCount).toBe(1)
    await expect(browser.locator('[data-fixture-draft]')).toHaveText('')
    await expect(browser.locator('[data-composer-quote]')).toHaveCount(0)
    await editor.fill('切换与重挂载保留的公开草稿')
    await screen.getByRole('button', '切换会话', { exact: true }).tap()
    await expect(browser.locator('[data-fixture-conversation]')).toHaveText('layout-1')
    await screen.getByRole('button', '重新挂载', { exact: true }).tap()
    await expect(editor).toBeVisible()
    await expect(browser.locator('[data-fixture-draft]')).toHaveText('切换与重挂载保留的公开草稿')
    await expect(browser.locator('[role="group"][aria-label="学习帮助"]')).toHaveCount(0)
    for (const label of helpLabels) await expect(screen.getByRole('button', label, { exact: true })).toHaveCount(0)
    const final = await inspect()
    expect(final.visibleChildren).toBe(1)
    expect(final.blockedNetwork).toEqual([])
    await app.screenshot(`${phase}-composer-interactions-${width}`)
    await saveEvidence(`composer-interactions-${width}`, { sent, menuBounds, final, stoppedWithDraft: true, switchedAndRemounted: true })
  }
})
