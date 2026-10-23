import { readFileSync } from 'node:fs'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import type { AgentRunSnapshot } from '../../src/lib/agentRunSnapshot'
import { command } from './data'

// Sanitized fixture emitted by the real server RunStreamProjection before
// implementation; the ordinary transport decoder, store and UI own rendering.
const fixtures = () => JSON.parse(readFileSync(process.env.ISSUE341_SNAPSHOTS ?? '.e2e/issue341-snapshots.json', 'utf8')) as
  Record<string, AgentRunSnapshot> & { page: unknown }

test('answer replacement has a collapsed audit transcript while real commentary and failure remain visible after reconnect', async ({ app, browser, screen }) => {
  const frames = fixtures()
  await command('reset', { snapshot: frames.first, pages: { 0: frames.page } })
  await app.open('/e2e/answer-first.html')
  const body = browser.locator('[data-message-region="body"]')
  const text = '合成答复：交换机转发网络帧。'
  await expect(body).toHaveText(text)
  await command('publish', frames.replaced)
  await expect(body).toHaveText(text)
  await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button').tap()
  const revision = browser.locator('[data-slot="answer-revision"]')
  await expect(revision).toHaveCount(1)
  await expect(browser.locator('[data-slot="answer-revision"] summary')).toHaveText('已替换的答复草稿')
  await expect(browser.locator('[data-slot="answer-revision"] .im-markdown')).not.toBeVisible()
  await expect(screen.getByText('正在核对公开资料。', { exact: true })).toBeVisible()
  await expect(browser.locator('[data-message-region="attention"]')).toContainText('这一步未完成')
  await browser.locator('[data-slot="answer-revision"] summary').press('Enter')
  await expect(browser.locator('[data-slot="answer-revision"] .im-markdown')).toBeVisible()
  await browser.locator('[data-slot="answer-revision"] summary').press('Enter')
  await app.screenshot('answer-revision-collapsed-with-real-failure')
  for (const stage of ['pending', 'committed', 'replay']) {
    await command('publish', frames[stage])
    await expect(body).toHaveText(text)
  }
  await screen.getByRole('button', '加载更多过程').tap()
  await expect(revision).toHaveCount(2)
  await expect(browser.locator('[data-slot="answer-revision"] .im-markdown').first()).not.toBeVisible()
  await expect(browser.locator('[data-slot="answer-revision"] .im-markdown').last()).not.toBeVisible()
  await expect(screen.getByText('正在核对公开资料。', { exact: true })).toBeVisible()
  await browser.reload()
  await expect(body).toHaveText(text)
  await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button').tap()
  await expect(revision).toHaveCount(2)
  await expect(browser.locator('[data-slot="answer-revision"] .im-markdown').first()).not.toBeVisible()
  await expect(browser.locator('[data-slot="answer-revision"] .im-markdown').last()).not.toBeVisible()
  await expect(browser.locator('[data-message-region="attention"]')).toContainText('这一步未完成')
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await app.screenshot('answer-revision-committed-reconnect')
})

test('same answer text in distinct messages remains visible in each message', async ({ app, browser }) => {
  const frames = fixtures()
  // This fixture uses two distinct run/message identities. No text comparison
  // enters the production projection or store.
  await command('reset', { snapshot: frames.first })
  await app.open('/e2e/answer-first.html')
  const second = { ...frames.first, message: { ...frames.first.message, id: 'run-second' } }
  second.message.metadata.custom.runId = 'second'
  Object.assign(second.message.metadata.custom.harness as object, { runId: 'second' })
  await browser.evaluate(async (snapshot) => {
    const storePath = '/src/features/chat/runtime/store.ts'
    const updatesPath = '/src/features/chat/runtime/run-updates.ts'
    const { useChatThreadStore } = await import(storePath)
    const { applyRunSnapshot } = await import(updatesPath)
    const target = { conversationId: 'answer-first-room', agentId: 'answer-first-agent', runId: 'second' }
    useChatThreadStore.setState((state: { conversations: Record<string, unknown> }) => ({ conversations: { ...state.conversations,
      [target.conversationId]: applyRunSnapshot(state.conversations[target.conversationId], target, snapshot) } }))
    return true
  }, JSON.parse(JSON.stringify(second)))
  await expect(browser.locator('[data-message-region="body"]')).toHaveCount(2)
  await expect(browser.locator('[data-message-region="body"]').first()).toHaveText('合成答复：交换机转发网络帧。')
  await expect(browser.locator('[data-message-region="body"]').last()).toHaveText('合成答复：交换机转发网络帧。')
  await app.screenshot('answer-revision-same-text-distinct-messages')
})
