import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { command, snapshot } from './data'

// Local synthetic HTTP fixture + actual product provider/composer; never touches real accounts.
test('scoped draft text and uploaded references survive reload without leaking across account/course/thread', async ({ app, browser, screen }) => {
  await command('reset', { snapshot: snapshot([{ type: 'text', text: '合成学习任务' }]) })
  await app.open('/e2e/questionnaire.html?mode=waiting')
  await browser.evaluate(() => {
    const key = `lingxiloop.chat.drafts.v2:${JSON.stringify(['fixture-company', 'fixture-human'])}`
    localStorage.setItem(key, JSON.stringify({ [JSON.stringify(['composer', 'fixture-project', 'answer-first-room', null])]: {
      text: '我的网络划分思路', attachments: [{ id: 'attachments/fixture-company/topology.txt', name: 'topology.txt', contentType: 'text/plain' }], savedAt: Date.now(),
    } }))
    return true
  })
  await app.open('/e2e/answer-first.html')
  const input = browser.locator('[contenteditable="true"]')
  await expect(input).toHaveText('我的网络划分思路')
  await expect(screen.getByText('topology.txt', { exact: true })).toBeVisible()
  await input.fill('我将重新核对边界条件')
  await browser.reload()
  await expect(input).toHaveText('我将重新核对边界条件')
  await expect(screen.getByText('topology.txt', { exact: true })).toBeVisible()
  for (const scope of ['draftUser=other-student', 'draftProject=other-course', 'draftThread=other-thread']) {
    await app.open(`/e2e/answer-first.html?${scope}`)
    await expect(input).toHaveText('')
    await expect(screen.getByText('topology.txt', { exact: true })).toHaveCount(0)
  }
  await app.open('/e2e/answer-first.html')
  await expect(input).toHaveText('我将重新核对边界条件')
  await expect(screen.getByText('topology.txt', { exact: true })).toBeVisible()
  await app.screenshot('373-scoped-draft-restored')
})

test('incomplete questionnaire survives reload and the server receipt replaces the draft', async ({ app, browser, screen }) => {
  await app.open('/e2e/questionnaire.html?mode=waiting')
  await screen.getByLabel('学习目标').fill('先独立完成网络划分')
  await browser.reload()
  await expect(screen.getByLabel('学习目标')).toHaveValue('先独立完成网络划分')
  await expect(browser.locator('[data-posts]')).toHaveAttribute('data-posts', '0')
  await screen.getByRole('button', '提交', { exact: true }).tap()
  await expect(screen.getByText('已提交', { exact: true })).toBeVisible()
  await browser.reload()
  await expect(screen.getByLabel('学习目标')).toHaveValue('先独立完成网络划分')
  await expect(screen.getByLabel('学习目标')).toBeDisabled()
  await expect(browser.locator('[data-posts]')).toHaveAttribute('data-posts', '1')
  await app.screenshot('373-questionnaire-server-receipt')
})

test('approval public context distinguishes unknown and failed effects from successful execution', async ({ app, screen }) => {
  for (const [status, label] of [['PENDING', '需要你的审批'], ['APPROVED', '已批准 · 等待执行'], ['UNKNOWN', '结果待核对 · 请先刷新进度，避免重复执行'], ['FAILED', '执行失败'], ['EXECUTED', '执行成功']]) {
    await command('reset', { snapshot: snapshot([], { status: { type: 'requires-action', reason: 'tool-calls' },
      view: { lifecycle: 'waiting', goalOutcome: { status: 'awaiting_approval', approvalId: 'approval-fixture' } } }),
      approval: { status, context: [{ label: '文档', value: '合成网络方案' }, { label: '具体变化', value: '删除这份文档' }] } })
    await app.open('/e2e/answer-first.html')
    await expect(screen.getByText('合成网络方案', { exact: true })).toBeVisible()
    await expect(screen.getByText(label, { exact: true })).toBeVisible()
    await expect(screen.getByRole('button', '批准并继续', { exact: true })).toHaveCount(status === 'PENDING' ? 1 : 0)
  }
  await app.screenshot('373-approval-execution-receipt')
})
