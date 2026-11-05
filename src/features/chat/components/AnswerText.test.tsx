import assert from 'node:assert/strict'
import test from 'node:test'
import { useContext } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime, useMessagePartText, type ThreadMessage } from '@assistant-ui/react'
import { TextOffsetContext } from '@/components/assistant-ui/text-offset-context'
import { AnswerText } from './AnswerText'

function Text() {
  const { text } = useMessagePartText()
  const offset = useContext(TextOffsetContext)
  return <span data-source-offset={offset ?? 0}>{text}</span>
}
function Preview({ text, role = 'assistant' }: { text: string; role?: 'assistant' | 'user' }) {
  const base = { id: 'history', createdAt: new Date(0), content: [{ type: 'text' as const, text }],
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: { conversationId: 'room', sourceMessageId: 'source' } } }
  const messages: ThreadMessage[] = [role === 'assistant'
    ? { ...base, role, status: { type: 'complete', reason: 'stop' } }
    : { ...base, role, attachments: [], metadata: { custom: {} } }]
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, onNew: async () => {} })
  const Message = () => <MessagePrimitive.Parts>{part => part.part.type === 'text' ? <AnswerText part={part.part} Text={Text} /> : null}</MessagePrimitive.Parts>
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ Message }} /></AssistantRuntimeProvider>
}

test('history placeholders preserve following text source coordinates without loading the retired view', () => {
  const directive = '::visualize{"path":"/private/old.html"}'
  const text = `前文 ${directive} 后文引用`
  const $ = load(renderToStaticMarkup(<Preview text={text} />))
  assert.equal($('[role="note"]').text(), '此可视化功能已下线。')
  assert.deepEqual($('[data-source-offset]').map((_, element) => [[$(element).attr('data-source-offset'), $(element).text()]]).get(), [
    ['0', '前文 '], [String(3 + directive.length), ' 后文引用'],
  ])
  assert.doesNotMatch($.html(), /private|iframe/)
  assert.equal($('button').text(), '下载历史内容')
})

test('user text and code examples retain their literal archived content', () => {
  const text = '::visualize{"path":"example.html"}'
  assert.equal(load(renderToStaticMarkup(<Preview text={text} role="user" />))('[role="note"]').length, 0)
  assert.equal(load(renderToStaticMarkup(<Preview text={`\`${text}\``} />))('[role="note"]').length, 0)
})
