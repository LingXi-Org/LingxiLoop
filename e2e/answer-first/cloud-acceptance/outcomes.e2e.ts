import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { annotation, command, commentary, snapshot } from '../data'

test('failed cancelled and incomplete runs retain body and honest process status', async ({ app, browser, screen }) => {
  for (const [reason, state, label, lifecycle] of [
    ['error', 'error', '处理失败', 'failed'],
    ['cancelled', 'cancelled', '已取消', 'cancelled'],
    ['other', 'incomplete', '未完成', 'succeeded'],
  ] as const) {
    await command('reset', { snapshot: snapshot([commentary(1), { type: 'text', text: '已形成的部分答复仍然可读。', ...annotation('retained-answer', 'answer') }],
      { status: { type: 'incomplete', reason }, view: { lifecycle } }) })
    await app.open('/e2e/answer-first.html')
    await expect(browser.locator('[data-slot="run-activity"]')).toHaveAttribute('data-status', state)
    await expect(browser.locator('[data-message-region="body"]')).toContainText('已形成的部分答复仍然可读。')
    const disclosure = browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button')
    await expect(disclosure).toContainText(label)
    await disclosure.focus(); await disclosure.press('Enter')
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    await expect(screen.getByText('已形成的部分答复仍然可读。', { exact: true })).toBeVisible()
    await app.screenshot(`answer-first-outcome-${state}`)
  }
})

test('partial and blocked delivered artifacts remain visible without being called complete or empty', async ({ app, browser, screen }) => {
  for (const outcome of ['partial', 'blocked'] as const) {
    await command('reset', { snapshot: snapshot([commentary(1), { type: 'data', name: 'presentation-artifact',
      data: { artifactId: 'deck-304', artifactKind: 'lecture_deck_html', title: '已交付的演示稿' } }],
    { status: { type: 'incomplete', reason: 'other' }, view: { lifecycle: 'succeeded', goalOutcome: { status: outcome, requestVersion: 1 } } }) })
    await app.open('/e2e/answer-first.html')
    await expect(browser.locator('[data-slot="run-activity"]')).toHaveAttribute('data-status', 'incomplete')
    await expect(screen.getByText('已交付的演示稿', { exact: true })).toBeVisible()
    await expect(screen.getByText('本次请求未能生成答复，请补充信息后重试。', { exact: true })).toHaveCount(0)
    await browser.reload()
    await expect(screen.getByText('已交付的演示稿', { exact: true })).toBeVisible()
    await app.screenshot(`answer-first-delivered-${outcome}`)
  }
})

test('approval without control stays discoverable and non-actionable across disclosure and reload', async ({ app, browser, screen }) => {
  await command('reset', { snapshot: snapshot([commentary(1), { type: 'text', text: '答复正文仍可阅读。', ...annotation('approval-answer', 'answer') }],
    { status: { type: 'requires-action', reason: 'tool-calls' }, custom: { harnessControl: false },
      view: { lifecycle: 'waiting', goalOutcome: { status: 'awaiting_approval', approvalId: 'approval-fixture' } } }) })
  await app.open('/e2e/answer-first.html')
  const notice = screen.getByText('等待有权限的成员审批。', { exact: true })
  await expect(notice).toBeVisible()
  await expect(browser.locator('[data-slot="run-activity"]')).not.toContainText('等待有权限的成员审批。')
  await expect(screen.getByRole('button', '批准并继续', { exact: true })).toHaveCount(0)
  const disclosure = browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button')
  await disclosure.focus(); await disclosure.press('Enter')
  await disclosure.press('Enter')
  await expect(notice).toBeVisible()
  await browser.reload()
  await expect(notice).toBeVisible()
  await expect(screen.getByRole('button', '批准并继续', { exact: true })).toHaveCount(0)
  await app.screenshot('answer-first-approval-no-control')
})
