import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantRuntimeProvider, useExternalStoreRuntime, ThreadPrimitive, MessagePrimitive, type ThreadMessage } from '@assistant-ui/react'
import { MarkdownText } from './markdown-text'

function Text() { return <MarkdownText segmented /> }
function Message() { return <MessagePrimitive.Parts components={{ Text }} /> }
function Preview({ text, running }: { text: string; running: boolean }) {
  const messages: ThreadMessage[] = [{ id: 'reply', role: 'assistant', createdAt: new Date(0),
    content: [{ type: 'text', text }], status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
    metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], custom: {} } }]
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, onNew: async () => {} })
  return <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Messages components={{ AssistantMessage: Message, UserMessage: Message }} /></AssistantRuntimeProvider>
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
