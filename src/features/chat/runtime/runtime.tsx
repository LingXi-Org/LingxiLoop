import {
  AssistantRuntimeProvider,
  type AttachmentAdapter,
  type CompleteAttachment,
  type ExternalStoreAdapter,
  type PendingAttachment,
  type ThreadMessage,
  useExternalStoreRuntime,
} from '@assistant-ui/react'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { uploadsApi } from '@/features/platform/api'
import type { ConversationThreadSnapshot } from './model'
import { EMPTY_CONVERSATION_CHAT_STATE, useChatThreadStore } from './store'
import { chatTransport, filterThreadMessages } from './transport'
import { uploadedAttachment } from './attachment-messages'
import { createThreadProjector } from './thread-projection'
import { useConversationUi } from '@/stores/conversationUi'
import { useParticipants } from '@/features/agents/state'
import { conversationRunStatus } from './conversation-status'
import { useAuth } from '@/stores/auth'
import { useWorkspace } from '@/features/knowledge/workspace'
import { readComposerDraft, saveComposerDraft, type ComposerDraftScope } from '../drafts'

type UploadedAttachment = PendingAttachment & {
  apiAttachment: Awaited<ReturnType<typeof uploadsApi.uploadFile>>
}

const attachmentAdapter: AttachmentAdapter = {
  accept: '*',
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
    return uploadedAttachment(uploaded.apiAttachment) as CompleteAttachment
  },
  async remove() {},
}

const projectThread = createThreadProjector(filterThreadMessages)

export function useConversationThreadSnapshot(
  conversationId: string,
  threadRootId: string | null = null,
): ConversationThreadSnapshot {
  const state = useChatThreadStore((store) => (
    store.conversations[conversationId] ?? EMPTY_CONVERSATION_CHAT_STATE
  ))
  const selectedReplyBranches = useConversationUi(state => state.selectedReplyBranches)
  const participants = useParticipants(state => state.byId)
  const messages = useMemo(() => projectThread(state.messages, participants, selectedReplyBranches, threadRootId),
    [state.messages, participants, selectedReplyBranches, threadRootId])
  const activeRuns = useMemo(
    () => Object.values(state.activeRuns).filter((run) => run.state === 'queued' || run.state === 'running'),
    [state.activeRuns],
  )
  return useMemo(() => ({
    conversationId,
    threadRootId,
    messages,
    isLoading: state.isLoading || (!state.loaded && !state.error),
    isRecovering: state.isRecovering,
    isLoadingOlder: state.isLoadingOlder,
    hasMoreOlder: state.hasMoreOlder,
    isRunning: activeRuns.length > 0,
    activeAgentIds: [...new Set(activeRuns.map((run) => run.agentId))],
    typingAgentIds: state.typingAgentIds,
    error: state.error,
  }), [activeRuns, conversationId, messages, state.error, state.hasMoreOlder, state.loaded, state.isLoading, state.isRecovering, state.isLoadingOlder, state.typingAgentIds, threadRootId])
}

export function useConversationPresence(conversationId: string) {
  const state = useChatThreadStore((store) => (
    store.conversations[conversationId] ?? EMPTY_CONVERSATION_CHAT_STATE
  ))
  return useMemo(() => ({
    runStatus: conversationRunStatus(state.messages),
    typingAgentIds: state.typingAgentIds,
    activeAgentIds: [...new Set(Object.values(state.activeRuns)
      .filter((run) => run.state === 'queued' || run.state === 'running')
      .map((run) => run.agentId))],
  }), [state.activeRuns, state.typingAgentIds, state.messages])
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
    onRespondToToolApproval: async ({ approvalId, approved, optionId }) => {
      // The product endpoint currently accepts binary decisions only.
      if (optionId !== undefined || typeof approved !== 'boolean') throw new Error('不支持的审批选项')
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
  const companyId = useAuth(state => state.activeCompanyId)
  const userId = useAuth(state => state.user?.id ?? null)
  const projectId = useWorkspace(state => state.selectedId)
  const scope = useMemo(() => ({ companyId, userId, projectId, conversationId, threadRootId }), [companyId, userId, projectId, conversationId, threadRootId])
  // Remount the composer on every scope change: pending uploads and input cannot
  // migrate into another account, course, conversation or thread.
  return <ScopedConversationRuntimeProvider key={JSON.stringify(scope)} scope={scope}>{children}</ScopedConversationRuntimeProvider>
}

function ScopedConversationRuntimeProvider({ scope, children }: { scope: ComposerDraftScope; children: ReactNode }) {
  const { conversationId, threadRootId } = scope
  const runtime = useConversationThreadRuntime(conversationId, threadRootId)
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    const composer = runtime.thread.composer
    const draft = readComposerDraft(scope)
    if (draft && !composer.getState().text && !composer.getState().attachments.length) {
      composer.setText(draft.text)
      for (const attachment of draft.attachments) {
        // Native file-id references are accepted for every uploaded MIME type.
        // Never persist signed download URLs, raw browser Files or auth material.
        void composer.addAttachment({ ...attachment, type: 'document', content: [{ type: 'file', sourceType: 'id',
          data: attachment.id, mimeType: attachment.contentType, filename: attachment.name }] })
      }
      setRestored(true)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => { clearTimeout(timer); saveComposerDraft(scope, composer.getState()) }
    const unsubscribe = composer.subscribe(() => { clearTimeout(timer); timer = setTimeout(flush, 200) })
    window.addEventListener('pagehide', flush)
    return () => { unsubscribe(); window.removeEventListener('pagehide', flush); flush() }
  }, [runtime, scope])
  useEffect(() => {
    if (threadRootId) void chatTransport.ensureThread(conversationId, threadRootId)
    else void chatTransport.loadConversation(conversationId)
  }, [conversationId, threadRootId])
  return <AssistantRuntimeProvider runtime={runtime}>{children}
    {restored && <p role="status" className="px-3 pb-2 text-xs text-muted-foreground">已恢复本设备上的草稿与上传完成的附件引用。未完成的上传需重新添加；发送时会重新核验权限。</p>}
  </AssistantRuntimeProvider>
}
