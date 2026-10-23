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

test('an in-flight older history page cannot resurrect ordinary draft prose after supersession', async ({ app, browser, screen }) => {
  const frames = fixtures()
  const first = JSON.parse(JSON.stringify(frames.first)) as AgentRunSnapshot
  const replaced = JSON.parse(JSON.stringify(frames.replaced)) as AgentRunSnapshot
  // Keep the history capability present throughout the request. The delayed
  // page emulates the previous public projection, which listed the current
  // candidate as commentary under its original public-text identity.
  first.message.metadata.custom.activityHistory = { total: 1, attention: 0 }
  replaced.message.metadata.custom.activityHistory = { total: 3, attention: 1 }
  const staleMessage = JSON.parse(JSON.stringify(first.message))
  const source = staleMessage.content.find((part: { type: string }) => part.type === 'text')
  Object.assign(source.providerMetadata.lingxiloop.activity, { kind: 'commentary', label: '公开说明', purpose: 'process' })
  await command('reset', { snapshot: first, holdPages: true, pages: { 0: { message: staleMessage, total: 1, nextOffset: null } } })
  await app.open('/e2e/answer-first.html')
  await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button').tap()
  await expect(browser.locator('[data-slot="run-activity-history"] button').first()).toHaveText('正在加载…')
  await command('publish', replaced)
  await expect(browser.locator('[data-slot="answer-revision"]')).toHaveCount(1)
  await command('release')
  await expect(browser.locator('[data-slot="run-activity-history"] button').first()).toHaveText('加载更多过程')
  await expect(browser.locator('[data-slot="run-activity"] [data-native-part="text"]')).toHaveCount(2)
  await expect(browser.locator('[data-slot="answer-revision"] .im-markdown')).not.toBeVisible()
  await expect(screen.getByText('正在核对公开资料。', { exact: true })).toBeVisible()
  await expect(browser.locator('[data-message-region="body"]')).toHaveText('合成答复：交换机转发网络帧。')
  await app.screenshot('answer-revision-stale-page-does-not-resurrect-prose')
})
