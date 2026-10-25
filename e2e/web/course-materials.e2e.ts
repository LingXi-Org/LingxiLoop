import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'
import { memberSession, mutationPermission, testName } from './support'

const destination = '/?project=e2e-classroom&view=course-materials'
async function clearFixtureFiles(browser: import('@e2e-dev/web').Browser) {
  await browser.evaluate(async () => {
    const headers = { 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-classroom' }
    const response = await fetch('/api/projects/e2e-classroom/sources', { headers })
    if (!response.ok) throw new Error(`list disposable fixtures ${response.status}`)
    const sources = await response.json() as { id: string; title: string; capabilities?: { canDelete: boolean } }[]
    for (const source of sources) if (/^triangle\.(pdf|docx|pptx|xlsx|md|png|zip)$/.test(source.title) && source.capabilities?.canDelete) {
      const deleted = await fetch(`/api/projects/e2e-classroom/sources/${source.id}`, { method: 'DELETE', headers })
      if (!deleted.ok) throw new Error(`delete disposable fixture ${deleted.status}`)
    }
    return null
  })
}
const enabled = process.env.E2E_COURSE_MATERIALS === '1' ? {} : { skip: 'Set E2E_COURSE_MATERIALS=1 with disposable real API and object storage.' }

test('teacher uploads public original files with real storage and preserves the public course view', {
  ...memberSession(), ...mutationPermission, ...enabled, tags: ['web', 'course-materials', 'mutations'], timeout: 180_000,
}, async ({ app, screen, browser }) => {
  await app.open(destination)
  await clearFixtureFiles(browser)
  await browser.reload()
  await expect(screen.getByRole('heading', '课程资料', { level: 1 })).toBeVisible()
  await expect(screen.getByText('教师上传 · 课程成员可见')).toBeVisible()
  await expect(screen.getByRole('button', '上传到公共资料').first()).toBeVisible()
  await screen.getByLabel('上传课程资料文件').setInputFiles(['e2e/fixtures/course-materials/triangle.pptx', 'e2e/fixtures/course-materials/triangle.xlsx'])
  for (const name of ['triangle.pptx', 'triangle.xlsx']) {
    await expect(screen.getByRole('row').filter({ hasText: name })).toContainText('仅保存原文件', { timeout: 45_000 })
  }
  await browser.reload()
  await expect(screen.getByRole('row').filter({ hasText: 'triangle.pptx' })).toBeVisible()
  await screen.getByRole('tab', '我的资料').tap()
  await expect(screen.getByRole('button', '上传到我的资料')).toBeHidden()
  await expect(screen.getByRole('row').filter({ hasText: 'triangle.pptx' })).toHaveCount(0)
})

test('student public view is read-only and navigation refresh reaches the same page', {
  ...memberSession('student'), ...enabled, tags: ['web', 'course-materials', 'authorization'],
}, async ({ app, screen, browser }) => {
  await app.open('/?project=e2e-classroom')
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '课程资料', { exact: true }).tap()
  await expect(screen.getByRole('heading', '课程资料', { level: 1 })).toBeVisible()
  await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).get('view'))).toBe('course-materials')
  await expect(screen.getByRole('button', '上传到公共资料')).toBeHidden()
  await browser.reload()
  await expect(browser.locator('[data-course-materials]')).toBeVisible()
})

test('student files upload, refresh, download intact, filter, rename and delete through the new table', {
  ...memberSession('student'), ...mutationPermission, ...enabled, tags: ['web', 'course-materials', 'mutations'], timeout: 240_000,
}, async ({ app, screen, browser }) => {
  await app.open(destination)
  await screen.getByRole('tab', '我的资料').tap()
  await clearFixtureFiles(browser)
  await browser.reload()
  await screen.getByRole('tab', '我的资料').tap()
  const names = ['triangle.pdf', 'triangle.docx', 'triangle.pptx', 'triangle.xlsx', 'triangle.md', 'triangle.png', 'triangle.zip']
  await screen.getByLabel('上传课程资料文件').setInputFiles(names.map(name => `e2e/fixtures/course-materials/${name}`))
  await expect(screen.getByRole('status').filter({ hasText: /^已保存$/ })).toHaveCount(names.length, { timeout: 60_000 })
  for (const name of names) await expect(screen.getByRole('row').filter({ hasText: name })).toBeVisible({ timeout: 45_000 })
  await browser.reload()
  await screen.getByRole('tab', '我的资料').tap()
  for (const name of names) {
    await expect(screen.getByRole('row').filter({ hasText: name })).toBeVisible()
    await screen.getByRole('button', `资料操作：${name}`).tap()
    const download = await browser.waitForDownload(() => screen.getByRole('menuitem', '下载原文件').tap())
    expect(download.suggestedFilename).toBe(name) // run.mjs checks saved artifact bytes against the original fixture.
  }
  await screen.getByLabel('搜索课程资料').fill('triangle.')
  await screen.getByRole('button', '筛选与排序').tap()
  await screen.getByRole('menuitemradio', '名称：A–Z').tap()
  expect(await browser.evaluate(() => Array.from(document.querySelectorAll('tbody button[aria-label^="查看资料："]')).map(node => node.textContent?.trim() ?? ''))).toEqual([...names].sort())
  await screen.getByLabel('搜索课程资料').fill('')
  await expect(screen.getByRole('row').filter({ hasText: 'triangle.zip' })).toContainText('仅保存原文件')
  await screen.getByLabel('搜索课程资料').fill('triangle.zip')
  await expect(screen.getByRole('row').filter({ hasText: 'triangle.png' })).toHaveCount(0)
  await screen.getByLabel('搜索课程资料').fill('')
  await screen.getByRole('combobox', '资料格式').tap()
  await screen.getByRole('option', '图片', { exact: true }).tap()
  await expect(screen.getByRole('row').filter({ hasText: 'triangle.png' })).toBeVisible()
  await expect(screen.getByRole('row').filter({ hasText: 'triangle.zip' })).toHaveCount(0)
  await screen.getByRole('combobox', '资料格式').tap()
  await screen.getByRole('option', '全部格式').tap()
  const renamed = `${testName('renamed')}.png`
  await screen.getByRole('button', '资料操作：triangle.png').tap()
  await screen.getByRole('menuitem', '重命名').tap()
  await screen.getByRole('dialog', '重命名资料').getByLabel('名称').fill(renamed)
  await screen.getByRole('dialog', '重命名资料').getByRole('button', '保存').tap()
  await expect(screen.getByRole('row').filter({ hasText: renamed })).toBeVisible()
  await browser.reload()
  await screen.getByRole('tab', '我的资料').tap()
  await screen.getByRole('button', `资料操作：${renamed}`).tap()
  await screen.getByRole('menuitem', '删除资料').tap()
  await screen.getByRole('alertdialog').getByRole('button', '删除资料', { exact: true }).tap()
  await expect(screen.getByRole('row').filter({ hasText: renamed })).toHaveCount(0)
  await screen.getByRole('tab', '公共资料').tap()
  await expect(screen.getByRole('row').filter({ hasText: 'triangle.zip' })).toHaveCount(0)
})

// A fresh login avoids revoking any of the runner's saved actor sessions.
for (const otherRole of ['member', 'student2'] as const) test(`${otherRole} cannot list, read, download or mutate a student private file`, {
  skip: memberSession('student').skip || memberSession().skip || mutationPermission.skip || enabled.skip,
  tags: ['web', 'course-materials', 'authorization', 'mutations'], timeout: 180_000,
}, async ({ app, screen, browser }) => {
  const login = async (role: 'student' | 'member' | 'student2') => {
    // Respect Better Auth's normal 3 sign-ins / 10-second window across actors.
    await new Promise(resolve => setTimeout(resolve, 11_000))
    await app.open(destination)
    await screen.getByLabel('邮箱').fill(credentials.user(role).username)
    await screen.getByLabel('密码').fill(credentials.user(role).password)
    await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 45_000 })
    await screen.getByRole('button', '登录').tap()
    await expect(screen.getByRole('heading', '课程资料', { level: 1 })).toBeVisible({ timeout: 45_000 })
  }
  await login('student')
  await screen.getByRole('tab', '我的资料').tap()
  const title = `${testName('private isolation')}.zip`
  // Ordinary authenticated project API creates a uniquely named original file; no fixture responses or stores are injected.
  const source = await browser.evaluate(async (name) => {
    const headers = { 'content-type': 'application/json', 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-classroom' }
    const response = await fetch('/api/projects/e2e-classroom/sources/upload/presign', { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), name, mime: 'application/zip', size: 22 }) })
    if (!response.ok) throw new Error(`presign ${response.status}`)
    const signed = await response.json() as { id: string; uploadUrl: string }
    const bytes = new Uint8Array(22); bytes.set([80, 75, 5, 6])
    const uploaded = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'content-type': 'application/zip' }, body: bytes })
    if (!uploaded.ok) throw new Error(`upload ${uploaded.status}`)
    const completed = await fetch(`/api/projects/e2e-classroom/sources/${signed.id}/complete-upload`, { method: 'POST', headers })
    if (!completed.ok) throw new Error(`complete ${completed.status}`)
    const detail = await fetch(`/api/projects/e2e-classroom/sources/${signed.id}`, { headers }).then(r => r.json()) as { originalFileUrl: string }
    return { id: signed.id, url: detail.originalFileUrl }
  }, title)
  await browser.reload()
  await screen.getByRole('tab', '我的资料').tap()
  await expect(screen.getByRole('row').filter({ hasText: title })).toBeVisible()
  await screen.getByRole('button', '打开账户菜单').tap()
  await screen.getByRole('menuitem', '退出登录').tap()
  await login(otherRole)
  await screen.getByRole('tab', '我的资料').tap()
  await expect(screen.getByRole('row').filter({ hasText: title })).toHaveCount(0)
  const result = await browser.evaluate(async ({ id, url }) => {
    const headers = { 'content-type': 'application/json', 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-classroom' }
    const endpoint = `/api/projects/e2e-classroom/sources/${id}`
    const statuses = []
    for (const method of ['GET', 'PATCH', 'DELETE']) statuses.push((await fetch(endpoint, { method, headers, ...(method === 'PATCH' ? { body: JSON.stringify({ title: 'forbidden' }) } : {}) })).status)
    statuses.push((await fetch(url, { headers })).status)
    return statuses
  }, source)
  for (const status of result) expect([403, 404]).toContain(status)
})
