import { AssistantRuntimeProvider, ThreadPrimitive, useExternalStoreRuntime } from '@assistant-ui/react'
import { useCallback, useMemo, type ReactNode } from 'react'
import { agentsApi } from '@/api/agents'
import { useMe } from '@/stores/auth'
import { useParticipants } from '@/stores/participants'
import type { Message } from '@/types'
import { createLingxiAssistantMessage } from './assistantMessage'

export function LingxiAssistantRuntimeProvider({ messages, children }: { messages: readonly Message[]; children: ReactNode }) {
  const participants = useParticipants((state) => state.byId)
  const meId = useMe()
  const convertMessage = useCallback(
    (message: Message, index: number) => createLingxiAssistantMessage(message, index, messages, participants, meId),
    [meId, messages, participants],
  )
  const adapter = useMemo(() => ({
    messages,
    convertMessage,
    onNew: async () => {},
    onAddToolResult: async ({ toolCallId, toolName, result }: {
      toolCallId: string
      toolName: string
      result: unknown
    }) => {
      if (toolName !== 'lingxi_approval' || !toolCallId.startsWith('approval:')) return
      const decision = typeof result === 'object' && result !== null ? (result as { decision?: unknown }).decision : undefined
      if (decision !== 'approved' && decision !== 'denied') return
      await agentsApi.resolveApproval(toolCallId.slice('approval:'.length), decision === 'approved' ? 'approved' : 'rejected')
    },
  }), [convertMessage, messages])
  const runtime = useExternalStoreRuntime<Message>(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="assistant-ui-scope aui-thread-root h-full min-h-0 bg-background text-foreground" data-lingxi-assistant-thread>
        {children}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  )
}
