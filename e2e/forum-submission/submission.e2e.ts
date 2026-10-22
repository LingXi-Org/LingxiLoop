import { fileURLToPath } from 'node:url'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('missing reference explains the blocker without submitting', async ({ app, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=missing')
  await expect(screen.getByLabel('作业内容', { exact: true })).toContainText('两个三角形拼成长方形。')
  await expect(screen.getByRole('button', '提交作业', { exact: true })).toBeDisabled()
  await expect(screen.getByText('请先选择学习对话，并勾选至少一段本人作答和助手回复。', { exact: true })).toBeVisible()
  await expect(screen.getByLabel('提交证据')).toContainText('"submissions":[]')
  await app.screenshot('missing-reference-guidance')
})

test('history loading does not disable editing or valid submission', async ({ app, browser, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=history')
  await expect(screen.getByLabel('作业内容', { exact: true })).toBeEnabled()
  await screen.getByRole('combobox', '选择学习对话').tap()
  await screen.getByRole('option', '我的课程对话', { exact: true }).tap()
  await browser.locator('[data-conversation-reference] > summary').tap()
  await screen.getByRole('checkbox', '引用这段对话').check()
  await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByText('作业已提交，正在生成学习评价。', { exact: true })).toBeVisible()
  await expect(screen.getByLabel('提交证据')).toContainText('"channelId":"room"')
  await app.screenshot('history-does-not-lock-submission')
})

for (const scenario of ['rooms-retry', 'messages-retry']) test(`${scenario} recovers without losing the answer`, async ({ app, browser, screen }) => {
  await app.open(`/e2e/forum-submission/index.html?scenario=${scenario}`)
  if (scenario === 'messages-retry') {
    await screen.getByRole('combobox', '选择学习对话').tap()
    await screen.getByRole('option', '我的课程对话', { exact: true }).tap()
  }
  await screen.getByRole('button', scenario === 'rooms-retry' ? '重试对话列表' : '重试读取对话', { exact: true }).tap()
  if (scenario === 'rooms-retry') {
    await screen.getByRole('combobox', '选择学习对话').tap()
    await screen.getByRole('option', '我的课程对话', { exact: true }).tap()
  }
  await browser.locator('[data-conversation-reference] > summary').tap()
  await screen.getByRole('checkbox', '引用这段对话').check()
  await expect(screen.getByLabel('作业内容', { exact: true })).toContainText('两个三角形拼成长方形。')
  await expect(screen.getByRole('button', '提交作业', { exact: true })).toBeEnabled()
  await app.screenshot(scenario)
})

test('submit failure retains content, attachment, reference and retry key', async ({ app, browser, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=submit-retry')
  await screen.getByLabel('附件', { exact: true }).setInputFiles([fileURLToPath(new URL('./answer.txt', import.meta.url))])
  await expect(screen.getByRole('link', 'answer.txt', { exact: true })).toBeVisible()
  await screen.getByRole('combobox', '选择学习对话').tap()
  await screen.getByRole('option', '我的课程对话', { exact: true }).tap()
  await browser.locator('[data-conversation-reference] > summary').tap()
  await screen.getByRole('checkbox', '引用这段对话').check()
  await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByRole('alert')).toHaveText('服务暂时不可用，请稍后再试。')
  await expect(screen.getByLabel('作业内容', { exact: true })).toContainText('两个三角形拼成长方形。')
  await expect(screen.getByRole('link', 'answer.txt', { exact: true })).toBeVisible()
  await expect(screen.getByRole('checkbox', '引用这段对话')).toBeChecked()
  await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByText('作业已提交，正在生成学习评价。', { exact: true })).toBeVisible()
  const evidence = JSON.parse((await screen.getByLabel('提交证据').textContent())!)
  expect(evidence.submissions.length).toBe(2)
  expect(evidence.submissions[0]).toEqual(evidence.submissions[1])
  expect(evidence.submissions[1].attachments[0].key).toBe('company/student/answer.txt')
  await app.screenshot('submission-retry-keeps-evidence')
})

test('upload retry keeps the draft', async ({ app, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=upload')
  await screen.getByLabel('附件', { exact: true }).setInputFiles([fileURLToPath(new URL('./answer.txt', import.meta.url))])
  await screen.getByRole('button', '重试上传', { exact: true }).tap()
  await expect(screen.getByRole('link', 'answer.txt', { exact: true })).toBeVisible()
  await expect(screen.getByLabel('作业内容', { exact: true })).toContainText('两个三角形拼成长方形。')
  await app.screenshot('upload-retry')
})

test('late room list from another course is ignored', async ({ app, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=scope')
  await screen.getByRole('button', '切换课程', { exact: true }).tap()
  await screen.getByRole('button', '返回旧请求', { exact: true }).tap()
  await screen.getByRole('combobox', '选择学习对话').tap()
  await expect(screen.getByRole('option', '新课程对话', { exact: true })).toBeVisible()
  await expect(screen.getByRole('option', '旧课程对话', { exact: true })).toBeHidden()
  await app.screenshot('stale-course-list-rejected')
})

for (const scenario of ['empty', 'incomplete']) test(`${scenario} offers refresh after a real completed turn`, async ({ app, browser, screen }) => {
  await app.open(`/e2e/forum-submission/index.html?scenario=${scenario}`)
  if (scenario === 'incomplete') {
    await screen.getByRole('combobox', '选择学习对话').tap()
    await screen.getByRole('option', '我的课程对话', { exact: true }).tap()
    await expect(screen.getByText('这段对话尚无完整的本人作答和助手回复。请继续学习对话，完成后刷新对话。', { exact: true })).toBeVisible()
  } else {
    await expect(screen.getByText('暂无可引用的课程对话。请从课程总览进入学习对话，完成一轮作答和助手回复后，返回刷新对话列表。', { exact: true })).toBeVisible()
  }
  await expect(screen.getByRole('button', '提交作业', { exact: true })).toBeDisabled()
  await screen.getByRole('button', '模拟完成学习对话', { exact: true }).tap()
  await screen.getByRole('button', scenario === 'empty' ? '刷新对话列表' : '刷新对话', { exact: true }).tap()
  if (scenario === 'empty') {
    await screen.getByRole('combobox', '选择学习对话').tap()
    await screen.getByRole('option', '我的课程对话', { exact: true }).tap()
  }
  await browser.locator('[data-conversation-reference] > summary').tap()
  await screen.getByRole('checkbox', '引用这段对话').check()
  await expect(screen.getByRole('button', '提交作业', { exact: true })).toBeEnabled()
  await app.screenshot(`${scenario}-completed-and-refreshed`)
})

test('fixed homework conversation still loads without the course room list', async ({ app, browser, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=fixed')
  await browser.locator('[data-conversation-reference] > summary').tap()
  await screen.getByRole('checkbox', '引用这段对话').check()
  await expect(screen.getByRole('checkbox', '引用这段对话')).toBeChecked()
  await expect(screen.getByLabel('提交证据')).toContainText('"rooms":0')
  await expect(screen.getByText('已选择 1 段对话（最多 20 段）', { exact: true })).toBeVisible()
  await app.screenshot('fixed-homework-conversation')
})

test('pending upload explains why submission is disabled', async ({ app, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=upload-pending')
  await screen.getByLabel('附件', { exact: true }).setInputFiles([fileURLToPath(new URL('./answer.txt', import.meta.url))])
  await expect(screen.getByText('附件正在上传，请等待上传完成。', { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '提交作业', { exact: true })).toBeDisabled()
  await expect(screen.getByLabel('提交证据')).toContainText('"submissions":[]')
  await screen.getByRole('button', '模拟上传完成', { exact: true }).tap()
  await expect(screen.getByRole('link', 'answer.txt', { exact: true })).toBeVisible()
  await app.screenshot('upload-completed-before-submission')
})

test('entering the course conversation and returning retains the draft', async ({ app, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=navigation')
  await screen.getByLabel('作业内容', { exact: true }).fill('尚未提交的作答需要保留。')
  await screen.getByRole('button', '进入课程对话', { exact: true }).tap()
  await expect(screen.getByText('课程对话已打开', { exact: true })).toBeVisible()
  await screen.getByRole('button', '返回作业', { exact: true }).tap()
  await expect(screen.getByLabel('作业内容', { exact: true })).toContainText('尚未提交的作答需要保留。')
  await expect(screen.getByLabel('提交证据')).toContainText('"submissions":[]')
  await app.screenshot('course-conversation-return-keeps-draft')
})

test('a late accepted submission cannot clear a newly opened draft', async ({ app, browser, screen }) => {
  await app.open('/e2e/forum-submission/index.html?scenario=late-submit')
  await screen.getByRole('combobox', '选择学习对话').tap()
  await screen.getByRole('option', '我的课程对话', { exact: true }).tap()
  await browser.locator('[data-conversation-reference] > summary').tap()
  await screen.getByRole('checkbox', '引用这段对话').check()
  await screen.getByRole('button', '提交作业', { exact: true }).tap()
  await screen.getByRole('button', '离开作业', { exact: true }).tap()
  await screen.getByRole('button', '重开作业', { exact: true }).tap()
  await screen.getByLabel('作业内容', { exact: true }).fill('新的作答不能被旧回执清空。')
  await expect(screen.getByLabel('提交证据')).toContainText('"draft":"新的作答不能被旧回执清空。')
  await screen.getByRole('button', '模拟旧提交成功', { exact: true }).tap()
  await screen.getByRole('button', '离开作业', { exact: true }).tap()
  await screen.getByRole('button', '重开作业', { exact: true }).tap()
  await expect(screen.getByLabel('作业内容', { exact: true })).toContainText('新的作答不能被旧回执清空。')
  await app.screenshot('late-submission-keeps-new-draft')
})
