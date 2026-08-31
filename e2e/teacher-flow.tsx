import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  type AppendMessage,
  type ExternalStoreAdapter,
  type ThreadMessage,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import { useCallback, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConversationComposer } from '@/features/chat/components/ConversationComposer'
import { ConversationMessage } from '@/features/chat/components/ConversationMessage'
import { useParticipants } from '@/features/agents/state'
import { useConversations } from '@/features/conversations/store'
import type { LingxiMessageMetadata } from '@/features/chat/runtime'
import '@/styles/globals.css'
import './styles.css'

const conversationId = 'assistant-ui-e2e'
const scout = {
  id: 'scout-e2e', kind: 'agent' as const, name: 'Scout', initial: 'S',
  avatarBg: '#6366f1', status: 'avail' as const, role: 'researcher',
}
const human = {
  id: 'human-e2e', kind: 'human' as const, name: 'Ada', initial: 'A',
  avatarBg: '#0f766e', status: 'avail' as const,
}

useParticipants.setState({ byId: { [scout.id]: scout, [human.id]: human }, loaded: true })
useConversations.setState({
  list: [{
    id: conversationId, kind: 'group', title: 'Assistant UI Fixture', members: [human.id, scout.id],
    leaderId: scout.id, lastAt: 'now', preview: '',
  }],
  loaded: true,
})

function metadata(id: string, sender: typeof scout | typeof human, isMine = false): LingxiMessageMetadata {
  return {
    schema: 'lingxiloop.thread-message.v1', conversationId, clientMessageId: id, sequence: null,
    senderId: sender.id, senderName: sender.name, senderKind: sender.kind, senderAvatarUrl: null,
    isMine, delivery: 'sent', messageKind: 'text', runId: null, quotedMessageId: null,
    quote: null, reactions: [], receipts: [], replyCount: 0, threadRootId: null,
    groupStart: true, groupEnd: true, continuedFromPrevious: false, continuedToNext: false,
  }
}

const initialMessages: ThreadMessage[] = [
  {
    id: 'welcome', role: 'assistant', createdAt: new Date(),
    content: [{ type: 'text', text: 'Welcome to the assistant-ui conversation fixture.' }],
    status: { type: 'complete', reason: 'stop' },
    metadata: { custom: { ...metadata('welcome', scout), groupEnd: false, continuedToNext: true } },
  },
  {
    id: 'cluster-middle', role: 'assistant', createdAt: new Date(),
    content: [{ type: 'text', text: 'This is the middle of a compact message cluster.' }],
    status: { type: 'complete', reason: 'stop' },
    metadata: { custom: {
      ...metadata('cluster-middle', scout),
      reactions: [
        { emoji: '🔥', count: 2, mine: true, userIds: [human.id, scout.id] },
        { emoji: '👍', count: 1, mine: false, userIds: [scout.id] },
      ],
      groupStart: false,
      groupEnd: false,
      continuedFromPrevious: true,
      continuedToNext: true,
    } },
  },
  {
    id: 'cluster-end', role: 'assistant', createdAt: new Date(),
    content: [{ type: 'text', text: 'This closes the compact message cluster.' }],
    status: { type: 'complete', reason: 'stop' },
    metadata: { custom: { ...metadata('cluster-end', scout), groupStart: false, groupEnd: false, continuedFromPrevious: true, continuedToNext: true } },
  },
  {
    id: 'approval', role: 'assistant', createdAt: new Date(),
    content: [{
      type: 'tool-call', toolCallId: 'approval:e2e', toolName: 'approval-card',
      args: { id: 'approval-e2e', title: 'Approve fixture action', description: 'Rendered by Tool UI', confirmLabel: '批准', cancelLabel: '拒绝' },
      argsText: '{}',
    }],
    status: { type: 'requires-action', reason: 'tool-calls' },
    metadata: { custom: { ...metadata('approval', scout), messageKind: 'approval', groupStart: false, continuedFromPrevious: true } },
  },
  {
    id: 'mine-start', role: 'user', createdAt: new Date(),
    content: [{ type: 'text', text: 'My first clustered message.' }],
    metadata: { custom: { ...metadata('mine-start', human, true), groupEnd: false, continuedToNext: true } },
  },
  {
    id: 'mine-end', role: 'user', createdAt: new Date(),
    content: [{ type: 'text', text: 'My second clustered message.' }],
    metadata: { custom: { ...metadata('mine-end', human, true), groupStart: false, continuedFromPrevious: true } },
  },
]

function FixtureThread() {
  const [messages, setMessages] = useState(initialMessages)
  const [running, setRunning] = useState(false)
  const onNew = useCallback(async (append: AppendMessage) => {
    const userId = `user-${crypto.randomUUID()}`
    const previewId = `preview-${crypto.randomUUID()}`
    setMessages((current) => [...current, {
      id: userId, role: 'user', content: append.content, attachments: append.attachments ?? [], createdAt: new Date(),
      metadata: { custom: metadata(userId, human, true) },
    }, {
      id: previewId, role: 'assistant', content: [],
      status: { type: 'running' }, createdAt: new Date(), metadata: { custom: metadata(previewId, scout) },
    }])
    setRunning(true)
    window.setTimeout(() => {
      setMessages((current) => current.map((message) => message.id === previewId ? {
        ...message,
        content: [{ type: 'text', text: '## Streaming\n\n**Markdown** is arriving.', status: { type: 'running' } }],
      } as ThreadMessage : message))
    }, 250)
    window.setTimeout(() => {
      setMessages((current) => current.map((message) => message.id === previewId ? {
        ...message,
        content: [{ type: 'text', text: '## Streaming complete\n\n**Markdown** stayed formatted.', status: { type: 'complete' } }],
        status: { type: 'complete', reason: 'stop' },
      } as ThreadMessage : message))
      setRunning(false)
    }, 3_000)
  }, [])
  const adapter = useMemo<ExternalStoreAdapter<ThreadMessage>>(() => ({
    messages,
    isRunning: running,
    onNew,
    onCancel: async () => setRunning(false),
    onAddToolResult: ({ toolCallId, result }) => setMessages((current) => current.map((message) => ({
      ...message,
      content: message.content.map((part) => part.type === 'tool-call' && part.toolCallId === toolCallId
        ? { ...part, result }
        : part),
      status: message.id === 'approval' ? { type: 'complete', reason: 'stop' } : message.status,
    }) as ThreadMessage)),
  }), [messages, onNew, running])
  const runtime = useExternalStoreRuntime(adapter)
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-screen flex-col bg-background text-foreground">
        <ThreadPrimitive.Viewport data-chat-viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <ThreadPrimitive.Messages components={{ Message: ConversationMessage }} />
          <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mt-auto bg-background pt-4">
            <ConversationComposer conversationId={conversationId} />
          </ThreadPrimitive.ViewportFooter>
          <ThreadPrimitive.ScrollToBottom asChild>
            <Button type="button" variant="outline" size="icon" className="absolute bottom-24 end-5 z-10 rounded-full border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground disabled:invisible" aria-label="滚动到底部">
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
            </Button>
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <AppThemeProvider>
    <GlobalInteractionProvider>
      <TooltipProvider><FixtureThread /></TooltipProvider>
    </GlobalInteractionProvider>
  </AppThemeProvider>,
)
