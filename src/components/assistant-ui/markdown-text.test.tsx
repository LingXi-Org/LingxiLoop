import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, type ThreadMessage } from '@assistant-ui/react'
import { confidenceCopyText, MarkdownText, type MarkdownConfidenceClaim } from './markdown-text'
import { ConfidenceMarker } from './elements/confidence-marker'

function Text() { return <MarkdownText segmented /> }
function Message() { return <MessagePrimitive.Parts components={{ Text }} /> }
function Preview({ text, running, claims, inlineCitations, interrupted = false, animateEntry = false }: { text: string; running: boolean; claims?: MarkdownConfidenceClaim[]; inlineCitations?: boolean; interrupted?: boolean; animateEntry?: boolean }) {
  const messages: ThreadMessage[] = [{ id: 'reply', role: 'assistant', createdAt: new Date(0),
    content: [{ type: 'text', text }], status: running ? { type: 'running' } : interrupted ? { type: 'incomplete', reason: 'cancelled' } : { type: 'complete', reason: 'stop' },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } }]
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, onNew: async () => {} })
  function CitedMessage() { return <MessagePrimitive.Parts components={{ Text: () => <MarkdownText segmented confidenceClaims={claims} inlineCitations={inlineCitations} animateEntry={animateEntry} /> }} /> }
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ AssistantMessage: CitedMessage, UserMessage: Message }} /></AssistantRuntimeProvider>
}

test('the first character and each growing block render before completion', () => {
  for (const [text, liveCount, finalCount] of [
    ['第一段', 0, 1], ['第一段\n\n', 1, 1], ['第一段\n\n第二段 **正在', 1, 2],
    ['第一段\n\n第二段\n\n- 一\n- 二\n\n```js\nconst value = 1\n```\n\n| 项目 | 结果 |\n| --- | --- |\n| 测试 | 正常 |', 3, 4],
  ] as const) {
    for (const inlineCitations of [true, false]) {
      for (const running of [true, false]) {
        const html = renderToStaticMarkup(<Preview text={text} running={running} inlineCitations={inlineCitations} />)
        assert.equal((html.match(/class="im-markdown-bubble"/g) ?? []).length, running ? liveCount : finalCount)
        assert.ok(html.includes(text === '第' ? '第' : '第一段'))
      }
    }
  }
})

test('lists share a bubble with their lead-in without merging subsequent paragraphs', () => {
  for (const lead of ['学习方面', '**学习方面**', '## 学习方面']) {
    for (const list of ['- 一\n- 二', '1. 一\n2. 二']) {
      for (const running of [false, true]) {
        const html = renderToStaticMarkup(<Preview text={`${lead}\n\n${list}\n\n接下来`} running={running} />)
        assert.equal((html.match(/class="im-markdown-bubble"/g) ?? []).length, running ? 1 : 2)
        assert.match(html, /学习方面[\s\S]*<\/(?:p|h2)>\s*<(?:ul|ol)/)
        assert.equal(html.includes('接下来'), !running)
      }
    }
  }
})

test('unfinished structural blocks stay buffered across blank lines and interruption', () => {
  for (const tail of ['- 一\n\n- 二', '> 引用\n>\n> 继续', '```js\nconst x = 1\n\n', '| 表头 |\n| --- |\n| 值 |']) {
    for (const interrupted of [false, true]) {
      const html = renderToStaticMarkup(<Preview text={`已展示\n\n${tail}`} running={!interrupted} interrupted={interrupted} inlineCitations />)
      assert.match(html, /已展示/)
      assert.match(html, /<ul|<blockquote|<table|<pre/)
    }
  }
})

test('history has no entry animation and live arrivals opt in', () => {
  for (const animateEntry of [false, true]) {
    const html = renderToStaticMarkup(<Preview text="完整消息" running={false} animateEntry={animateEntry} />)
    assert.equal(html.includes('data-bubble-enter'), animateEntry)
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
  assert.equal((html.match(/class="im-markdown-bubble"/g) ?? []).length, 4)
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

test('citation excerpts render safe compact Markdown while source titles remain literal', () => {
  const claim = { id: 'first', text: '结论', confidence: 'grounded' as const, basis: 'legacy fallback', evidence: [
    { marker: 'S1', chunkId: 'one', title: '**标题** <img src=x>', truncated: true,
      excerpt: '**重点**\n\n- 列表\n\n> 引用\n\n`inline`\n\n```js\nconst x = 1\n```\n\n| 列 |\n| --- |\n| 值 |\n\n[安全](https://example.com) [危险](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n![图片](https://example.com/track.png)' },
    { marker: 'S2', chunkId: 'two', title: '第二片段', excerpt: '另一个段落。' },
  ] }
  const html = renderToStaticMarkup(<ConfidenceMarker claims={[claim]} hoveredId="first" onHover={() => {}} />)
  for (const pattern of [/<strong>重点<\/strong>/, /<ul>/, /<blockquote>/, /<code>inline<\/code>/,
    /<pre>/, /<table/, /overflow-x-auto/, /href="https:\/\/example.com"/, /\*\*标题\*\* &lt;img src=x&gt;/, /节选/, /第二片段/]) assert.match(html, pattern)
  assert.doesNotMatch(html, /<script|<img|javascript:|legacy fallback/)
  assert.equal((html.match(/<section/g) ?? []).length, 2)
})

test('new citations underline answer wording and consume internal links before Link rendering', () => {
  const text = '开头😀 [**间隔复习**有助于记忆](#cite-S1,S1)。\n\n- [使用 `retrieval` 练习](#cite-S2)\n\n| 内容 |\n| --- |\n| [主动回忆](#cite-S1,S2) |\n\n[未匹配的正文](#cite-S9) 与 [官网](https://example.com)\n\n`[代码](#cite-S1)`'
  const matches = [...text.matchAll(/\[([^\]\n]+)\]\(#cite-(S\d+(?:,S\d+)*)\)/g)]
  const claims = matches.slice(0, 3).map((match, index) => ({ id: `claim:${index}`, text: match[1], confidence: 'grounded' as const,
    basis: '学习指南\n实际检索的原文。', markers: [...new Set(match[2].split(','))], start: match.index, end: match.index + match[0].length }))
  const html = renderToStaticMarkup(<Preview text={text} running={false} claims={claims} inlineCitations />)
  assert.equal((html.match(/data-confidence-id=/g) ?? []).length, 3)
  assert.equal((html.match(/data-streamdown="link"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /data-slot="confidence-basis"|h-32/)
  assert.match(html, /data-streamdown="strong">间隔复习/)
  assert.match(html, /<code[^>]*>retrieval<\/code>/)
  assert.match(html, /<table/)
  assert.match(html, /未匹配的正文/)
  assert.match(html, /\[代码\]\(#cite-S1\)/)
  assert.doesNotMatch(html, /href="#cite|【S\d/)
  const spans = [...html.matchAll(/data-citation-start="(\d+)" data-citation-end="(\d+)"/g)]
    .map(match => { const start = Number(match[1]), end = Number(match[2]); return { start, end, text: /^\[([\s\S]+)\]\(#cite-[^)]*\)$/.exec(text.slice(start, end))![1] } })
  assert.equal(spans.length, 4)
  const copied = confidenceCopyText(text, spans)
  assert.match(copied, /开头😀 \*\*间隔复习\*\*有助于记忆/)
  assert.match(copied, /使用 `retrieval` 练习/)
  assert.equal((copied.match(/#cite-/g) ?? []).length, 1)
})

test('new drafts show only body text and never activate citation navigation or stale confidence', () => {
  for (const running of [true, false]) {
    const html = renderToStaticMarkup(<Preview text={'[间隔复习](#cite-S1) [【S2】](#cite-S2) [**【S2】**](#cite-S2)\n\n第二段'} running={running} inlineCitations />)
    assert.match(html, /间隔复习/)
    assert.ok(html.includes('第二段'))
    assert.doesNotMatch(html, /data-streamdown="link"|data-confidence-id|confidence-basis|【S2】/)
    assert.equal((html.match(/class="im-markdown-bubble"/g) ?? []).length, 2)
  }
  const claims = [{ id: 'source', text: '间隔复习', confidence: 'grounded' as const, basis: '来源标题\n原文第一段。\n<script>只是原文</script>' }]
  const html = renderToStaticMarkup(<ConfidenceMarker claims={claims} hoveredId="source" onHover={() => {}} />)
  assert.match(html, /原文第一段。/)
  assert.match(html, /&lt;script&gt;只是原文&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>/)
})

test('cached Markdown processors keep each message and regenerated claim identity separate', () => {
  const text = '[间隔复习有助记忆](#cite-S1)'
  for (const id of ['message-a', 'message-b', 'message-a-retry']) {
    const claim = { id, text: '间隔复习有助记忆', confidence: 'grounded' as const, basis: `原文 ${id}`, markers: ['S1'], start: 0, end: text.length }
    const html = renderToStaticMarkup(<Preview text={text} running={false} claims={[claim]} inlineCitations />)
    assert.deepEqual([...html.matchAll(/data-confidence-id="([^"]+)"/g)].map(match => match[1]), [id])
    assert.doesNotMatch(html, /data-streamdown="link"/)
  }
})
