// Local layout replay: real thread, composer and design split; synthetic public content.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AssistantRuntimeProvider, useExternalStoreRuntime, type ThreadMessage } from '@assistant-ui/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConversationThread } from '@/features/chat/components/ConversationThread'
import { DesignWorkspace } from '@/features/design/DesignWorkspace'
import { artifactsApi } from '@/features/artifacts/api'
import { convertEnvelope, projectMessageGroups } from '@/features/chat/runtime/converter'
import { useChatThreadStore, EMPTY_CONVERSATION_CHAT_STATE } from '@/features/chat/runtime/store'
import { createNativeMessage } from '@/lib/nativeMessage'
import { useParticipants } from '@/features/agents/state'
import '@/styles/globals.css'
import '@/features/design/design-workspace.css'

const participants = {
  agent: { id: 'agent', kind: 'agent', name: '布局验收助手', initial: '助', avatarBg: 'transparent', status: 'avail' },
  me: { id: 'me', kind: 'human', name: '验收者', initial: '人', avatarBg: 'transparent', status: 'avail' },
} as const
useParticipants.setState({ byId: participants })
// The editor's content/service is outside this layout regression.
artifactsApi.editorGrant = async () => ({ url: 'about:blank' }) as Awaited<ReturnType<typeof artifactsApi.editorGrant>>
const prose = '这段合成公开答复用于检查主对话的阅读宽度、文字换行和左右交错。'.repeat(15)
function message(id: number, sender: 'me' | 'agent', text: string): ThreadMessage {
  return convertEnvelope({ channelId: 'room', channelType: 2, fromUid: sender, clientMsgNo: String(id),
    messageId: String(id), messageSeq: id, timestamp: 1_767_225_600 + id,
    payload: createNativeMessage({ id: String(id), role: sender === 'agent' ? 'assistant' : 'user', content: [{ type: 'text', text }] }),
  }, { participants, meId: 'me' })
}
const messages = projectMessageGroups([
  message(1, 'me', '请解释一下。'), message(2, 'agent', '可以，我们先看一个例子。'),
  message(3, 'me', prose), message(4, 'agent', prose),
  { ...message(5, 'agent', ''), content: [{ type: 'tool-call', toolCallId: 'layout-tool', toolName: 'fixture.lookup', args: {}, argsText: '{}', result: { ok: true } }] },
  { ...message(6, 'me', ''), content: [{ type: 'file', filename: '公开布局示例.pdf', mimeType: 'application/pdf', data: 'https://example.com/public.pdf' }] },
  message(7, 'agent', '```text\n' + 'LongUnbrokenCode'.repeat(50) + '\n```\n\n|说明|内容|\n|---|---|\n|换行检查|' + prose + '|'),
  message(8, 'agent', '```mermaid\ngraph LR\n A[请求] --> B[答复]\n B --> C[继续交流]\n```'),
  ...Array.from({ length: 8 }, (_, i) => message(9 + i, i % 2 ? 'agent' : 'me', prose)),
])
useChatThreadStore.setState({ conversations: { room: { ...EMPTY_CONVERSATION_CHAT_STATE, messages, loaded: true, hasMoreOlder: false } } })

function Fixture() {
  const [open, setOpen] = useState(false)
  const runtime = useExternalStoreRuntime({ messages, onNew: async () => {} })
  return <TooltipProvider><AssistantRuntimeProvider runtime={runtime}>
    <div className="flex h-dvh min-w-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 px-4"><span>合成公开对话 · #610 布局回归</span><button type="button" data-design-open-trigger onClick={() => setOpen(value => !value)}>切换画板</button></header>
      <div className="min-h-0 flex-1"><DesignWorkspace design={open ? { artifactId: 'layout-design', title: '合成画板' } : null} onClose={() => setOpen(false)}>
        <main className="chat-pane h-full min-h-0 min-w-0"><ConversationThread conversationId="room" /></main>
      </DesignWorkspace></div>
    </div>
  </AssistantRuntimeProvider></TooltipProvider>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
