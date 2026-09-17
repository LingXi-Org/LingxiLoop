import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, type ThreadMessage } from '@assistant-ui/react'
import { confidenceCopyText, MarkdownText, type MarkdownConfidenceClaim } from './markdown-text'
import { ConfidenceMarker } from './elements/confidence-marker'

function Text() { return <MarkdownText segmented /> }
function Message() { return <MessagePrimitive.Parts components={{ Text }} /> }
function Preview({ text, running, claims }: { text: string; running: boolean; claims?: MarkdownConfidenceClaim[] }) {
  const messages: ThreadMessage[] = [{ id: 'reply', role: 'assistant', createdAt: new Date(0),
    content: [{ type: 'text', text }], status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } }]
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, onNew: async () => {} })
  function CitedMessage() { return <MessagePrimitive.Parts components={{ Text: () => <MarkdownText segmented confidenceClaims={claims} /> }} /> }
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ AssistantMessage: claims ? CitedMessage : Message, UserMessage: Message }} /></AssistantRuntimeProvider>
}

test('streamed paragraphs have no blank bubbles and keep their structure when complete', () => {
  for (const [text, count] of [
    ['第一段', 1], ['第一段\n\n第二段 **正在', 2],
    ['第一段\n\n第二段\n\n- 一\n- 二\n\n```js\nconst value = 1\n```\n\n| 项目 | 结果 |\n| --- | --- |\n| 测试 | 正常 |', 5],
  ] as const) {
    for (const running of [true, false]) {
      const html = renderToStaticMarkup(<Preview text={text} running={running} />)
      assert.equal((html.match(/class="im-markdown-bubble"/g) ?? []).length, count)
      assert.ok(html.includes('第一段'))
    }
  }
})

test('committed citations preserve Markdown and normal links, with one shared basis slot', () => {
  const text = '普通文字 [**事实**](#cite-S1) 与 [官网](https://example.com)\n\n- [再次引用](#cite-S1)\n\n| 项目 | 结果 |\n| --- | --- |\n| 资料 | [事实](#cite-S1,S2) |\n\n`[示例](#cite-S1)`\n\n```md\n[代码](#cite-S1)\n```'
  const claims = [...text.matchAll(/\[([^\]\n]+)\]\(#cite-(S\d+(?:,S\d+)*)\)/g)].map((match, index) => ({
    id: `run:result:${index}`, text: match[1], confidence: 'grounded' as const, basis: '真实来源 · 版本 7',
    markers: match[2].split(','), start: match.index, end: match.index + match[0].length,
  }))
  const html = renderToStaticMarkup(<Preview text={text} running={false} claims={claims} />)
  assert.equal((html.match(/data-confidence-id=/g) ?? []).length, 3)
  assert.equal((html.match(/data-slot="confidence-basis"/g) ?? []).length, 1)
  assert.equal((html.match(/class="im-markdown-bubble"/g) ?? []).length, 5)
  assert.match(html, /data-streamdown="strong">事实<\/span>/)
  assert.match(html, /data-streamdown="link"[^>]*>官网<\/button>/)
  assert.match(html, /<ul/)
  assert.match(html, /<table/)
  assert.match(html, /\[示例\]\(#cite-S1\)/)
  assert.match(html, /\[代码\]\(#cite-S1\)/)
  assert.equal(new Set([...html.matchAll(/data-confidence-id="([^"]+)"/g)].map(match => match[1])).size, 3)
  const rendered = new Set([...html.matchAll(/data-confidence-id="([^"]+)"/g)].map(match => match[1]))
  const copied = confidenceCopyText(text, claims.filter(claim => rendered.has(claim.id)))
  assert.match(copied, /普通文字 \*\*事实\*\* 与 \[官网\]\(https:\/\/example.com\)/)
  assert.match(copied, /`\[示例\]\(#cite-S1\)`/)
  assert.match(copied, /```md\n\[代码\]\(#cite-S1\)\n```/)
  assert.doesNotMatch(html, /group-hover\/confidence|引用来源（/)
})

test('only the active occurrence describes its fixed, accessible basis region', () => {
  const claims = ['first', 'second'].map(id => ({ id, text: '同一来源', confidence: 'grounded' as const, basis: 'source · 版本 v1' }))
  for (const hoveredId of ['', 'first', 'second', 'stale']) {
    const html = renderToStaticMarkup(<ConfidenceMarker claims={claims} hoveredId={hoveredId} onHover={() => {}} />)
    const active = hoveredId === 'first' || hoveredId === 'second'
    assert.equal((html.match(/aria-describedby=/g) ?? []).length, active ? 1 : 0)
    assert.equal(html.includes('source · 版本 v1'), active)
    assert.match(html, /data-slot="confidence-basis" class="h-9 w-0 min-w-full overflow-auto/)
    assert.match(html, /motion-reduce:transition-none/)
    if (active) {
      const describedId = html.match(/aria-describedby="([^"]+)"/)![1]
      assert.ok(html.includes(`id="${describedId}" role="status"`))
    }
  }
})

test('copying and quoting strip only supplied citation spans', () => {
  const text = '普通 [事实](#cite-S1) 和 [网页](https://example.com)'
  const start = text.indexOf('[事实]')
  const claims: MarkdownConfidenceClaim[] = [{ id: 'a', text: '事实', confidence: 'grounded', basis: '资料', markers: ['S1'], start, end: start + '[事实](#cite-S1)'.length }]
  assert.equal(confidenceCopyText(text, claims), '普通 事实 和 [网页](https://example.com)')
  assert.equal(confidenceCopyText(text), text)
  const html = renderToStaticMarkup(<Preview text="没有引用" running={false} />)
  assert.doesNotMatch(html, /confidence-basis|data-confidence-id/)
})
