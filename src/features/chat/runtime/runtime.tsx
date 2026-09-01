import {
  AssistantRuntimeProvider,
  type AttachmentAdapter,
  type CompleteAttachment,
  type ExternalStoreAdapter,
  type PendingAttachment,
  type ThreadMessage,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import { useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { uploadsApi } from '@/features/platform/api'
import { chatTransport, filterThreadMessages } from './transport'
import { EMPTY_CONVERSATION_CHAT_STATE, useChatThreadStore } from './store'
import type { ConversationThreadSnapshot } from './model'

type UploadedAttachment = PendingAttachment & {
  apiAttachment: Awaited<ReturnType<typeof uploadsApi.uploadFile>>
}

const attachmentAdapter: AttachmentAdapter = {
  accept: '*/*',
  async add({ file }) {
    const apiAttachment = await uploadsApi.uploadFile(file)
    return {
      id: apiAttachment.key ?? crypto.randomUUID(),
      type: apiAttachment.kind === 'img' ? 'image' : 'document',
      name: apiAttachment.name,
      contentType: apiAttachment.mime ?? file.type,
      file,
      apiAttachment,
      status: { type: 'requires-action', reason: 'composer-send' },
    } as UploadedAttachment
  },
  async send(attachment): Promise<CompleteAttachment> {
    const uploaded = attachment as unknown as UploadedAttachment
    return {
      ...uploaded,
      status: { type: 'complete' },
      content: uploaded.apiAttachment.kind === 'img'
        ? [{ type: 'image', image: uploaded.apiAttachment.url }]
        : [{
            type: 'file',
            filename: uploaded.apiAttachment.name,
            mimeType: uploaded.apiAttachment.mime ?? 'application/octet-stream',
            data: uploaded.apiAttachment.url,
            sourceType: 'url',
          }],
    }
  },
  async remove() {},
}

export function useConversationThreadSnapshot(
  conversationId: string,
  threadRootId: string | null = null,
): ConversationThreadSnapshot {
  const state = useChatThreadStore((store) => (
    store.conversations[conversationId] ?? EMPTY_CONVERSATION_CHAT_STATE
  ))
  const messages = useMemo(
    () => filterThreadMessages(state.messages, threadRootId),
    [state.messages, threadRootId],
  )
  const activeRuns = useMemo(
    () => Object.values(state.activeRuns).filter((run) => run.state === 'queued' || run.state === 'running'),
    [state.activeRuns],
  )
  return useMemo(() => ({
    conversationId,
    threadRootId,
    messages,
    isLoading: state.isLoading,
    isLoadingOlder: state.isLoadingOlder,
    hasMoreOlder: state.hasMoreOlder,
    isRunning: activeRuns.length > 0,
    activeAgentIds: [...new Set(activeRuns.map((run) => run.agentId))],
    typingAgentIds: state.typingAgentIds,
    error: state.error,
  }), [activeRuns, conversationId, messages, state.error, state.hasMoreOlder, state.isLoading, state.isLoadingOlder, state.typingAgentIds, threadRootId])
}

export function useConversationPresence(conversationId: string) {
  const state = useChatThreadStore((store) => (
    store.conversations[conversationId] ?? EMPTY_CONVERSATION_CHAT_STATE
  ))
  return useMemo(() => ({
    typingAgentIds: state.typingAgentIds,
    activeAgentIds: [...new Set(Object.values(state.activeRuns)
      .filter((run) => run.state === 'queued' || run.state === 'running')
      .map((run) => run.agentId))],
  }), [state.activeRuns, state.typingAgentIds])
}

export function useConversationThreadRuntime(
  conversationId: string,
  threadRootId: string | null = null,
) {
  const snapshot = useConversationThreadSnapshot(conversationId, threadRootId)
  const onNew = useCallback(
    (message: Parameters<ExternalStoreAdapter<ThreadMessage>['onNew']>[0]) => (
      chatTransport.sendAppend(conversationId, message, threadRootId)
    ),
    [conversationId, threadRootId],
  )
  const concurrentQueue = useMemo<NonNullable<ExternalStoreAdapter<ThreadMessage>['queue']>>(() => ({
    items: [],
    steerItems: [],
    enqueue: (message) => { void onNew(message) },
    steer: (message) => { void onNew(message) },
    move: () => {},
    edit: () => {},
    remove: () => {},
  }), [onNew])
  const adapter = useMemo<ExternalStoreAdapter<ThreadMessage>>(() => ({
    messages: snapshot.messages,
    isLoading: snapshot.isLoading,
    isRunning: snapshot.isRunning,
    onNew,
    queue: concurrentQueue,
    onCancel: () => chatTransport.cancel(conversationId),
    onRefetchThread: () => chatTransport.reloadConversation(conversationId),
    onDelete: (messageId) => chatTransport.discard(conversationId, messageId),
    onAddToolResult: async ({ toolCallId, toolName, result }) => {
      if (toolName === 'approval-card' && toolCallId.startsWith('approval:')) {
        const decision = typeof result === 'object' && result !== null
          ? (result as { decision?: unknown }).decision
          : undefined
        if (decision === 'approved' || decision === 'denied') {
          await chatTransport.resolveApproval(toolCallId.slice('approval:'.length), decision)
        }
      }
      if (toolName === 'option-list' && toolCallId.startsWith('poll:')) {
        const values = typeof result === 'string'
          ? [result]
          : Array.isArray(result) ? result.map(String) : []
        if (values.length > 0) await chatTransport.votePoll(toolCallId.slice('poll:'.length), values)
      }
      if (toolName === 'question-flow' && toolCallId.startsWith('questionnaire:') && result && typeof result === 'object') {
        const answers = Object.entries(result).map(([name, answer]) => (
          `${name}: ${Array.isArray(answer) ? answer.map(String).join(', ') : String(answer)}`
        ))
        if (answers.length > 0) {
          await chatTransport.send(
            conversationId,
            `问答卡片回复：\n${answers.join('\n')}`,
            null,
            toolCallId.slice('questionnaire:'.length),
          )
        }
      }
    },
    onRespondToToolApproval: async ({ approvalId, approved }) => {
      await chatTransport.resolveApproval(approvalId, approved ? 'approved' : 'denied')
    },
    adapters: { attachments: attachmentAdapter },
  }), [concurrentQueue, conversationId, onNew, snapshot.isLoading, snapshot.isRunning, snapshot.messages])
  return useExternalStoreRuntime<ThreadMessage>(adapter)
}

export function ConversationRuntimeProvider({
  conversationId,
  threadRootId = null,
  children,
}: {
  conversationId: string
  threadRootId?: string | null
  children: ReactNode
}) {
  const runtime = useConversationThreadRuntime(conversationId, threadRootId)
  useEffect(() => {
    if (threadRootId) void chatTransport.ensureThread(conversationId, threadRootId)
    else void chatTransport.loadConversation(conversationId)
  }, [conversationId, threadRootId])
  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
}
