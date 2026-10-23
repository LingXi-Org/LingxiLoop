import { fileURLToPath } from 'node:url'
import { test, type Browser } from '@e2e-dev/web'
import { expect, type App, type Screen } from 'e2e'

// Failure inventory before implementation: an unprovisioned teacher room,
// committed response lost in transit, removed list entry, list-refresh failure,
// duplicate clicks/retry, and a late response after a course/account switch.
// All API writes below target only the disposable forum fixture.
const url = '/?project=e2e-classroom&view=forum'
async function openAs(app: App, browser: Browser, screen: Screen, role = 'teacher') {
  await app.open('/')
  await browser.evaluate(async role => (await fetch(`/api/fixture-role/${role}`)).ok, role)
  await app.open(url)
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({ timeout: 120000 })
}
async function fixture(browser: Browser, path: string) {
  expect(await browser.evaluate(async path => (await fetch(path, { method: 'POST' })).ok, path)).toBe(true)
}
async function snapshot(browser: Browser) {
  return browser.evaluate(async () => fetch('/api/fixture-teacher-entry').then(response => response.json()))
}

test('325 header entry repairs missing and hidden rooms, retries the entry, and preserves body/files', async ({ app, browser, screen }) => {
  await openAs(app, browser, screen)
  const composer = () => screen.getByRole('region', '发布学习论坛内容')
  await composer().getByRole('button', '展开发布框', { exact: true }).tap()
  await composer().getByLabel('内容正文', { exact: true }).fill('Issue325 未发布的正文与附件')
  await composer().getByLabel('附件', { exact: true }).setInputFiles([fileURLToPath(new URL('./submission.txt', import.meta.url))])
  await expect(composer().getByRole('button', '材料 1', { exact: true })).toBeVisible()
  const before = await snapshot(browser)
  expect(before.rooms).toBe(0)
  await fixture(browser, '/api/fixture-teacher-entry/lost')
  await screen.getByRole('button', '发布作业', { exact: true }).tap()
  await expect(screen.getByRole('button', '重试进入作业发布', { exact: true })).toBeVisible()
  expect((await snapshot(browser)).rooms).toBe(1)
  expect((await snapshot(browser)).homeworks).toBe(before.homeworks)
  await expect(composer().getByLabel('内容正文', { exact: true })).toContainText('Issue325 未发布的正文与附件')
  await app.screenshot('325-entry-failure-keeps-draft')
  await screen.getByRole('button', '重试进入作业发布', { exact: true }).tap()
  await expect.poll(() => browser.evaluate(() => new URL(location.href).searchParams.get('conversation'))).toBeTruthy()
  const roomId = await browser.evaluate(() => new URL(location.href).searchParams.get('conversation')!)
  expect((await snapshot(browser)).requests).toBe(2)
  await app.open(url)
  await composer().getByRole('button', '展开发布框', { exact: true }).tap()
  await expect(composer().getByLabel('内容正文', { exact: true })).toContainText('Issue325 未发布的正文与附件')
  await expect(composer().getByRole('button', '材料 1', { exact: true })).toBeVisible()
  expect(await browser.evaluate(async id => (await fetch(`/api/conversations/${id}`, {
    method: 'DELETE', headers: { 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-classroom' },
  })).status, roomId)).toBe(200)
  await screen.getByRole('button', '发布作业', { exact: true }).tap()
  await expect.poll(() => browser.evaluate(() => new URL(location.href).searchParams.get('conversation'))).toBe(roomId)
  await app.open(url)
  await screen.getByRole('link', 'Forum homework', { exact: true }).tap()
  await expect(browser.locator('[data-memo-detail]')).toBeVisible()
  await fixture(browser, '/api/fixture-teacher-entry/fail-list')
  await screen.getByRole('button', '发布作业', { exact: true }).tap()
  await expect(screen.getByRole('button', '重试进入作业发布', { exact: true })).toBeVisible()
  await expect(screen.getByText('相关内容不存在或已不可访问。', { exact: true })).toHaveCount(0)
  await screen.getByRole('button', '重试进入作业发布', { exact: true }).tap()
  await expect.poll(() => browser.evaluate(() => new URL(location.href).searchParams.get('conversation'))).toBe(roomId)
  expect((await snapshot(browser)).rooms).toBe(1)
  expect((await snapshot(browser)).homeworks).toBe(before.homeworks)
  await app.screenshot('325-teacher-room-recovered')
})

test('325 a pending teacher entry cannot navigate after switching course, and students remain denied', async ({ app, browser, screen }) => {
  await openAs(app, browser, screen)
  await fixture(browser, '/api/fixture-teacher-entry/hold')
  const count = (await snapshot(browser)).requests
  await screen.getByRole('button', '发布作业', { exact: true }).tap()
  await expect(screen.getByRole('button', '发布作业', { exact: true })).toBeDisabled()
  await expect.poll(async () => (await snapshot(browser)).requests).toBe(count + 1)
  // Same-document navigation keeps the original request pending.
  await browser.evaluate(() => { history.pushState({}, '', '/?project=forum-other&view=forum'); window.dispatchEvent(new PopStateEvent('popstate')); return true })
  await expect(screen.getByText('Other Forum Course', { exact: true }).first()).toBeVisible()
  await fixture(browser, '/api/fixture-teacher-entry/pass')
  await expect.poll(async () => (await snapshot(browser)).completed).toBe(count + 1)
  expect(await browser.evaluate(() => location.search)).toBe('?project=forum-other&view=forum')
  await openAs(app, browser, screen, 'student')
  await expect(screen.getByRole('button', '发布作业', { exact: true })).toHaveCount(0)
  const denied = await browser.evaluate(async () => (await fetch('/api/courses/e2e-course/teacher-agent', {
    method: 'POST', headers: { 'x-company-id': 'e2e-school' },
  })).status)
  expect(denied).toBe(403)
  await app.screenshot('325-student-has-no-teacher-entry')
})

test('325 actual draft card keeps files on failed publication and retries one homework', async ({ app, browser, screen }) => {
  await openAs(app, browser, screen)
  const draft = await browser.evaluate(async () => fetch('/api/fixture-teacher-homework', { method: 'POST' }).then(response => response.json()))
  await app.open(`/e2e/homework-draft-native.html?id=${draft.homework.id}`)
  await expect(screen.getByLabel('作业要求', { exact: true })).toBeVisible({ timeout: 120000 })
  await screen.getByLabel('作业要求', { exact: true }).fill('Issue325 教师修改后的要求')
  const card = browser.locator('[data-homework-id]')
  await card.getByLabel('附件', { exact: true }).first().setInputFiles([fileURLToPath(new URL('./submission.txt', import.meta.url))])
  await expect(card.getByRole('link', 'submission.txt', { exact: false }).first()).toBeVisible()
  await screen.getByRole('button', '保存修改', { exact: true }).tap()
  await expect(screen.getByRole('button', '保存修改', { exact: true })).toBeDisabled()
  await fixture(browser, `/api/fixture-teacher-homework/${draft.homework.id}/ready`)
  await browser.reload()
  await expect(screen.getByRole('button', '确认发布', { exact: true })).toBeEnabled()
  await fixture(browser, '/api/fixture-teacher-publish/lost')
  await screen.getByRole('button', '确认发布', { exact: true }).tap()
  await expect(screen.getByRole('alert')).toBeVisible()
  await expect(screen.getByLabel('作业要求', { exact: true })).toContainText('Issue325 教师修改后的要求')
  await expect(card.getByRole('link', 'submission.txt', { exact: false }).first()).toBeVisible()
  await screen.getByRole('button', '确认发布', { exact: true }).tap()
  await expect(screen.getByText('已发布', { exact: true })).toBeVisible()
  await app.open(url)
  await expect(screen.getByRole('link', 'Issue325 教师发布回归', { exact: true })).toBeVisible()
  await browser.reload()
  await expect(screen.getByRole('link', 'Issue325 教师发布回归', { exact: true })).toBeVisible()
  await openAs(app, browser, screen, 'student')
  await expect(screen.getByRole('link', 'Issue325 教师发布回归', { exact: true })).toBeVisible()
  expect((await snapshot(browser)).published).toBe(1)
  await app.screenshot('325-student-sees-one-published-homework')
})
