import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime, type TextMessagePartProps, type ThreadMessage } from '@assistant-ui/react'
mock.module('@/api/core/http', { namedExports: { http: () => { throw new Error('no automatic export') } } })
const { AnswerText } = await import('./AnswerText')
const Body = ({ text }: { text: string }) => <pre data-body>{text}</pre>
function TextPart(part: TextMessagePartProps) { return <AnswerText part={part} Text={Body} readOnly={false} /> }
function Message() { return <MessagePrimitive.Content components={{ Text: TextPart }} /> }
function Preview({ text, role = 'assistant', running = false }: { text: string; role?: 'assistant' | 'user'; running?: boolean }) {
  const base = { id: 'original-source', content: [{ type: 'text' as const, text }], createdAt: new Date('2026-11-04T00:00:00Z'),
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: { conversationId: 'room', sourceMessageId: 'source' } } }
  const message: ThreadMessage = role === 'assistant'
    ? { ...base, role, status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' } }
    : { ...base, role, attachments: [], metadata: { custom: base.metadata.custom } }
  const runtime = useExternalStoreRuntime({ messages: [message], isRunning: running, onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message }} /></AssistantRuntimeProvider>
}

test('actual answer rendering retains every original body byte and appends only an inert archive notice', () => {
  const body = '前文\n::visualize{"path":"/work/diagram.html","title":"原始页"}\n后文😀'
  const $ = load(renderToStaticMarkup(<Preview text={body} />))
  assert.equal($('[data-body]').text(), body)
  assert.equal($('aside').length, 1)
  assert.equal($('iframe,script').length, 0)
  assert.equal($('button').text(), '下载历史内容')
})

test('streaming, malformed and user-authored directive text stays visible and never mounts old controls', () => {
  const incomplete = '开头\n::visualize{"path":\n仍要保留的正文'
  const complete = '::visualize{"path":"/work/diagram.html"}'
  for (const props of [{ text: incomplete }, { text: complete, running: true }, { text: complete, role: 'user' as const }]) {
    const $ = load(renderToStaticMarkup(<Preview {...props} />))
    assert.equal($('[data-body]').text(), props.text)
    assert.equal($('aside,iframe,script,button').length, 0)
  }
})
