import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { ThemeProvider, useTheme } from 'next-themes'
import { TooltipProvider } from '/src/components/ui/tooltip'
import { ConversationMessage } from '/src/features/chat/components/ConversationMessage'
import { ConversationComposer } from '/src/features/chat/components/ConversationComposer'
import { convertEnvelope } from '/src/features/chat/runtime/converter'
import { createNativeMessage } from '/src/lib/nativeMessage'
import { conversationsApi } from '/src/features/conversations/api'
import { ContentEditor } from '/src/features/content-editor/ContentEditor'
import { ForumBody } from '/src/features/learning/forum/ForumBody'
import { useParticipants } from '/src/features/agents/state'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CaseCodeBlock } from '/src/features/cases/CaseCodeBlock'
import '/src/styles/app.css'
import '/src/features/cases/cases.css'
import 'katex/dist/katex.min.css'

// Public synthetic content only. Composer submission and typing stay local.
conversationsApi.emitTyping = async () => {}
const participants = {
  assistant: { id: 'assistant', name: '助教', kind: 'agent', initial: '助', avatarBg: 'transparent', status: 'avail' },
  student: { id: 'student', name: '学生', kind: 'human', initial: '学', avatarBg: 'transparent', status: 'avail' },
}
useParticipants.setState({ byId: participants })
const sample = '# 中文标题 Heading\n\n正文包含 **重点**、[链接](https://example.com) 和公式 $x^2$。\n\n- 第一项\n- 第二项\n\n> 引用段落\n\n```js\nconst answer = 42\n```'
const messages = [
  ['student', '请解释这个概念，并给出例子。'],
  ['assistant', sample + '\n\n::visualize{"path":"/historical/private/example.html"}\n\n下线提示后的正文仍然可读。'],
].map(([sender, text], index) => convertEnvelope({ channelId: 'typography-fixture', channelType: 2, fromUid: sender,
  clientMsgNo: String(index + 1), messageId: String(index + 1), messageSeq: index + 1, timestamp: 1_767_225_600,
  payload: createNativeMessage({ id: String(index + 1), role: sender === 'assistant' ? 'assistant' : 'user', content: [{ type: 'text', text }] }),
}, { participants, meId: 'student' }))

function App() {
  const { resolvedTheme, setTheme } = useTheme()
  const [submitted, setSubmitted] = useState('')
  const [narrow, setNarrow] = useState(false)
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, onNew: async message => {
    setSubmitted(message.content.filter(part => part.type === 'text').map(part => part.text).join(''))
  } })
  return <TooltipProvider><AssistantRuntimeProvider runtime={runtime}>
    <main className="mx-auto max-w-6xl p-4" style={{ maxWidth: narrow ? 390 : undefined }}>
      <button id="theme" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')} className="mb-4 rounded border px-3 py-2">切换明暗</button>
      <button id="narrow" onClick={() => setNarrow(value => !value)} className="mb-4 ms-2 rounded border px-3 py-2">切换窄容器</button>
      <section id="chat" data-lingxi-assistant-thread className="chat-surface mx-auto max-w-3xl rounded-xl py-4">
        <ThreadPrimitive.Root><ThreadPrimitive.Messages components={{ Message: ConversationMessage }} /><ConversationComposer conversationId="typography-fixture" compact /></ThreadPrimitive.Root>
        <p id="submitted" role="status">{submitted && `本地提交：${submitted}`}</p>
      </section>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        {(['forum', 'homework'] as const).map(purpose => <section key={purpose}>
          <h2 className="mb-3 font-semibold">{purpose} · Markdown</h2>
          <div id={`${purpose}-markdown`}><ForumBody content={sample} purpose={purpose} /></div>
          <h2 className="my-3 font-semibold">{purpose} · Native</h2>
          <div id={`${purpose}-native`}><ContentEditor purpose={purpose} value={sample} label={`${purpose} sample`} disabled onChange={() => {}} /></div>
        </section>)}
        <section className="cases-page case-reader">
          <h2 className="mb-3 font-semibold">case · Markdown</h2>
          <div className="case-body" id="case-markdown"><div data-content-typography="case" className="case-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ pre: CaseCodeBlock }}>{sample}</ReactMarkdown></div></div>
          <h2 className="my-3 font-semibold">case · Native</h2>
          <div className="case-body" id="case-native"><ContentEditor purpose="case" legacyFormat="markdown" value={sample} label="case sample" disabled onChange={() => {}} /></div>
        </section>
      </div>
    </main>
  </AssistantRuntimeProvider></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<ThemeProvider attribute="class"><App /></ThemeProvider>)
