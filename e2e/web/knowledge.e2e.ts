import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession, mutationPermission, testName } from './support'

test('shared knowledge source ingestion and preview remain usable in course materials', {
  ...memberSession('student'), ...mutationPermission, tags: ['web', 'knowledge', 'mutations'], timeout: 180_000,
}, async ({ app, screen, browser }) => {
  test.skip(process.env.E2E_KNOWLEDGE !== '1', 'Set E2E_KNOWLEDGE=1 with the real worker, object storage and Open Notebook services running.')
  const title = testName('source')
  await app.open('/?project=e2e-classroom&view=course-materials')
  const sourceId = await browser.evaluate(async (name) => {
    const response = await fetch('/api/projects/e2e-classroom/sources', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-classroom' },
      body: JSON.stringify({ kind: 'text', idempotencyKey: crypto.randomUUID(), title: name, text: 'A triangle has three sides. A square has four sides. This is disposable test learning material.' }),
    })
    if (!response.ok) throw new Error(`Cannot create disposable source: ${response.status}`)
    return (await response.json() as { id: string }).id
  }, title)
  try {
    await browser.reload()
    await screen.getByRole('tab', '我的资料').tap()
    await expect(screen.getByRole('row').filter({ hasText: title })).toContainText('可查看', { timeout: 120_000 })
    await screen.getByRole('button', `查看资料：${title}`).tap()
    await expect(screen.getByRole('dialog', title)).toContainText('A triangle has three sides.')
    await browser.keyboard.press('Escape')
    await screen.getByRole('button', `资料操作：${title}`).tap()
    await screen.getByRole('menuitem', '重命名').tap()
    await screen.getByRole('dialog', '重命名资料').getByLabel('名称').fill(`${title} renamed`)
    await screen.getByRole('dialog', '重命名资料').getByRole('button', '保存').tap()
    await expect(screen.getByRole('row').filter({ hasText: `${title} renamed` })).toBeVisible()
    await browser.reload()
    await screen.getByRole('tab', '我的资料').tap()
    await expect(screen.getByRole('row').filter({ hasText: `${title} renamed` })).toBeVisible()
  } finally {
    expect(await browser.evaluate(async (id) => (await fetch(`/api/projects/e2e-classroom/sources/${id}`, {
      method: 'DELETE', headers: { 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-classroom' },
    })).status, sourceId)).toBe(200)
  }
})
