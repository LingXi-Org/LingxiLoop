import type { AppendMessage, ThreadMessage, ThreadUserMessagePart } from '@assistant-ui/react'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'
import type { ApiAttachment, WsEvent } from '@/api/contracts'
import { ws } from '@/api/core/realtime'
import { agentsApi } from '@/features/agents/api'
import { useParticipants } from '@/features/agents/state'
import { messagesApi } from '@/features/chat/api'
import { toastAction } from '@/lib/actionToast'
import { hasBroadcastMention } from '@/lib/chatMessages'
import { parseMentions } from '@/lib/mentions'
import { useConversations } from '@/features/conversations/store'
import {
  type ImEnvelope,
  type LingxiMessageV1,
  lingxiIm,
} from '@/lib/im/wukong'
import { userFacingError } from '@/lib/userFacingError'
import { getActiveCompanyId, getMeId } from '@/stores/auth'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { convertEnvelope, convertEnvelopeBatch, projectMessageGroups } from './converter'
import { type LingxiMessageMetadata, resolveMessagePresentation } from './model'
import { forgetChatOutbox, readChatOutbox, rememberChatOutbox } from './outbox'
import {
  CHAT_HISTORY_PAGE_SIZE,
  type ConversationChatState,
  markDelivery,
  mergeCanonicalMessages,
  messageKey,
  removeConversationMessage,
  replaceMessageReactions,
  replacePollData,
  resetChatThreadStore,
  setConversationMessages,
  setTypingAgent,
  updateConversation,
  useChatThreadStore,
} from './store'
import { harnessApi, type AgentRunResponse, type AgentRunTarget } from './harness-api'
import { applyRunSnapshot, needsRunStream } from './run-updates'
import { canCancelRun, isRunMessage } from './harness'
import { attachmentMessages } from './attachment-messages'
import { chatLatency } from './latency'

const TYPING_STALE_MS = 45_000

type UploadedAttachment = ApiAttachment & { key?: string }
type RequestContext = { signal: AbortSignal; identity: string; current: () => boolean }

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

function mentionedAgentIds(body: string, conversationId: string): string[] {
  const members = useConversations.getState().list.find(room => room.id === conversationId)?.members ?? []
  const roster = Object.values(useParticipants.getState().byId).filter(participant => members.includes(participant.id))
  return parseMentions(body, roster).mentionedIds.filter(id => useParticipants.getState().byId[id]?.kind === 'agent')
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
    presentation: resolveMessagePresentation(content),
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
    replyCount: 0,
    threadRootId: quotedMessageId,
    groupStart: true,
    groupEnd: true,
    continuedFromPrevious: false,
    continuedToNext: false,
    clusterChromeAt: null,
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

export class ChatTransport {
  private readonly cancellations = new Map<string, Promise<void>>()
  private booted = false
  private readonly typingTimers = new Map<string, number>()
  private readonly runStreams = new Map<string, AbortController>()
  private discoveryTimer: number | undefined
  private subscriptions: (() => void)[] = []
  private discovering: RequestContext | undefined
  private readonly messageListeners = new Set<(message: ThreadMessage) => void>()
  private connection = new AbortController()
  private workspaceIdentity: string | null = null
  private workspaceChannels: Set<string> | null = null
  private readonly runReads = new Map<string, Promise<AgentRunResponse>>()
  private readonly historyRequests = new Map<string, RequestContext>()

  boot(): void {
    if (this.connection.signal.aborted) this.connection = new AbortController()
    resetChatThreadStore()
    if (this.booted) return
    this.booted = true
    this.subscriptions.push(lingxiIm.subscribe((envelope) => this.commitEnvelope(envelope)))
    void lingxiIm.connect().catch((error) => console.warn('[chat.transport] IM connect failed', error))
    void this.recoverOutbox()
    void ws.connect()
    this.subscriptions.push(ws.on((event) => this.applyWorkspaceEvent(event)))
    this.discoveryTimer = window.setInterval(() => void this.discoverRuns(),1500)
    void this.discoverRuns()
  }

  disconnect(): void {
    this.booted = false
    for (const unsubscribe of this.subscriptions) unsubscribe()
    this.subscriptions = []
    this.connection.abort()
    this.workspaceIdentity = null; this.workspaceChannels = null
    chatLatency.clear()
    this.runReads.clear()
    this.historyRequests.clear()
    lingxiIm.disconnect()
    for (const timer of this.typingTimers.values()) window.clearTimeout(timer)
    this.typingTimers.clear()
    for (const stream of this.runStreams.values()) stream.abort()
    this.runStreams.clear()
    window.clearInterval(this.discoveryTimer)
    resetChatThreadStore()
  }

  setWorkspaceChannels(channelIds: Iterable<string>): void {
    const channels = new Set(channelIds), identity = this.requestIdentity()
    const changed = this.workspaceIdentity !== identity
    const revoked = this.workspaceChannels && [...this.workspaceChannels].some(id => !channels.has(id))
    const interrupted = !changed && revoked ? Object.entries(useChatThreadStore.getState().conversations)
      .filter(([id, state]) => channels.has(id) && (state.isLoading || state.isLoadingOlder)) : []
    if (changed || revoked) {
      // A fresh signal is the scope generation: A → B → A cannot revive an A request.
      this.connection.abort(); this.connection = new AbortController()
      this.runReads.clear(); this.historyRequests.clear()
      for (const stream of this.runStreams.values()) stream.abort()
      this.runStreams.clear()
      for (const timer of this.typingTimers.values()) window.clearTimeout(timer)
      this.typingTimers.clear()
      chatLatency.opened(null)
      if (changed) resetChatThreadStore()
      else useChatThreadStore.setState(state => ({ conversations: Object.fromEntries(
        Object.entries(state.conversations).filter(([id]) => channels.has(id))
          .map(([id, conversation]) => [id, { ...conversation, isLoading: false, isLoadingOlder: false }]),
      ) }))
    }
    this.workspaceIdentity = identity; this.workspaceChannels = channels
    lingxiIm.setWorkspaceChannels(channels)
    if (changed || revoked) for (const id of Object.keys(useChatThreadStore.getState().conversations)) this.syncRunStreams(id)
    // The mounted runtime only loads on conversation changes, so resume work canceled by scope revocation here.
    for (const [id, state] of interrupted) {
      if (state.isLoadingOlder) void this.loadOlder(id)
      else void this.loadConversation(id)
    }
  }

  subscribeMessages(listener: (message: ThreadMessage) => void): () => void {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  private requestIdentity(): string {
    return JSON.stringify([getMeId(), getActiveCompanyId(), getWorkspaceSession()?.projectId ?? null])
  }

  private includesChannel(conversationId: string): boolean {
    return !this.workspaceChannels || this.workspaceChannels.has(conversationId)
  }

  private captureRequest(): RequestContext {
    const signal = this.connection.signal
    const captured = this.requestIdentity()
    return { signal, identity: captured, current: () => !signal.aborted && this.requestIdentity() === captured }
  }

  async loadConversation(conversationId: string): Promise<void> {
    if (!this.includesChannel(conversationId)) return
    const current = useChatThreadStore.getState().conversations[conversationId]
    if (current?.loaded || current?.isLoading && this.historyRequests.get(conversationId)?.current()) return
    const request = this.captureRequest()
    this.historyRequests.set(conversationId, request)
    updateConversation(conversationId, (state) => ({ ...state, isLoading: true, error: null }))
    try {
      const envelopes = await lingxiIm.history(conversationId, CHAT_HISTORY_PAGE_SIZE)
      if (!request.current()) return
      const messages = convertEnvelopeBatch(envelopes, conversionContext())
      updateConversation(conversationId, (state) => ({
        ...state,
        messages: mergeCanonicalMessages(state.messages, messages),
        loaded: true,
        isLoading: false,
        hasMoreOlder: envelopes.length >= CHAT_HISTORY_PAGE_SIZE,
      }))
      this.syncRunStreams(conversationId)
      void this.hydrateConversation(conversationId, request)
    } catch (error) {
      if (!request.current()) return
      console.error('[chat.transport] history conversion/load failed', error)
      updateConversation(conversationId, (state) => ({
        ...state,
        isLoading: false,
        error: userFacingError(error, '暂时无法加载消息，请稍后重试。'),
      }))
    } finally {
      if (this.historyRequests.get(conversationId) === request) this.historyRequests.delete(conversationId)
    }
  }

  async reloadConversation(conversationId: string): Promise<void> {
    if (!this.includesChannel(conversationId)) return
    const request = this.captureRequest()
    try {
      const envelopes = await lingxiIm.history(conversationId, CHAT_HISTORY_PAGE_SIZE)
      if (!request.current()) return
      const messages = convertEnvelopeBatch(envelopes, conversionContext())
      updateConversation(conversationId, state => ({ ...state,
        messages: mergeCanonicalMessages(state.messages, messages), loaded: true, isLoading: false, error: null }))
      this.syncRunStreams(conversationId)
      void this.hydrateConversation(conversationId, request)
    } catch (error) {
      if (!request.current()) return
      console.error('[chat.transport] reload failed', error)
    }
  }

  async loadOlder(conversationId: string): Promise<void> {
    if (!this.includesChannel(conversationId)) return
    const current = useChatThreadStore.getState().conversations[conversationId]
    if (!current?.loaded || !current.hasMoreOlder || current.isLoadingOlder && this.historyRequests.get(conversationId)?.current()) return
    const request = this.captureRequest()
    const before = oldestSequence(current.messages)
    if (before === null || before <= 1) {
      updateConversation(conversationId, (state) => ({ ...state, hasMoreOlder: false }))
      return
    }
    this.historyRequests.set(conversationId, request)
    updateConversation(conversationId, (state) => ({ ...state, isLoadingOlder: true }))
    try {
      const envelopes = await lingxiIm.history(conversationId, CHAT_HISTORY_PAGE_SIZE, before)
      if (!request.current()) return
      const messages = convertEnvelopeBatch(envelopes, conversionContext())
        .filter((message) => (messageMetadata(message).sequence ?? Number.MAX_SAFE_INTEGER) < before)
      updateConversation(conversationId, (state) => ({
        ...state,
        messages: mergeCanonicalMessages(state.messages, messages),
        isLoadingOlder: false,
        hasMoreOlder: envelopes.length >= CHAT_HISTORY_PAGE_SIZE && messages.length > 0,
      }))
      this.syncRunStreams(conversationId)
      void this.hydrateConversation(conversationId, request)
    } catch (error) {
      if (!request.current()) return
      console.error('[chat.transport] older history failed', error)
      updateConversation(conversationId, (state) => ({ ...state, isLoadingOlder: false }))
    } finally {
      if (this.historyRequests.get(conversationId) === request) this.historyRequests.delete(conversationId)
    }
  }

  async ensureThread(conversationId: string, rootId: string): Promise<void> {
    if (!this.includesChannel(conversationId)) return
    const request = this.captureRequest()
    await this.loadConversation(conversationId)
    if (!request.current()) return
    const current = useChatThreadStore.getState().conversations[conversationId]
    if (current?.messages.some((message) => (
      message.id === rootId || messageMetadata(message).quotedMessageId === rootId
    ))) return
    const envelopes: ImEnvelope[] = []
    let before = 0
    while (true) {
      const page = await lingxiIm.history(conversationId, 200, before)
      if (!request.current()) return
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
    const attachments = (message.attachments ?? []).map(attachment => {
      const uploaded = (attachment as unknown as { apiAttachment?: UploadedAttachment }).apiAttachment
      if (!uploaded) throw new Error('Composer attachment is not uploaded')
      return uploaded
    })
    const quotedMessageId = threadRootId ?? quoteIdFromAppend(message)
    if (!attachments.length) { await this.send(conversationId, text, null, quotedMessageId); return }
    const payloads = attachmentMessages(attachments, text, quotedMessageId,
      { mentionedIds: mentionedAgentIds(text, conversationId), mentionAll: hasBroadcastMention(text) })
    for (const payload of payloads) rememberChatOutbox({ conversationId, clientMessageId: payload.clientMsgNo,
      payload: payload as unknown as Record<string, unknown>, createdAt: new Date().toISOString() })
    setConversationMessages(conversationId, payloads.map((payload, index) =>
      optimisticMessage(conversationId, payload.clientMsgNo, payload.body ?? '', attachments[index], quotedMessageId)))
    try {
      for (const [index, payload] of payloads.entries()) {
        if (!await this.send(conversationId, payload.body ?? '', attachments[index], quotedMessageId, payload.clientMsgNo, payload)) {
          throw new Error('Attachment submission is incomplete')
        }
      }
    } catch {
      for (const entry of readChatOutbox().filter(entry => payloads.some(payload => payload.clientMsgNo === entry.clientMessageId))) {
        markDelivery(conversationId, entry.clientMessageId, 'failed')
      }
    }
  }

  async send(
    conversationId: string,
    body: string,
    attachment: UploadedAttachment | null,
    quotedMessageId: string | null,
    clientMessageId = `temp-${crypto.randomUUID()}`,
    replayPayload?: LingxiMessageV1,
  ): Promise<boolean> {
    const text = body.trim()
    if (!text && !attachment) return false
    chatLatency.send(clientMessageId)
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
        mentionedIds: mentionedAgentIds(text, conversationId),
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
      chatLatency.submitted(clientMessageId)
      if (attachment) {
        window.setTimeout(() => {
          void import('@/features/knowledge/state')
            .then(({ useKnowledgeSources }) => useKnowledgeSources.getState().load())
            .catch((error) => console.warn('[chat.transport] attachment refresh failed', error))
        }, 750)
      }
      return true
    } catch (error) {
      console.warn('[chat.transport] send failed', error)
      markDelivery(conversationId, clientMessageId, 'failed')
      return false
    }
  }

  async retry(conversationId: string, messageId: string): Promise<void> {
    const entry = readChatOutbox().find((row) => row.clientMessageId === messageId)
    if (!entry) throw new Error('Failed message is no longer present in the outbox')
    const payload = entry.payload as unknown as LingxiMessageV1
    const data = payload.data ?? {}
    for (const dependency of Array.isArray(data.attachmentClientMsgNos) ? data.attachmentClientMsgNos : []) {
      if (dependency !== messageId && typeof dependency === 'string'
        && readChatOutbox().some(item => item.clientMessageId === dependency && item.conversationId === conversationId)) {
        await this.retry(conversationId, dependency)
      }
    }
    const attachment = payload.kind === 'attachment' ? data as unknown as UploadedAttachment : null
    const sent = await this.send(
      conversationId,
      payload.body ?? '',
      attachment,
      payload.replyToClientMsgNo ?? null,
      messageId,
      payload,
    )
    if (!sent) throw new Error('消息尚未发送，请重试。')
  }

  discard(conversationId: string, messageId: string): void {
    forgetChatOutbox(messageId)
    removeConversationMessage(conversationId, messageId)
  }

  cancel(conversationId: string): Promise<void> {
    const pending = this.cancellations.get(conversationId)
    if (pending) return pending
    const state = useChatThreadStore.getState().conversations[conversationId]
    const targets = (state?.messages ?? []).map(messageMetadata).filter(canCancelRun)
    const operation = Promise.allSettled(targets.map(async message => {
      const target = { conversationId, agentId: message.senderId, runId: message.runId!,
        ...(message.threadRootId ? { threadId: message.threadRootId } : {}) }
      await harnessApi.cancel(target)
      await this.refreshRun(target)
    })).then(results => {
      if (results.some(result => result.status === 'rejected')) throw new Error('部分任务未能停止，请重试。')
    }).finally(() => this.cancellations.delete(conversationId))
    this.cancellations.set(conversationId, operation)
    return operation
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

  async continueRun(target: AgentRunTarget, text: string, requestVersion: number): Promise<void> {
    const clientMsgNo = `temp-${crypto.randomUUID()}`
    const accepted = await this.send(target.conversationId,text,null,target.threadId ?? null,clientMsgNo,{
      version: 1, kind: 'text', clientMsgNo, body: text.trim(), ...(target.threadId ? { replyToClientMsgNo: target.threadId } : {}),
      data: { mentionedIds: [target.agentId], agentContinuation: { runId: target.runId, agentId: target.agentId, requestVersion } },
    })
    if (!accepted) throw new Error('补充信息尚未发送，可在消息中重试')
    await harnessApi.continue(target,clientMsgNo,requestVersion)
  }

  private readRun(target: AgentRunTarget, request: RequestContext): Promise<AgentRunResponse> {
    const key = JSON.stringify([request.identity, target.conversationId, target.agentId, target.runId, target.threadId ?? null])
    const pending = this.runReads.get(key)
    if (pending) return pending
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)])
    const promise = harnessApi.read(target, signal).finally(() => {
      if (this.runReads.get(key) === promise) this.runReads.delete(key)
    })
    this.runReads.set(key, promise)
    return promise
  }

  async refreshRun(target: AgentRunTarget): Promise<void> {
    if (!this.includesChannel(target.conversationId)) return
    this.runStreams.get(target.runId)?.abort()
    this.runStreams.delete(target.runId)
    this.subscribeRun(target)
  }

  private commitEnvelope(envelope: ImEnvelope): void {
    if (this.connection.signal.aborted || !this.includesChannel(envelope.channelId)) return
    try {
      const message = convertEnvelope(envelope, conversionContext())
      const metadata = messageMetadata(message)
      forgetChatOutbox(envelope.clientMsgNo || metadata.clientMessageId)
      let accepted = true
      updateConversation(envelope.channelId, (state) => {
        const messages = mergeCanonicalMessages(state.messages, [message])
        const merged = messages.find(value => messageKey(value) === messageKey(message))
        const view = merged && messageMetadata(merged).harness
        if (metadata.harness && view && view.resultId !== metadata.harness.resultId) { accepted = false; return state }
        const reconcilesStream = isRunMessage(metadata)
        const activeRuns = { ...state.activeRuns }
        if (reconcilesStream) {
          for (const [id,run] of Object.entries(activeRuns)) {
            if (run.id === metadata.runId) delete activeRuns[id]
          }
          if (merged && view && (view.lifecycle === 'queued' || view.lifecycle === 'leased')) activeRuns[merged.id] = {
            id: view.runId, agentId: metadata.senderId, messageId: merged.id, lastSequence: view.lastSeq,
            state: view.lifecycle === 'queued' ? 'queued' : 'running',
          }
        }
        return {
          ...state,
          activeRuns,
          typingAgentIds: reconcilesStream
            ? state.typingAgentIds.filter((id) => id !== metadata.senderId)
            : state.typingAgentIds,
          messages,
        }
      })
      if (accepted) for (const listener of this.messageListeners) listener(message)
      if (metadata.harness && metadata.runId) void this.refreshRun({ conversationId: envelope.channelId,
        agentId: metadata.senderId, runId: metadata.runId, ...(metadata.threadRootId ? { threadId: metadata.threadRootId } : {}) })
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

  private async readRunSnapshots(conversationId: string, messages: readonly ThreadMessage[], request: RequestContext) {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)])
    const listed = await harnessApi.list(conversationId, signal).catch(() => [])
    if (signal.aborted || !request.current()) return []
    // Subscribe before history/diagnostic pagination so it cannot hide a short reply.
    for (const target of listed) if (needsRunStream(target.status)) this.subscribeRun(target)
    const targets = new Map(listed.map(target => [target.runId, target]))
    for (const message of messages) {
      const meta = messageMetadata(message), view = meta.harness
      if (meta.senderKind !== 'agent' || meta.messageKind !== 'text' || !meta.runId || !view || targets.has(meta.runId)) continue
      targets.set(meta.runId, { conversationId, agentId: meta.senderId, runId: meta.runId,
        ...(meta.threadRootId ? { threadId: meta.threadRootId } : {}),
        requestVersion: view.requestVersion, fence: view.fence, status: view.lifecycle ?? 'queued' })
    }
    const reads = [...targets.values()].filter(target => {
      if (needsRunStream(target.status) || this.runStreams.has(target.runId)) return false
      const meta = messages.map(messageMetadata).find(meta => meta.runId === target.runId && isRunMessage(meta))
      const view = meta?.harness
      return !view || meta.harnessControl === undefined || view.requestVersion !== target.requestVersion
        || view.fence !== target.fence || view.lifecycle !== target.status || view.delivery === 'pending'
    }).map(async target => ({ target, response: await this.readRun({ conversationId: target.conversationId,
      agentId: target.agentId, runId: target.runId, ...(target.threadId ? { threadId: target.threadId } : {}) }, request) }))
    const results = await Promise.allSettled(reads)
    return results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  }

  private async hydrateConversation(conversationId: string, request: RequestContext): Promise<void> {
    try {
      const messages = useChatThreadStore.getState().conversations[conversationId]?.messages ?? []
      const snapshots = await this.readRunSnapshots(conversationId, messages, request)
      if (!request.current()) return
      if (snapshots.length) updateConversation(conversationId, current => this.applyRunSnapshots(current, snapshots))
      this.syncRunStreams(conversationId)
    } catch (error) {
      if (request.current()) console.warn('[chat.transport] run hydration failed', error)
    }
  }

  private applyRunSnapshots(state: ConversationChatState, snapshots: Array<{ target: AgentRunTarget; response: AgentRunResponse }>) {
    for (const { target, response } of snapshots.sort((a, b) => (a.response.createdAt ?? '').localeCompare(b.response.createdAt ?? ''))) {
      state = applyRunSnapshot(state, target, response, useParticipants.getState().byId[target.agentId])
    }
    return { ...state, messages: projectMessageGroups(state.messages) }
  }

  private syncRunStreams(conversationId: string): void {
    for (const message of useChatThreadStore.getState().conversations[conversationId]?.messages ?? []) {
      const meta = messageMetadata(message), view = meta.harness
      if (view && meta.runId && meta.messageKind === 'text' && needsRunStream(view.lifecycle, view.delivery)) {
        this.subscribeRun({ conversationId, agentId: meta.senderId, runId: meta.runId,
          ...(meta.threadRootId ? { threadId: meta.threadRootId } : {}) })
      }
    }
  }

  private async discoverRuns(): Promise<void> {
    if (this.discovering?.current() || this.connection.signal.aborted) return
    const request = this.captureRequest()
    this.discovering = request
    try {
      for (const [conversationId,state] of Object.entries(useChatThreadStore.getState().conversations)) {
        if (!state.loaded) continue
        await this.hydrateConversation(conversationId, request)
        if (!request.current()) return
      }
    } catch { /* Existing streams reconnect independently; discovery retries on the next tick. */ }
    finally { if (this.discovering === request) this.discovering = undefined }
  }

  private subscribeRun(target: AgentRunTarget): void {
    if (!this.includesChannel(target.conversationId) || this.connection.signal.aborted || this.runStreams.has(target.runId)) return
    if (this.runStreams.size >= 128) {
      const oldest = this.runStreams.keys().next().value!
      this.runStreams.get(oldest)?.abort(); this.runStreams.delete(oldest)
    }
    const request = this.captureRequest(), controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, request.signal])
    this.runStreams.set(target.runId, controller)
    void (async () => {
      let failures = 0
      while (!signal.aborted && request.current()) {
        let latest: AgentRunSnapshot | undefined
        try {
          await harnessApi.subscribe(target, snapshot => {
            if (!request.current() || signal.aborted) return
            failures = 0
            if (snapshot.sourceRef && snapshot.sourceRef !== latest?.sourceRef) chatLatency.bind(target.runId, snapshot.sourceRef)
            const text = snapshot.content.filter(part => part.type === 'text').map(part => part.text).join('')
            if (snapshot.status.type === 'running' && text) chatLatency.preview(target.runId, snapshot.view.lastSeq, text.length)
            if (latest?.content.length && !snapshot.content.length) chatLatency.reset(target.runId, 'retracted')
            if (snapshot.view.message && !latest?.view.message) chatLatency.completed(target.runId)
            latest = snapshot
            updateConversation(target.conversationId, state => applyRunSnapshot(state, target, snapshot, useParticipants.getState().byId[target.agentId]))
          }, signal)
          if (!latest || needsRunStream(latest.view.lifecycle, latest.view.delivery)) throw new Error('运行流提前结束')
          return
        } catch (error) {
          if (signal.aborted || !request.current()) return
          chatLatency.disconnected(target.runId)
          const inaccessible = /[（(]40[134][）)]/.test(String(error))
          updateConversation(target.conversationId, state => ({ ...state, messages: state.messages.map(message => {
            const meta = messageMetadata(message)
            if (meta.runId !== target.runId || !isRunMessage(meta)) return message
            return { ...message, metadata: { ...message.metadata, custom: { ...meta,
              ...(inaccessible ? { harnessControl: false, memory: undefined } : {}),
              harnessError: inaccessible ? '无权读取任务进度。' : '连接已中断，正在重新连接…',
            } } } as ThreadMessage
          }) }))
          if (inaccessible) return
        }
        // Retry this protocol only. Abort also releases the pending backoff timer.
        await new Promise<void>(resolve => {
          const done = () => { window.clearTimeout(timer); signal.removeEventListener('abort', done); resolve() }
          const timer = window.setTimeout(done, Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5)))
          signal.addEventListener('abort', done, { once: true })
          if (signal.aborted) done()
        })
      }
    })().finally(() => {
      if (this.runStreams.get(target.runId) === controller) this.runStreams.delete(target.runId)
    })
  }

  private applyWorkspaceEvent(event: WsEvent): void {
    if (event.type === 'agent.run.available') {
      const state = useChatThreadStore.getState().conversations[event.conversationId]
      if (event.companyId === getActiveCompanyId() && (state?.loaded || state?.isLoading)) {
        const target = { conversationId: event.conversationId, agentId: event.agentId, runId: event.runId,
          ...(event.threadId ? { threadId: event.threadId } : {}) }
        this.subscribeRun(target)
      }
      return
    }
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
    if (event.type === 'message.reactions') {
      replaceMessageReactions(event.conversationId, event.messageId, event.reactions)
      return
    }
    if (event.type === 'poll.updated') {
      replacePollData(event.conversationId, event.messageId, event.revision, event.poll, event.tallies)
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
        await this.retry(entry.conversationId, entry.clientMessageId)
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
  return projectMessageGroups(messages.filter(message => messageMetadata(message).messageKind !== 'tool_activity'
    && (!threadRootId || message.id === threadRootId || messageMetadata(message).quotedMessageId === threadRootId)))
}
