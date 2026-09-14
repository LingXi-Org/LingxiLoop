import type { AppendMessage, ThreadMessage, ThreadUserMessagePart } from '@assistant-ui/react'
import { consumeRunEvent, consumeRunState, consumeRunStreamEvent, createRunView, type RunStreamEvent } from '@lyyzka/lingxios/ui'
import type { ApiAttachment, WsEvent } from '@/api/contracts'
import { ws } from '@/api/core/realtime'
import { agentsApi } from '@/features/agents/api'
import { useParticipants } from '@/features/agents/state'
import { messagesApi } from '@/features/chat/api'
import { toastAction } from '@/lib/actionToast'
import { hasBroadcastMention } from '@/lib/chatMessages'
import {
  type ImEnvelope,
  type LingxiMessageV1,
  lingxiIm,
} from '@/lib/im/wukong'
import { userFacingError } from '@/lib/userFacingError'
import { getMeId } from '@/stores/auth'
import { convertEnvelope, convertEnvelopeBatch, projectMessageGroups } from './converter'
import { type LingxiMessageMetadata, resolveMessagePresentation } from './model'
import { forgetChatOutbox, readChatOutbox, rememberChatOutbox } from './outbox'
import {
  CHAT_HISTORY_PAGE_SIZE,
  markDelivery,
  mergeCanonicalMessages,
  removeConversationMessage,
  replaceMessageReactions,
  replacePollData,
  resetChatThreadStore,
  setConversationMessages,
  setTypingAgent,
  updateConversation,
  useChatThreadStore,
} from './store'
import { harnessApi, type AgentRunTarget } from './harness-api'
import { harnessParts, harnessStatus, harnessToolParts } from './harness'

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
  private booted = false
  private readonly typingTimers = new Map<string, number>()
  private readonly runStreams = new Map<string, EventSource>()
  private discoveryTimer: number | undefined
  private subscriptions: (() => void)[] = []
  private discovering = false
  private readonly messageListeners = new Set<(message: ThreadMessage) => void>()
  private connection = new AbortController()
  private readonly runReads = new Map<string, Promise<void>>()

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
    this.runReads.clear()
    lingxiIm.disconnect()
    for (const timer of this.typingTimers.values()) window.clearTimeout(timer)
    this.typingTimers.clear()
    for (const stream of this.runStreams.values()) stream.close()
    this.runStreams.clear()
    window.clearInterval(this.discoveryTimer)
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
      for (const message of useChatThreadStore.getState().conversations[conversationId]?.messages ?? []) {
        const meta = messageMetadata(message)
        if (meta.senderKind === 'agent' && meta.messageKind === 'text' && meta.runId) void this.refreshRun({ conversationId,
          agentId: meta.senderId, runId: meta.runId, ...(meta.threadRootId ? { threadId: meta.threadRootId } : {}) })
      }
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
  ): Promise<boolean> {
    const text = body.trim()
    if (!text && !attachment) return false
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
        agentMode: useChatThreadStore.getState().conversations[conversationId]?.agentMode ?? 'execute',
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
    const state = useChatThreadStore.getState().conversations[conversationId]
    await Promise.all(Object.values(state?.activeRuns ?? {}).map(run => {
      const message = state?.messages.find(message => message.id === run.messageId)
      const threadId = message && messageMetadata(message).threadRootId
      return harnessApi.cancel({ conversationId,agentId: run.agentId,runId: run.id,...threadId ? { threadId } : {} })
    }))
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

  refreshRun(target: AgentRunTarget): Promise<void> {
    const key = JSON.stringify(target), pending = this.runReads.get(key)
    if (pending) return pending
    const signal = AbortSignal.any([this.connection.signal,AbortSignal.timeout(30_000)])
    const read = async () => {
      for (let page = 0; page < 8 && !signal.aborted; page++) {
        const current = useChatThreadStore.getState().conversations[target.conversationId]?.messages
          .find(message => messageMetadata(message).runId === target.runId && messageMetadata(message).messageKind === 'text')
        if (!current) return
        const afterSeq = messageMetadata(current).harnessReplaySeq ?? 0
        const response = await harnessApi.read(target,afterSeq,signal)
        if (signal.aborted) return
        if (['queued','leased','waiting'].includes(response.run.status)) {
          if (this.runStreams.get(target.runId)?.readyState === EventSource.CLOSED) this.runStreams.delete(target.runId)
          this.subscribeRun(target)
        }
        updateConversation(target.conversationId,state => {
          const activeRuns = { ...state.activeRuns }
          const messages = state.messages.map(message => {
            const meta = messageMetadata(message)
            if (message.role !== 'assistant' || meta.runId !== target.runId || meta.messageKind !== 'text') return message
            let view = meta.harness ?? createRunView(target.runId)
            for (const event of response.events) view = consumeRunEvent(view,event)
            view = consumeRunState(view,response)
            if (view.lifecycle === 'queued' || view.lifecycle === 'leased') {
              activeRuns[message.id] = { id: target.runId, agentId: target.agentId, messageId: message.id,
                lastSequence: view.lastSeq, state: view.lifecycle === 'queued' ? 'queued' : 'running' }
            } else for (const [id,run] of Object.entries(activeRuns)) if (run.id === target.runId) delete activeRuns[id]
            return { ...message, status: harnessStatus(view), content: harnessParts(view), metadata: { ...message.metadata,
              custom: { ...meta, harness: view, harnessTools: harnessToolParts(target.runId,response.events,meta.harnessTools), harnessReplaySeq: response.nextSeq, harnessControl: response.canControl, harnessError: response.run.error ?? undefined,
                unresolvedActions: response.diagnostics?.actions.filter(action => !action.result || action.result.executionState === 'unknown')
                  .map(({ actionKey,action }) => ({ actionKey,action })) ?? [] } } } as ThreadMessage
          })
          return { ...state, messages, activeRuns }
        })
        if (response.events.length < 100 || response.nextSeq <= afterSeq) return
      }
    }
    const promise = read().catch(error => {
      if (signal.aborted) return
      updateConversation(target.conversationId,state => ({ ...state, messages: state.messages.map(message => {
        const meta = messageMetadata(message)
        if (meta.runId !== target.runId || meta.messageKind !== 'text') return message
        const inaccessible = /\(40[134]\)/.test(String(error))
        return { ...message, metadata: { ...message.metadata, custom: { ...meta,
          ...(inaccessible ? { harnessControl: false } : {}), harnessError: inaccessible ? undefined : '运行状态暂时无法同步，请重试' } } } as ThreadMessage
      }) }))
    }).finally(() => { if (this.runReads.get(key) === promise) this.runReads.delete(key) })
    this.runReads.set(key,promise)
    return promise
  }

  private commitEnvelope(envelope: ImEnvelope): void {
    if (this.connection.signal.aborted) return
    try {
      const message = convertEnvelope(envelope, conversionContext())
      const metadata = messageMetadata(message)
      forgetChatOutbox(envelope.clientMsgNo || metadata.clientMessageId)
      let accepted = true
      updateConversation(envelope.channelId, (state) => {
        const messages = mergeCanonicalMessages(state.messages, [message])
        const merged = metadata.runId && messages.find(value => messageMetadata(value).runId === metadata.runId && messageMetadata(value).messageKind === 'text')
        const view = merged && messageMetadata(merged).harness
        if (metadata.harness && view && view.resultId !== metadata.harness.resultId) { accepted = false; return state }
        const reconcilesStream = metadata.senderKind === 'agent' && metadata.messageKind === 'text' && Boolean(metadata.runId)
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

  private async discoverRuns(): Promise<void> {
    if (this.discovering || this.connection.signal.aborted) return
    this.discovering = true
    try {
      for (const [conversationId,state] of Object.entries(useChatThreadStore.getState().conversations)) {
        if (!state.loaded) continue
        const targets = await harnessApi.list(conversationId,this.connection.signal)
        for (const target of targets) {
          const stream = this.runStreams.get(target.runId)
          const message = useChatThreadStore.getState().conversations[conversationId]?.messages.find(item => messageMetadata(item).runId === target.runId)
          const view = message && messageMetadata(message).harness
          if (stream?.readyState === EventSource.CLOSED && (!view || view.requestVersion !== target.requestVersion || view.fence !== target.fence || view.lifecycle !== target.status)) {
            this.runStreams.delete(target.runId)
          }
          this.subscribeRun({ ...target, threadId: target.threadId || undefined })
        }
      }
    } catch { /* Native EventSource reconnects existing runs; discovery retries on the next tick. */ }
    finally { this.discovering = false }
  }

  private subscribeRun(target: AgentRunTarget): void {
    const key = target.runId
    if (this.runStreams.has(key) || this.connection.signal.aborted) return
    if (this.runStreams.size >= 128) {
      const oldest = this.runStreams.keys().next().value!
      this.runStreams.get(oldest)?.close(); this.runStreams.delete(oldest)
    }
    const stream = harnessApi.subscribe(target,item => this.applyRunStreamEvent(target,item),() => {
      if (!this.connection.signal.aborted) void this.refreshRun(target)
    })
    this.runStreams.set(key,stream)
  }

  private applyRunStreamEvent(target: AgentRunTarget, item: RunStreamEvent): void {
    if (this.connection.signal.aborted) return
    const participant = useParticipants.getState().byId[target.agentId]
    if (participant?.kind !== 'agent') return
    let reconnect = false
    updateConversation(target.conversationId,state => {
      const current = state.messages.find(message => messageMetadata(message).runId === target.runId && messageMetadata(message).messageKind === 'text')
      const before = current && messageMetadata(current)
      const previous = before?.harness ?? createRunView(target.runId)
      const view = consumeRunStreamEvent(previous,item)
      reconnect = item.type === 'preview' && item.preview.kind === 'delta' && view !== previous && view.preview === null
      const content = harnessParts(view)
      const id = current?.id ?? `preview-${target.runId}`
      const metadata: LingxiMessageMetadata = {
        schema: 'lingxiloop.thread-message.v1', conversationId: target.conversationId, clientMessageId: id,
        sequence: null, senderId: target.agentId, senderName: participant.name, senderKind: 'agent',
        senderAvatarUrl: participant.avatarUrl ?? null, isMine: false, delivery: 'sent', messageKind: 'text',
        presentation: 'conversation', quotedMessageId: target.threadId ?? null, quote: null, reactions: [], replyCount: 0,
        threadRootId: target.threadId ?? null, groupStart: true, groupEnd: true, continuedFromPrevious: false,
        continuedToNext: false, clusterChromeAt: null, ...before,
        runId: target.runId, harness: view, harnessTools: item.type === 'event' ? harnessToolParts(target.runId,[item.event],before?.harnessTools) : before?.harnessTools,
        harnessReplaySeq: view.lastSeq, harnessError: undefined,
      }
      const message: ThreadMessage = { id, role: 'assistant', createdAt: current?.createdAt ?? new Date(),
        content, status: harnessStatus(view), metadata: { unstable_state: null, unstable_annotations: [], unstable_data: [], steps: [], ...current?.metadata, custom: metadata } }
      const activeRuns = { ...state.activeRuns }
      for (const [key,run] of Object.entries(activeRuns)) if (run.id === target.runId) delete activeRuns[key]
      if (view.lifecycle === 'queued' || view.lifecycle === 'leased') activeRuns[id] = {
        id: target.runId, agentId: target.agentId, messageId: id, lastSequence: view.lastSeq,
        state: view.lifecycle === 'queued' ? 'queued' : 'running',
      }
      return { ...state, activeRuns, messages: projectMessageGroups(state.messages.filter(existing => existing.id !== id).concat(message)) }
    })
    if (reconnect) {
      this.runStreams.get(target.runId)?.close()
      this.runStreams.delete(target.runId)
      this.subscribeRun(target)
    }
    if (item.type === 'state') void this.refreshRun(target)
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
