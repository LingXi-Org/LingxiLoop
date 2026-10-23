import { readFileSync } from 'node:fs'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import type { AgentRunSnapshot } from '../../src/lib/agentRunSnapshot'
import { command } from './data'

// The JSON is emitted by server/src/__tests__/answer-first-projection.test.ts.
// It contains synthetic publicText v2 events consumed by the real product
// projection/AssistantTransport, never manually preordered answer snapshots.
const fixtures = () => {
  return JSON.parse(readFileSync(process.env.ISSUE304_SNAPSHOTS ?? 'e2e/answer-first/projection-snapshots.json', 'utf8')) as Record<string, AgentRunSnapshot>
}

test('real v2 first character, pending acceptance and final handoff preserve answer DOM and selection', async ({ app, browser }) => {
  const frames = fixtures()
  await command('reset', { snapshot: frames.firstAnswer })
  await app.open('/e2e/answer-first.html')
  const body = browser.locator('[data-message-region="body"]')
  await expect(body).toHaveText('交')
  await expect(browser.locator('[data-slot="run-activity"]')).toHaveCount(1)
  await command('publish', frames.liveAnswer)
  await expect(body).toHaveText('交换机按处理的网络层区分。')
  await browser.evaluate(() => {
    const body = document.querySelector('[data-message-region="body"]')!
    const markdown = body.querySelector('.im-markdown')!
    const walker = document.createTreeWalker(markdown, NodeFilter.SHOW_TEXT)
    const nodes: Node[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent?.length) nodes.push(node)
    const text = nodes[0]!
    let end = text, offset = 3
    for (const node of nodes) { end = node; if (offset <= node.textContent!.length) break; offset -= node.textContent!.length }
    const selection = getSelection()!, range = document.createRange()
    range.setStart(text, 0); range.setEnd(end, offset); selection.removeAllRanges(); selection.addRange(range)
    Object.assign(window, { __answerBody: body, __answerMarkdown: markdown, __answerPart: body.firstElementChild, __answerTop: body.getBoundingClientRect().top })
    return true
  })
  for (const [name, count] of [['acceptedPending', 3], ['accepted', 4]] as const) {
    await command('publish', frames[name])
    await expect(browser.locator('[data-fixture-received]')).toHaveAttribute('data-fixture-received', String(count))
    await expect(body).toHaveText('交换机按处理的网络层区分。')
    const evidence = await browser.evaluate(() => {
      const body = document.querySelector('[data-message-region="body"]')!
      return { body: body === Reflect.get(window, '__answerBody'), part: body.firstElementChild === Reflect.get(window, '__answerPart'),
        markdown: body.querySelector('.im-markdown') === Reflect.get(window, '__answerMarkdown'), selection: getSelection()?.toString() ?? '',
        deltaY: Math.abs(body.getBoundingClientRect().top - Number(Reflect.get(window, '__answerTop'))) }
    })
    expect(evidence).toEqual({ body: true, part: true, markdown: true, selection: '交换机', deltaY: 0 })
  }
  await app.screenshot('answer-first-real-v2-accepted-handoff')
  await command('publish', frames.newRequest)
  await expect(body).toHaveText('新的问题答复。')
  expect(await browser.evaluate(() => document.querySelector('[data-message-region="body"]')?.firstElementChild === Reflect.get(window, '__answerPart'))).toBe(false)
})

test('real superseded candidate leaves the main answer and correction receives a new identity', async ({ app, browser }) => {
  const frames = fixtures()
  await command('reset', { snapshot: frames.liveAnswer })
  await app.open('/e2e/answer-first.html')
  await expect(browser.locator('[data-message-region="body"]')).toHaveText('交换机按处理的网络层区分。')
  await browser.evaluate(() => { Object.assign(window, { __oldPart: document.querySelector('[data-message-region="body"]')?.firstElementChild }); return true })
  await command('publish', frames.correction)
  await expect(browser.locator('[data-message-region="body"]')).toHaveText('二层交换机转发以太网帧。')
  expect(await browser.evaluate(() => Reflect.get(window, '__oldPart') === document.querySelector('[data-message-region="body"]')?.firstElementChild)).toBe(false)
  await expect(browser.locator('[data-message-region="body"]')).not.toContainText('交换机按处理的网络层区分。')
  await browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button').tap()
  await expect(browser.locator('[data-slot="answer-revision"] summary')).toHaveText('已替换的答复草稿')
  await expect(browser.locator('[data-slot="answer-revision"] .im-markdown')).not.toBeVisible()
  await app.screenshot('answer-first-real-v2-corrected-candidate')
})
