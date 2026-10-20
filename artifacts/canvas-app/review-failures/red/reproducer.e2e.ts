import { writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
const original = '# 旧卡片\n\n需要一起保留的内容。'
test('conflict readback followed by undo retains leave protection', async ({ app, browser, screen }) => {
  await app.open('/e2e/canvas-app/index.html')
  await browser.locator('[data-canvas-frame="fixture-frame"] .canvas-frame-body').tap()
  const editor = browser.frameLocator('iframe[data-canvas-document-app]')
  const field = editor.getByLabel('编辑文档')
  await expect(field).toBeEnabled()
  await field.fill('已发出的本地草稿 A')
  await screen.getByRole('button', 'Fixture remote edit', { exact: true }).tap()
  await expect(editor.getByRole('status')).toContainText('草稿已保留')
  await browser.evaluate(async () => { await fetch('/__canvas/failure',{method:'POST',body:JSON.stringify({readDelay:1200})});return true })
  await editor.getByRole('button','保存修改',{exact:true}).press('Enter')
  await expect.poll(() => browser.evaluate(async () => (await fetch('/__canvas/evidence').then(r=>r.json())).patches.length)).toBe(1)
  await field.fill(original)
  await expect(editor.getByRole('status')).toContainText('文档已有新版本')
  await expect(field).toHaveValue(original)
  await app.screenshot('conflict-undo-before-leave')
  await screen.getByRole('button','返回对话',{exact:true}).tap()
  const result = await browser.evaluate(async () => ({evidence:await fetch('/__canvas/evidence').then(r=>r.json()),canvasCount:document.querySelectorAll('[data-canvas-ui="root"]').length,confirmationCount:document.querySelectorAll('[role="alertdialog"]').length}))
  await writeFile('/tmp/pr212-independent-callback-review/conflict-undo.json',JSON.stringify({head:'0ec4d73161f367c8443494b15e1fc1b8aabcfad1',expectedDraft:original,...result},null,2),{mode:0o600})
  await expect(screen.getByRole('alertdialog')).toBeVisible()
})
