import type { AppendMessage, ThreadMessage, ThreadUserMessagePart } from '@assistant-ui/react'
import type { WsEvent } from '@/api/contracts'
import type { ApiAttachment } from '@/api/contracts'
import { ws } from '@/api/core/realtime'
import { agentsApi } from '@/features/agents/api'
import { useParticipants } from '@/features/agents/state'
import { messagesApi } from '@/features/chat/api'
import { conversationsApi } from '@/features/conversations/api'
import { hasBroadcastMention } from '@/lib/chatMessages'
import { toastAction } from '@/lib/actionToast'
import { userFacingError } from '@/lib/userFacingError'
import {
  lingxiIm,
  type ImEnvelope,
  type ImStreamEvent,
  type LingxiMessageV1,
} from '@/lib/im/wukong'
import { getMeId } from '@/stores/auth'
import { convertEnvelope, convertEnvelopeBatch, projectMessageGroups } from './converter'
import { forgetChatOutbox, readChatOutbox, rememberChatOutbox } from './outbox'
import type { LingxiMessageMetadata } from './model'
import {
  CHAT_HISTORY_PAGE_SIZE,
  markDelivery,
  mergeCanonicalMessages,
  mergeConversationReceipts,
  removeConversationMessage,
  replaceMessageReactions,
  replacePollData,
  resetChatThreadStore,
  setConversationMessages,
  setTypingAgent,
  updateConversation,
  useChatThreadStore,
} from './store'
import { mergeStreamParts, runningAgentIds, StreamSequenceTracker } from './stream'

const TYPING_STALE_MS = 45_000

type UploadedAttachment = ApiAttachment & { key?: string }

function conversionContext() {
  return { participants: useParticipants.getState().byId, meId: getMeId() }
}

function messageMetadata(message: ThreadMessage): LingxiMessageMetadata {
  return message.metadata.custom as LingxiMessageMetadata
}

function textFromAppend(message: AppendMessage): string {
  if (message.role !== 'user') throw new Error('Chat composer only accepts user messages')
  return message.content
    .filter((part): part is Extract<(typeof message.content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim()
}

function quoteIdFromAppend(message: AppendMessage): string | null {
  const quote = message.metadata.custom.quote
  if (!quote || typeof quote !== 'object') return null
  const messageId = (quote as { messageId?: unknown }).messageId
  return typeof messageId === 'string' ? messageId : null
}

function attachmentFromAppend(message: AppendMessage): UploadedAttachment | null {
  const attachment = message.attachments?.[0]
  if (!attachment) return null
  const uploaded = (attachment as unknown as { apiAttachment?: UploadedAttachment }).apiAttachment
  if (!uploaded) throw new Error('Composer attachment is not uploaded')
  return uploaded
}

function mentionedAgentIds(body: string): string[] {
  return Object.values(useParticipants.getState().byId)
    .filter((participant) => participant.kind === 'agent')
    .filter((participant) => [participant.id, participant.name].some((label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?，。！？])`, 'i').test(body)
    }))
    .map((participant) => participant.id)
}

function optimisticMessage(
  conversationId: string,
  clientMessageId: string,
  body: string,
  attachment: UploadedAttachment | null,
  quotedMessageId: string | null,
): ThreadMessage {
  const authorId = getMeId()
  if (!authorId) throw new Error('Chat send requires an authenticated user')
  const participant = useParticipants.getState().byId[authorId]
  const original = quotedMessageId
    ? useChatThreadStore.getState().conversations[conversationId]?.messages.find((message) => message.id === quotedMessageId)
    : undefined
  const originalMetadata = original ? messageMetadata(original) : null
  const content: ThreadUserMessagePart[] = [
    ...(body ? [{ type: 'text' as const, text: body }] : []),
    ...(attachment
      ? attachment.kind === 'img' || attachment.mime?.startsWith('image/')
        ? [{ type: 'image' as const, image: attachment.url, filename: attachment.name }]
        : [{
            type: 'file' as const,
            data: attachment.url,
            filename: attachment.name,
            mimeType: attachment.mime ?? 'application/octet-stream',
            sourceType: 'url' as const,
          }]
      : []),
  ]
  const metadata: LingxiMessageMetadata = {
    schema: 'lingxiloop.thread-message.v1',
    conversationId,
    clientMessageId,
    sequence: null,
    senderId: authorId,
    senderName: participant?.name ?? authorId,
    senderKind: 'human',
    senderAvatarUrl: participant?.avatarUrl ?? null,
    isMine: true,
    delivery: 'sending',
    messageKind: attachment ? 'attachment' : 'text',
    runId: null,
    quotedMessageId,
    quote: original ? {
      messageId: original.id,
      authorId: originalMetadata?.senderId ?? '',
      authorName: originalMetadata?.senderName ?? null,
      text: original.content
        .filter((part): part is Extract<(typeof original.content)[number], { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n')
        .slice(0, 240),
      sequence: originalMetadata?.sequence ?? null,
    } : null,
    reactions: [],
    receipts: [],
    replyCount: 0,
    threadRootId: quotedMessageId,
    groupStart: true,
    groupEnd: true,
    continuedFromPrevious: false,
    continuedToNext: false,
  }
  return {
    id: clientMessageId,
    role: 'user',
    content,
    attachments: [],
    createdAt: new Date(),
    metadata: { isOptimistic: true, custom: metadata },
  }
}

function oldestSequence(messages: readonly ThreadMessage[]): number | null {
  const values = messages
    .map((message) => messageMetadata(message).sequence)
    .filter((value): value is number => value !== null && value > 0)
  return values.length > 0 ? Math.min(...values) : null
}

function activeRunState(state: 'queued' | 'running' | 'complete' | 'error' | 'cancelled'): boolean {
  return state === 'queued' || state === 'running'
}

export class ChatTransport {
  private booted = false
  private readonly typingTimers = new Map<string, number>()
  private readonly streamSequences = new StreamSequenceTracker()
  private readonly messageListeners = new Set<(message: ThreadMessage) => void>()

  boot(): void {
    resetChatThreadStore()
    if (this.booted) return
    this.booted = true
    lingxiIm.subscribe((envelope) => this.commitEnvelope(envelope))
    lingxiIm.subscribeEvent((event) => this.applyStreamEvent(event))
    void lingxiIm.connect().catch((error) => console.warn('[chat.transport] IM connect failed', error))
    void this.recoverOutbox()
    void ws.connect()
    ws.on((event) => this.applyWorkspaceEvent(event))
  }

  disconnect(): void {
    lingxiIm.disconnect()
    for (const timer of this.typingTimers.values()) window.clearTimeout(timer)
    this.typingTimers.clear()
    this.streamSequences.clear()
    resetChatThreadStore()
  }

  setWorkspaceChannels(channelIds: Iterable<string>): void {
    lingxiIm.setWorkspaceChannels(channelIds)
  }

  subscribeMessages(listener: (message: ThreadMessage) => void): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  async loadConversation(conversationId: string): Promise<void> {
    const current = useChatThreadStore.getState().conversations[conversationId]
    if (current?.loaded || current?.isLoading) return
    updateConversation(conversationId, (state) => ({ ...state, isLoading: true, error: null }))
    try {
      const envelopes = await lingxiIm.history(conversationId, CHAT_HISTORY_PAGE_SIZE)
      const messages = convertEnvelopeBatch(envelopes, conversionContext())
      updateConversation(conversationId, (state) => ({
        ...state,
        messages: mergeCanonicalMessages(state.messages, messages),
        loaded: true,
        isLoading: false,
        hasMoreOlder: envelopes.length >= CHAT_HISTORY_PAGE_SIZE,
      }))
      await this.loadReceiptsFor(conversationId, messages)
    } catch (error) {
      console.error('[chat.transport] history conversion/load failed', error)
      updateConversation(conversationId, (state) => ({
        ...state,
        isLoading: false,
        error: userFacingError(error, '暂时无法加载消息，请稍后重试。'),
      }))
    }
  }

  async reloadConversation(conversationId: string): Promise<void> {
    try {
      const envelopes = await lingxiIm.history(conversationId, CHAT_HISTORY_PAGE_SIZE)
      const messages = convertEnvelopeBatch(envelopes, conversionContext())
      setConversationMessages(conversationId, messages)
      updateConversation(conversationId, (state) => ({ ...state, loaded: true, error: null }))
      await this.loadReceiptsFor(conversationId, messages)
    } catch (error) {
      console.error('[chat.transport] reload failed', error)
    }
  }

  async loadOlder(conversationId: string): Promise<void> {
    const current = useChatThreadStore.getState().conversations[conversationId]
    if (!current?.loaded || current.isLoadingOlder || !current.hasMoreOlder) return
    const before = oldestSequence(current.messages)
    if (before === null || before <= 1) {
      updateConversation(conversationId, (state) => ({ ...state, hasMoreOlder: false }))
      return
    }
    updateConversation(conversationId, (state) => ({ ...state, isLoadingOlder: true }))
    try {
      const envelopes = await lingxiIm.history(conversationId, CHAT_HISTORY_PAGE_SIZE, before)
      const messages = convertEnvelopeBatch(envelopes, conversionContext())
        .filter((message) => (messageMetadata(message).sequence ?? Number.MAX_SAFE_INTEGER) < before)
      updateConversation(conversationId, (state) => ({
        ...state,
        messages: mergeCanonicalMessages(state.messages, messages),
        isLoadingOlder: false,
        hasMoreOlder: envelopes.length >= CHAT_HISTORY_PAGE_SIZE && messages.length > 0,
      }))
      await this.loadReceiptsFor(conversationId, messages)
    } catch (error) {
      console.error('[chat.transport] older history failed', error)
      updateConversation(conversationId, (state) => ({ ...state, isLoadingOlder: false }))
    }
  }

  async ensureThread(conversationId: string, rootId: string): Promise<void> {
    await this.loadConversation(conversationId)
    const current = useChatThreadStore.getState().conversations[conversationId]
    if (current?.messages.some((message) => (
      message.id === rootId || messageMetadata(message).quotedMessageId === rootId
    ))) return
    const envelopes: ImEnvelope[] = []
    let before = 0
    while (true) {
      const page = await lingxiIm.history(conversationId, 200, before)
      envelopes.push(...page)
      if (page.length < 200) break
      const next = Math.min(...page.map((envelope) => envelope.messageSeq))
      if (!Number.isSafeInteger(next) || next <= 1 || (before > 0 && next >= before)) break
      before = next
    }
    setConversationMessages(conversationId, convertEnvelopeBatch(envelopes, conversionContext()))
  }

  async sendAppend(conversationId: string, message: AppendMessage, threadRootId: string | null): Promise<void> {
    const text = textFromAppend(message)
    const attachment = attachmentFromAppend(message)
    const quotedMessageId = threadRootId ?? quoteIdFromAppend(message)
    await this.send(conversationId, text, attachment, quotedMessageId)
  }

  async send(
    conversationId: string,
    body: string,
    attachment: UploadedAttachment | null,
    quotedMessageId: string | null,
    clientMessageId = `temp-${crypto.randomUUID()}`,
    replayPayload?: LingxiMessageV1,
  ): Promise<void> {
    const text = body.trim()
    if (!text && !attachment) return
    const optimistic = optimisticMessage(conversationId, clientMessageId, text, attachment, quotedMessageId)
    setConversationMessages(conversationId, [optimistic])
    const payload: LingxiMessageV1 = replayPayload ?? {
      version: 1,
      kind: attachment ? 'attachment' : 'text',
      clientMsgNo: clientMessageId,
      body: text,
      ...(quotedMessageId ? { replyToClientMsgNo: quotedMessageId } : {}),
      data: {
        ...(attachment ?? {}),
        mentionedIds: mentionedAgentIds(text),
        mentionAll: hasBroadcastMention(text),
      },
    }
    rememberChatOutbox({
      conversationId,
      clientMessageId,
      payload: payload as unknown as Record<string, unknown>,
      createdAt: new Date().toISOString(),
    })
    try {
      this.commitEnvelope(await lingxiIm.send(conversationId, payload))
      if (attachment) {
        window.setTimeout(() => {
          void import('@/features/knowledge/state')
            .then(({ useKnowledgeSources }) => useKnowledgeSources.getState().load())
            .catch((error) => console.warn('[chat.transport] attachment refresh failed', error))
        }, 750)
      }
    } catch (error) {
      console.warn('[chat.transport] send failed', error)
      markDelivery(conversationId, clientMessageId, 'failed')
    }
  }

  async retry(conversationId: string, messageId: string): Promise<void> {
    const entry = readChatOutbox().find((row) => row.clientMessageId === messageId)
    if (!entry) throw new Error('Failed message is no longer present in the outbox')
    const payload = entry.payload as unknown as LingxiMessageV1
    const data = payload.data ?? {}
    const attachment = payload.kind === 'attachment' ? data as unknown as UploadedAttachment : null
    await this.send(
      conversationId,
      payload.body ?? '',
      attachment,
      payload.replyToClientMsgNo ?? null,
      messageId,
      payload,
    )
  }

  discard(conversationId: string, messageId: string): void {
    forgetChatOutbox(messageId)
    removeConversationMessage(conversationId, messageId)
  }

  async cancel(conversationId: string): Promise<void> {
    const activeRuns = useChatThreadStore.getState().conversations[conversationId]?.activeRuns ?? {}
    const agentIds = runningAgentIds(activeRuns)
    await Promise.allSettled(agentIds.map((agentId) => agentsApi.stopAgentRun(agentId, conversationId)))
  }

  async markRead(conversationId: string, readThroughSequence: number): Promise<void> {
    if (!Number.isSafeInteger(readThroughSequence) || readThroughSequence <= 0) return
    const response = await conversationsApi.markRead(conversationId, readThroughSequence)
    if (response.receipt) mergeConversationReceipts(conversationId, [response.receipt])
    void import('@/features/conversations/store')
      .then(({ useConversations }) => useConversations.getState().reload())
      .catch((error) => console.warn('[chat.transport] conversation read refresh failed', error))
  }

  async toggleReaction(conversationId: string, messageId: string, emoji: string): Promise<void> {
    const message = useChatThreadStore.getState().conversations[conversationId]?.messages
      .find((candidate) => candidate.id === messageId)
    const sequence = message ? messageMetadata(message).sequence : null
    if (!message || sequence === null) return
    const result = await messagesApi.toggleReaction(conversationId, messageId, sequence, emoji)
    replaceMessageReactions(conversationId, messageId, result.reactions)
  }

  async resolveApproval(approvalId: string, decision: 'approved' | 'denied'): Promise<void> {
    await toastAction(
      agentsApi.resolveApproval(approvalId, decision === 'approved' ? 'approved' : 'rejected'),
      {
        loading: decision === 'approved' ? '正在批准' : '正在拒绝',
        success: decision === 'approved' ? '已批准' : '已拒绝',
        error: decision === 'approved' ? '批准失败' : '拒绝失败',
      },
    )
  }

  async votePoll(messageId: string, optionIds: string[]): Promise<void> {
    await messagesApi.castPollVote(messageId, optionIds)
  }

  private commitEnvelope(envelope: ImEnvelope): void {
    try {
      const message = convertEnvelope(envelope, conversionContext())
      const metadata = messageMetadata(message)
      forgetChatOutbox(envelope.clientMsgNo || metadata.clientMessageId)
      updateConversation(envelope.channelId, (state) => {
        const activeRuns = { ...state.activeRuns }
        for (const id of Object.keys(activeRuns)) {
          if (id === metadata.clientMessageId || (metadata.runId && id.includes(metadata.runId))) delete activeRuns[id]
        }
        const withoutStream = state.messages.filter((current) => {
          const currentMetadata = messageMetadata(current)
          return !(
            current.id === metadata.clientMessageId
            || currentMetadata.clientMessageId === metadata.clientMessageId
            || (metadata.runId && currentMetadata.runId === metadata.runId)
          )
        })
        return {
          ...state,
          activeRuns,
          typingAgentIds: state.typingAgentIds.filter((id) => id !== metadata.senderId),
          messages: mergeCanonicalMessages(withoutStream, [message]),
        }
      })
      for (const listener of this.messageListeners) listener(message)
    } catch (error) {
      console.error('[chat.transport] rejected unsupported WuKong message', error, {
        channelId: envelope.channelId,
        messageId: envelope.messageId,
        kind: envelope.payload.kind,
      })
      updateConversation(envelope.channelId, (state) => ({
        ...state,
        error: userFacingError(error, '这条消息暂时无法显示。'),
      }))
    }
  }

  private applyStreamEvent(event: ImStreamEvent): void {
    const messageId = event.clientMsgNo
    if (!this.streamSequences.accept(messageId, event.streamSeq)) return
    const runId = messageId.startsWith('preview-') ? messageId.slice('preview-'.length) : messageId
    const participant = useParticipants.getState().byId[event.fromUid]
    const runState = event.type === 'stream.open'
      ? event.queued ? 'queued' : 'running'
      : event.type === 'stream.close' ? 'complete'
        : event.type === 'stream.error' ? 'error'
          : event.type === 'stream.cancel' ? 'cancelled'
            : 'running'
    updateConversation(event.channelId, (state) => {
      const current = state.messages.find((message) => message.id === messageId)
      const status: ThreadMessage['status'] = runState === 'running' || runState === 'queued'
        ? { type: 'running' }
        : runState === 'complete' ? { type: 'complete', reason: 'stop' }
          : { type: 'incomplete', reason: runState === 'cancelled' ? 'cancelled' : 'error' }
      const metadata: LingxiMessageMetadata = current
        ? { ...messageMetadata(current), runId }
        : {
            schema: 'lingxiloop.thread-message.v1',
            conversationId: event.channelId,
            clientMessageId: messageId,
            sequence: null,
            senderId: event.fromUid,
            senderName: participant?.name ?? event.fromUid,
            senderKind: 'agent',
            senderAvatarUrl: participant?.avatarUrl ?? null,
            isMine: false,
            delivery: 'sent',
            messageKind: event.kind ?? 'text',
            runId,
            quotedMessageId: null,
            quote: null,
            reactions: [],
            receipts: [],
            replyCount: 0,
            threadRootId: null,
            groupStart: true,
            groupEnd: true,
            continuedFromPrevious: false,
            continuedToNext: false,
          }
      const streamMessage: ThreadMessage = {
        id: messageId,
        role: 'assistant',
        createdAt: current?.createdAt ?? new Date(event.timestamp > 10_000_000_000 ? event.timestamp : event.timestamp * 1_000),
        content: mergeStreamParts(
          current?.role === 'assistant' ? current.content : [],
          {
            phase: event.phase === 'thinking' ? 'thinking' : 'answer',
            mode: event.type === 'stream.open' ? 'open' : 'append',
            text: event.type === 'stream.open' ? event.text ?? '' : event.delta ?? event.text ?? '',
            running: status.type === 'running',
          },
        ),
        status,
        metadata: {
          unstable_state: null,
          unstable_annotations: [],
          unstable_data: [],
          steps: [],
          custom: metadata,
        },
      }
      const activeRuns = { ...state.activeRuns }
      if (activeRunState(runState)) {
        activeRuns[messageId] = {
          id: runId,
          agentId: event.fromUid,
          messageId,
          lastSequence: event.streamSeq ?? null,
          state: runState,
        }
      } else {
        delete activeRuns[messageId]
      }
      return {
        ...state,
        activeRuns,
        messages: mergeCanonicalMessages(state.messages.filter((message) => message.id !== messageId), [streamMessage]),
      }
    })
  }

  private applyWorkspaceEvent(event: WsEvent): void {
    if (event.type === 'hello') {
      for (const [conversationId, state] of Object.entries(useChatThreadStore.getState().conversations)) {
        if (state.loaded) void this.reloadConversation(conversationId)
      }
      return
    }
    if (event.type === 'typing') {
      const key = `${event.conversationId}:${event.agentId}`
      const previous = this.typingTimers.get(key)
      if (previous !== undefined) window.clearTimeout(previous)
      if (event.done) {
        this.typingTimers.delete(key)
        setTypingAgent(event.conversationId, event.agentId, false)
      } else {
        setTypingAgent(event.conversationId, event.agentId, true)
        this.typingTimers.set(key, window.setTimeout(() => {
          this.typingTimers.delete(key)
          setTypingAgent(event.conversationId, event.agentId, false)
        }, TYPING_STALE_MS))
      }
      return
    }
    if (event.type === 'im.read-receipt') {
      mergeConversationReceipts(event.channelId, [event])
      return
    }
    if (event.type === 'message.reactions') {
      replaceMessageReactions(event.conversationId, event.messageId, event.reactions)
      return
    }
    if (event.type === 'poll.updated') {
      replacePollData(event.conversationId, event.messageId, event.revision, event.poll, event.tallies)
    }
  }

  private async loadReceiptsFor(conversationId: string, messages: readonly ThreadMessage[]): Promise<void> {
    const sequences = messages
      .map((message) => messageMetadata(message).sequence)
      .filter((sequence): sequence is number => sequence !== null)
    if (sequences.length === 0) return
    try {
      const response = await conversationsApi.readReceipts(
        conversationId,
        Math.min(...sequences),
        Math.max(...sequences),
      )
      mergeConversationReceipts(conversationId, response.receipts)
    } catch (error) {
      console.warn('[chat.transport] receipt sync failed', error)
    }
  }

  private async recoverOutbox(): Promise<void> {
    for (const entry of readChatOutbox()) {
      try {
        const status = await lingxiIm.sendStatus(entry.clientMessageId)
        if (status.status === 'accepted' && status.echo) {
          this.commitEnvelope(status.echo)
          continue
        }
        const payload = entry.payload as unknown as LingxiMessageV1
        const attachment = payload.kind === 'attachment' ? payload.data as unknown as UploadedAttachment : null
        await this.send(
          entry.conversationId,
          payload.body ?? '',
          attachment,
          payload.replyToClientMsgNo ?? null,
          entry.clientMessageId,
          payload,
        )
      } catch (error) {
        console.warn('[chat.transport] outbox recovery deferred', error)
      }
    }
  }
}

export const chatTransport = new ChatTransport()

export function filterThreadMessages(
  messages: readonly ThreadMessage[],
  threadRootId: string | null,
): ThreadMessage[] {
  if (!threadRootId) return projectMessageGroups([...messages])
  return projectMessageGroups(messages.filter((message) => (
    message.id === threadRootId || messageMetadata(message).quotedMessageId === threadRootId
  )))
}
