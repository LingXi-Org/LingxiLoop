import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { canonicalMessageMentions } from '../server/src/mentions'
import { createNativeMessage, deserializeMessage } from '../src/lib/nativeMessage'
import { MarkdownText } from '../src/components/assistant-ui/markdown-text'
import { NativeMessageContent } from '../src/features/chat/components/NativeMessageContent'
import { Button } from '../src/components/ui/button'
import type { Participant } from '../src/types'
import '../src/styles/globals.css'

const roster: Participant[] = ['nova', 'sage', 'milo', 'trace', 'scout', 'forge'].map(id => ({
  id, name: id, kind: 'agent', presetKey: id, initial: '助', avatarBg: '#1084fe', status: 'avail',
}))
const texts = ['🙂第一段：@nova。\n\n', '| 成员 | 分工 |\n| --- | --- |\n| @sage | 解释 |\n| @milo | 核对 |\n\n',
  '第三段：@trace、@scout、@forge。中文紧邻@明理检查；未知@unknown保持原文。']
let offset = 0
const source = createNativeMessage({ id: 'synthetic-mentions', role: 'assistant', content: texts.map((text, index) => {
  const part = { type: 'text' as const, text, providerMetadata: { lingxiloop: { answerSegment: {
    version: 3, messageId: 'synthetic-answer', segmentId: `segment-${index}`, partId: `part-${index}`, start: offset, end: offset + text.length,
  } } } }
  offset += text.length
  return part
}) })
function Text() { return <MarkdownText agent mentionTargets={roster} /> }
function Message() { return <MessagePrimitive.Root className="rounded-xl border bg-card p-5"><NativeMessageContent Text={Text} /></MessagePrimitive.Root> }
function Preview() {
  const [message, setMessage] = useState(source), [stage, setStage] = useState('公开片段')
  const runtime = useExternalStoreRuntime({ messages: [deserializeMessage(message)], isRunning: false, onNew: async () => {} })
  return <main className="mx-auto max-w-3xl space-y-5 p-5">
    <h1 className="text-xl font-semibold">多段提及回归</h1>
    <p className="text-sm text-muted-foreground">仅合成用户与消息。核对两次转换和历史读回后的正文与提及。</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => { setMessage(canonicalMessageMentions(message, roster)); setStage('已准入') }}>执行准入</Button>
      <Button onClick={() => { setMessage(JSON.parse(JSON.stringify(message))); setStage('历史读回') }}>读取历史</Button>
    </div>
    <p role="status">{stage}</p>
    <AssistantRuntimeProvider runtime={runtime}><ThreadPrimitive.Root><ThreadPrimitive.Viewport>
      <ThreadPrimitive.Messages components={{ Message }} />
    </ThreadPrimitive.Viewport></ThreadPrimitive.Root></AssistantRuntimeProvider>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
