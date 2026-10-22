import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { annotation, command, commentary, origin, snapshot } from './data'

// Supported synthetic native message shape. This does not claim that production
// currently emits it, or that #183 has regressed in production.
test('native interrupt and awaiting_input have one actionable continuation', async ({ app, browser, screen }) => {
  await app.open('/e2e/questionnaire.html?mode=native-unbound')
  await expect(screen.getByRole('textbox', '补充信息', { exact: true })).toHaveCount(1)
  await expect(screen.getByRole('textbox', '补充信息', { exact: true })).toBeVisible()
  await screen.getByRole('textbox', '补充信息', { exact: true }).fill('合成补充答案')
  await browser.evaluate(() => {
    const submit = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === '提交')!
    submit.click(); submit.click()
    return true
  })
  await expect(browser.locator('[data-native-resumes]')).toHaveAttribute('data-native-resumes', '1')
  await expect(browser.locator('[data-native-sends]')).toHaveAttribute('data-native-sends', '1')
  await expect(screen.getByRole('textbox', '补充信息', { exact: true })).toBeDisabled()
  await app.screenshot('native-unbound-single-attention')
})

test('current approval has one external action and replay cannot submit it again', async ({ app, browser, screen }) => {
  const approval = { type: 'tool-call' as const, toolCallId: 'approval-tool', toolName: 'fixture.export', args: {}, argsText: '{}', approval: { id: 'approval-fixture' }, ...annotation('approval-tool', 'attention') }
  const current = snapshot([commentary(1), approval], { status: { type: 'requires-action', reason: 'tool-calls' }, view: { lifecycle: 'waiting', goalOutcome: { status: 'awaiting_approval', approvalId: 'approval-fixture' } } })
  await command('reset', { snapshot: current })
  await app.open('/e2e/answer-first.html')
  await expect(screen.getByRole('button', '批准并继续', { exact: true })).toHaveCount(1)
  await expect(browser.locator('[data-message-region="attention"]').getByRole('button', '批准并继续', { exact: true })).toBeVisible()
  await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button').tap()
  await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button').tap()
  expect((await (await fetch(`${origin}/__fixture/stats`)).json()).approvalPosts).toBe(0)
  await browser.evaluate(() => { const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.includes('批准并继续'))!; button.click(); button.click(); return true })
  await expect(screen.getByRole('button', '批准并继续', { exact: true })).toBeDisabled()
  expect((await (await fetch(`${origin}/__fixture/stats`)).json()).approvalPosts).toBe(1)
  await command('publish', snapshot([commentary(1), { ...approval, approval: { id: 'approval-fixture', approved: true }, result: { status: 'completed' } }], {
    seq: 101, status: { type: 'complete', reason: 'stop' }, view: { lifecycle: 'succeeded', goalOutcome: { status: 'satisfied' } },
  }))
  await expect(screen.getByRole('button', '批准并继续', { exact: true })).toHaveCount(0)
  await browser.reload()
  await expect(screen.getByRole('button', '批准并继续', { exact: true })).toHaveCount(0)
  expect((await (await fetch(`${origin}/__fixture/stats`)).json()).approvalPosts).toBe(1)
  await app.screenshot('answer-first-approval-single-receipt')
})
