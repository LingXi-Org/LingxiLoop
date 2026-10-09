import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession, mutationPermission, testName } from './support'

test('canvas text cards create, edit, move, persist, download and delete', {
  ...memberSession(), ...mutationPermission, tags: ['web', 'canvas', 'mutations'], timeout: 180_000,
}, async ({ app, screen, browser }) => {
  const peers = (process.env.E2E_GROUP_PEERS ?? '').split('|').filter(Boolean)
  test.skip(peers.length < 2, 'Set E2E_GROUP_PEERS to two seeded humans separated by |.')
  const group = testName('canvas group')
  const content = testName('canvas content')
  await app.open('/')
  await screen.getByRole('button', '新建对话').tap()
  const creation = screen.getByRole('dialog', '新建对话')
  for (const peer of peers.slice(0, 2)) {
    await creation.getByLabel('搜索参与者').fill(peer)
    await creation.getByRole('checkbox').first().check()
  }
  await creation.getByLabel('群聊名称（可选）').fill(group)
  await creation.getByRole('button', '创建群聊').tap()
  await expect(creation).toBeHidden()
  await screen.getByRole('button', '打开画布预览').tap()
  await screen.getByRole('button', /^打开完整画布：/).tap()
  await expect(screen.getByText('画布还没有卡片')).toBeVisible()
  await browser.locator('[data-canvas-stage]').secondaryTap()
  await screen.getByRole('menuitem', '新增').hover()
  await screen.getByRole('menuitem', /^文本卡片/).tap()
  const frame = browser.locator('[data-canvas-frame]')
  await expect(frame).toHaveCount(1)
  await browser.locator('[data-canvas-frame] .canvas-frame-body').tap()
  await screen.getByLabel('编辑文本笔记').fill(content)
  await screen.getByLabel('编辑文本笔记').press('Tab')
  await expect(screen.getByText(content, { exact: true })).toBeVisible()
  await expect(screen.getByText('自动保存中…')).toBeHidden()
  const position = await browser.evaluate(() => {
    const header = document.querySelector<HTMLElement>('[data-canvas-frame] header')!
    const rect = header.getBoundingClientRect()
    const card = header.closest<HTMLElement>('[data-canvas-frame]')!
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, left: card.style.left }
  })
  const savedMove = browser.waitForResponse('**/api/canvas/frames/*')
  await browser.mouse.move(position.x, position.y)
  await browser.mouse.down()
  await browser.mouse.move(position.x + 65, position.y + 30)
  await browser.mouse.up()
  expect((await savedMove).status).toBe(200)
  await expect.poll(() => browser.evaluate(() => document.querySelector<HTMLElement>('[data-canvas-frame]')!.style.left)).not.toBe(position.left)
  await screen.getByRole('button', '返回对话').tap()
  await browser.reload()
  await screen.getByLabel('搜索会话和消息').fill(group)
  await browser.locator('[data-slot="sidebar"] [role="button"]').filter({ hasText: group }).tap()
  await screen.getByRole('button', '打开画布预览').tap()
  await screen.getByRole('button', /^打开完整画布：/).tap()
  await expect(screen.getByText(content, { exact: true })).toBeVisible()
  await expect.poll(() => browser.evaluate(() => document.querySelector<HTMLElement>('[data-canvas-frame]')?.style.left ?? null)).not.toBe(position.left)
  await frame.secondaryTap()
  const download = await browser.waitForDownload(() => screen.getByRole('menuitem', '下载文件').tap())
  expect(download.suggestedFilename).toBe('文本笔记.md')
  const expectedFile = process.env.E2E_CANVAS_EXPECTED_PATH ?? '.e2e/web/canvas-export-expected.json'
  await mkdir(path.dirname(expectedFile), { recursive: true })
  await writeFile(expectedFile, JSON.stringify({ download: download.path, content }))
  await browser.keyboard.press('Escape')
  await frame.secondaryTap()
  await screen.getByRole('menuitem', '删除卡片').tap()
  await screen.getByRole('alertdialog').getByRole('button', '删除卡片').tap()
  await expect(frame).toHaveCount(0)
  await expect(screen.getByText('画布还没有卡片')).toBeVisible()
})
