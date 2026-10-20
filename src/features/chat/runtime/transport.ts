import { createNativeMessage, nativeText, nativeAttachments } from '@/lib/nativeMessage'
import { questionnairesApi, type QuestionnaireAnswers, type QuestionnaireState } from '@/api/questionnaires'
import type { AppendMessage, ThreadMessage } from '@assistant-ui/react'
import type { AgentRunSnapshot, RunDisplayState } from '@/lib/agentRunSnapshot'
import type { ApiAttachment, WsEvent } from '@/api/contracts'
import { ws } from '@/api/core/realtime'
import { agentsApi } from '@/features/agents/api'
import { useParticipants } from '@/features/agents/state'
import { messagesApi } from '@/features/chat/api'
import { toastAction } from '@/lib/actionToast'
import { hasBroadcastMention } from '@/lib/chatMessages'
import { canonicalizeMentions, parseMentions } from '@/lib/mentions'
import { useConversations } from '@/features/conversations/store'
import {
  type ImEnvelope,
  type NativeMessage,
  lingxiIm,
} from '@/lib/im/wukong'
import { userFacingError } from '@/lib/userFacingError'
import { getActiveCompanyId, getMeId } from '@/stores/auth'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { convertEnvelope, convertEnvelopeBatch, projectMessageGroups } from './converter'
import type { LingxiMessageMetadata } from './model'
import { forgetChatOutbox, readChatOutbox, rememberChatOutbox, type ChatOutboxEntry } from './outbox'
import {
  CHAT_HISTORY_PAGE_SIZE,
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
  type ConversationChatState,
} from './store'
import { harnessApi, type AgentRunTarget, type RunHistoryAnchors } from './harness-api'
import { applyRunSnapshot, needsRunStream } from './run-updates'
import { canCancelRun, isOlderRun, isRunMessage } from './harness'
import { attachmentMessage, uploadedAttachment } from './attachment-messages'
import { chatLatency } from './latency'
import { OUTBOX_RECOVERY, RUN_RECOVERY, permanentRecoveryError, retryDelay, waitForRecovery } from './recovery'
import { registerAuthTeardown } from '@/stores/authTeardown'

const TYPING_STALE_MS = 45_000

type UploadedAttachment = ApiAttachment & { key?: string }
type RequestContext = { signal: AbortSignal; identity: string; current: () => boolean }
type RunTargets = Awaited<ReturnType<typeof harnessApi.list>>
type RunRecovery = { targets: RunTargets; snapshots: { target: AgentRunTarget; snapshot: AgentRunSnapshot }[]; error: string | null }
type OutboxRecovery = { request: RequestContext; deadline: number; passes: number; attempts: Map<string, number>;
  cursor: number; running: boolean; timer?: number }

function restoreStoppedRuns(state: ConversationChatState, recovery: RunRecovery): ConversationChatState {
  for (const { target, snapshot } of recovery.snapshots) {
    state = applyRunSnapshot(state, target, snapshot, useParticipants.getState().byId[target.agentId])
  }
  return { ...state, error: recovery.error }
}

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

function mentionRoster(conversationId: string) {
  const members = useConversations.getState().list.find(room => room.id === conversationId)?.members ?? []
  return Object.values(useParticipants.getState().byId).filter(participant => members.includes(participant.id))
}

function mentionedAgentIds(body: string, conversationId: string): string[] {
  return parseMentions(body, mentionRoster(conversationId)).mentionedIds.filter(id => useParticipants.getState().byId[id]?.kind === 'agent')
}

function optimisticMessage(conversationId: string, payload: NativeMessage): ThreadMessage {
  const authorId = getMeId()
  if (!authorId) throw new Error('Chat send requires an authenticated user')
  const message = convertEnvelope({ channelId: conversationId, channelType: 2, fromUid: authorId, messageId: '',
    clientMsgNo: payload.id, messageSeq: 0, timestamp: Date.parse(payload.createdAt) / 1000, payload },conversionContext())
  return { ...message, metadata: { ...message.metadata, isOptimistic: true,
    custom: { ...message.metadata.custom, delivery: 'sending' } } } as ThreadMessage
}

function oldestSequence(messages: readonly ThreadMessage[]): number | null {
  const values = messages
    .map((message) => messageMetadata(message).sequence)
    .filter((value): value is number => value !== null && value > 0)
  return values.length > 0 ? Math.min(...values) : null
}

function historyAnchors(envelopes: readonly ImEnvelope[]): RunHistoryAnchors {
  const sourceClientMsgNos = new Set<string>(), runIds = new Set<string>()
  for (const envelope of envelopes) {
    if (envelope.clientMsgNo) sourceClientMsgNos.add(envelope.clientMsgNo)
    const refs = envelope.payload.metadata.custom.refs
    const runId = refs && typeof refs === 'object' ? Reflect.get(refs,'runId') : undefined
    if (typeof runId === 'string' && runId) runIds.add(runId)
    // Durable terminal notifications are system IM messages with custom.runId,
    // even when no assistant result/refs could ever be committed.
    const terminalRun = envelope.payload.metadata.custom.runId
    if (envelope.payload.role !== 'user' && typeof terminalRun === 'string' && terminalRun) runIds.add(terminalRun)
  }
  return { sourceClientMsgNos: [...sourceClientMsgNos],runIds: [...runIds] }
}

export class ChatTransport {
  private readonly cancellations = new Map<string, Promise<void>>()
  private booted = false
  private readonly typingTimers = new Map<string, number>()
  private readonly runStreams = new Map<string, AbortController>()
  private subscriptions: (() => void)[] = []
  private discovering: RequestContext | undefined
  private readonly messageListeners = new Set<(message: ThreadMessage) => void>()
  private connection = new AbortController()
  private workspaceIdentity: string | null = null
  private workspaceChannels: Set<string> | null = null
  private readonly historyRequests = new Map<string, RequestContext>()
  private readonly initialLoads = new Map<string, { request: RequestContext; controller: AbortController; promise: Promise<void>; historyReady: boolean; trailingReload?: Promise<void> }>()
  private outboxRecovery: OutboxRecovery | undefined
  private readonly sends = new Map<string, { request: RequestContext; promise: Promise<boolean> }>()
  private readonly blockedRuns = new Set<string>()
  private readonly questionnaireSubmissions = new Map<string, Promise<QuestionnaireState>>()

  boot(): void {
    if (this.connection.signal.aborted) this.connection = new AbortController()
    if (this.booted) return
    resetChatThreadStore()
    this.booted = true
    this.subscriptions.push(lingxiIm.subscribe((envelope) => this.commitEnvelope(envelope)))
    void lingxiIm.connect().catch((error) => console.warn('[chat.transport] IM connect failed', error))
    this.subscriptions.push(lingxiIm.onConnected(() => this.recoverConnection()))
    const online = () => this.recoverConnection()
    window.addEventListener('online', online)
    this.subscriptions.push(() => window.removeEventListener('online', online))
    this.wakeOutbox()
    void ws.connect()
    this.subscriptions.push(ws.on((event) => this.applyWorkspaceEvent(event)))
    void this.discoverRuns()
  }

  disconnect(): void {
    this.booted = false
    for (const unsubscribe of this.subscriptions) unsubscribe()
    this.subscriptions = []
    this.connection.abort()
    this.questionnaireSubmissions.clear()
    this.cancelRecovery()
    this.workspaceIdentity = null; this.workspaceChannels = null
    chatLatency.clear()
    this.historyRequests.clear()
    this.initialLoads.clear()
    lingxiIm.disconnect()
    for (const timer of this.typingTimers.values()) window.clearTimeout(timer)
    this.typingTimers.clear()
    for (const stream of this.runStreams.values()) stream.abort()
    this.runStreams.clear()
    resetChatThreadStore()
  }

  setWorkspaceChannels(channelIds: Iterable<string>): void {
    const channels = new Set(channelIds), identity = this.requestIdentity()
    const changed = this.workspaceIdentity !== identity
    const revoked = this.workspaceChannels && [...this.workspaceChannels].some(id => !channels.has(id))
    const interrupted = !changed && revoked ? Object.entries(useChatThreadStore.getState().conversations)
      .filter(([id, state]) => channels.has(id) && (state.isLoading || state.isLoadingOlder || this.initialLoads.has(id)))
      .map(([id, state]) => ({ id, state, hadInitialLoad: this.initialLoads.has(id) })) : []
    if (changed || revoked) {
      // A fresh signal is the scope generation: A → B → A cannot revive an A request.
      this.connection.abort(); this.connection = new AbortController()
      this.cancelRecovery()
      this.historyRequests.clear()
      this.initialLoads.clear()
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
    if (this.booted) {
      this.wakeOutbox()
      if (changed) void lingxiIm.connect().catch(() => {})
    }
    if (changed || revoked) for (const id of Object.keys(useChatThreadStore.getState().conversations)) this.syncRunStreams(id)
    // The mounted runtime only loads on conversation changes, so resume work canceled by scope revocation here.
    for (const { id, state, hadInitialLoad } of interrupted) {
      // Initial recovery and older pagination can overlap after history paints.
      // Resume both: restarting only the older page loses deferred initial rows.
      if (hadInitialLoad || state.isLoading) {
        if (state.loaded) void this.reloadConversation(id)
        else void this.loadConversation(id)
      }
      if (state.isLoadingOlder) void this.loadOlder(id)
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

  cancelConversationLoad(conversationId: string): void {
    const loading = this.initialLoads.get(conversationId)
    // Once history is visible, let its bounded recovery finish in the scoped
    // cache. Cancelling that enrichment would leave a warm revisit incomplete.
    if (!loading || loading.historyReady) return
    loading.controller.abort()
    this.initialLoads.delete(conversationId)
    if (this.historyRequests.get(conversationId) === loading.request) this.historyRequests.delete(conversationId)
    updateConversation(conversationId, state => ({ ...state, isLoading: false }))
  }

  loadConversation(conversationId: string): Promise<void> {
    if (!this.includesChannel(conversationId)) return Promise.resolve()
    const pending = this.initialLoads.get(conversationId)
    if (pending?.request.current()) return pending.promise
    const current = useChatThreadStore.getState().conversations[conversationId]
    if (current?.loaded) return Promise.resolve()
    return this.fetchConversation(conversationId)
  }

  reloadConversation(conversationId: string): Promise<void> {
    if (!this.includesChannel(conversationId)) return Promise.resolve()
    const pending = this.initialLoads.get(conversationId)
    if (pending?.request.current()) {
      if (!pending.historyReady) return pending.promise
      // A reconnect/sidebar invalidation after HTTP completed needs one fresh
      // page. Coalesce that follow-up without losing it behind slow recovery.
      pending.trailingReload ??= pending.promise.then(() => {
        if (pending.request.current()) return this.reloadConversation(conversationId)
      })
      return pending.trailingReload
    }
    return this.fetchConversation(conversationId)
  }

  private fetchConversation(conversationId: string): Promise<void> {
    const scope = this.captureRequest(), controller = new AbortController()
    const signal = AbortSignal.any([scope.signal, controller.signal])
    const request = { ...scope, signal, current: () => !signal.aborted && scope.current() }
    this.historyRequests.set(conversationId, request)
    updateConversation(conversationId, state => ({ ...state, isLoading: !state.loaded || (Boolean(state.error) && state.messages.length === 0), error: null }))
    const promise = (async () => {
      try {
        const envelopes = await lingxiIm.history(conversationId, CHAT_HISTORY_PAGE_SIZE, undefined, signal)
        if (!request.current()) return
        const messages = convertEnvelopeBatch(envelopes, conversionContext())
        const deferred = messages.filter(message => isRunMessage(messageMetadata(message))
          && (message.status?.type === 'running' || message.status?.type === 'requires-action'))
        const deferredIds = new Set(deferred.map(message => message.id))
        // Durable IM history is readable before optional run recovery completes.
        // Unconfirmed running rows wait for reconciliation so a stopped run cannot
        // flash as active. Already-live store messages remain untouched.
        // Merge against the latest store so live deliveries cannot be overwritten.
        updateConversation(conversationId, state => ({ ...state,
          messages: mergeCanonicalMessages(state.messages, messages.filter(message => !deferredIds.has(message.id))),
          loaded: true, isLoading: false, isRecovering: deferred.length > 0,
          hasMoreOlder: state.loaded ? state.hasMoreOlder : envelopes.length >= CHAT_HISTORY_PAGE_SIZE,
        }))
        const pending = this.initialLoads.get(conversationId)
        if (pending?.request === request) pending.historyReady = true
        const recovery = await this.readRunRecovery(conversationId, request, historyAnchors(envelopes))
        if (!request.current()) return
        if (deferred.length || recovery.snapshots.length || recovery.error) {
          updateConversation(conversationId, state => restoreStoppedRuns({ ...state, isRecovering: false,
            messages: recovery.error ? state.messages : mergeCanonicalMessages(state.messages, deferred),
          }, recovery))
        }
        this.syncRunStreams(conversationId)
        this.subscribeDiscoveredRuns(conversationId, recovery.targets)
      } catch (error) {
        if (!request.current()) return
        updateConversation(conversationId, state => ({ ...state, isLoading: false, isRecovering: false,
          error: userFacingError(error, '暂时无法加载消息，请稍后重试。') }))
      } finally {
        if (this.historyRequests.get(conversationId) === request) this.historyRequests.delete(conversationId)
        if (this.initialLoads.get(conversationId)?.request === request) this.initialLoads.delete(conversationId)
      }
    })()
    this.initialLoads.set(conversationId, { request, controller, promise, historyReady: false })
    return promise
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
      const envelopes = await lingxiIm.history(conversationId, CHAT_HISTORY_PAGE_SIZE, before, request.signal)
      if (!request.current()) return
      const recovery = await this.readRunRecovery(conversationId, request, historyAnchors(envelopes))
      if (!request.current()) return
      const messages = convertEnvelopeBatch(envelopes, conversionContext())
        .filter((message) => (messageMetadata(message).sequence ?? Number.MAX_SAFE_INTEGER) < before)
      updateConversation(conversationId, (state) => restoreStoppedRuns({
        ...state,
        messages: mergeCanonicalMessages(state.messages, messages),
        isLoadingOlder: false,
        hasMoreOlder: envelopes.length >= CHAT_HISTORY_PAGE_SIZE && messages.length > 0,
      }, recovery))
      this.syncRunStreams(conversationId)
      this.subscribeDiscoveredRuns(conversationId, recovery.targets)
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
      const page = await lingxiIm.history(conversationId, 200, before, request.signal)
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
    const text = canonicalizeMentions(textFromAppend(message), mentionRoster(conversationId))
    const quotedMessageId = threadRootId ?? quoteIdFromAppend(message)
    const payload = attachmentMessage(message.attachments ?? [], text, quotedMessageId,
      { mentionedIds: mentionedAgentIds(text, conversationId), mentionAll: hasBroadcastMention(text) })
    await this.send(conversationId,text,null,quotedMessageId,payload.id,payload)
  }

  async send(
    conversationId: string,
    body: string,
    attachment: UploadedAttachment | null,
    quotedMessageId: string | null,
    clientMessageId = `temp-${crypto.randomUUID()}`,
    replayPayload?: NativeMessage,
  ): Promise<boolean> {
    if (!getMeId() || !getActiveCompanyId() || !this.includesChannel(conversationId)) return false
    const existing = readChatOutbox().find(row => row.clientMessageId === clientMessageId)
    if (existing) {
      if (existing.conversationId !== conversationId || existing.blockedReason) return false
      const sent = await this.deliverOutbox(existing, this.captureRequest(), true)
      if (!sent) this.wakeOutbox()
      return sent
    }
    const text = canonicalizeMentions(body.trim(), mentionRoster(conversationId))
    const payload = replayPayload ?? createNativeMessage({ id: clientMessageId, role: 'user',
      content: text ? [{ type: 'text', text }] : [], attachments: attachment ? [uploadedAttachment(attachment)] : [],
      custom: { ...(quotedMessageId ? { replyToClientMsgNo: quotedMessageId } : {}),
        mentionedIds: mentionedAgentIds(text,conversationId), mentionAll: hasBroadcastMention(text) } })
    if (!nativeText(payload) && !nativeAttachments(payload).length) return false
    if (payload.id !== clientMessageId) throw new Error('消息身份不一致')
    chatLatency.send(clientMessageId)
    setConversationMessages(conversationId, [optimisticMessage(conversationId,payload)])
    const entry: ChatOutboxEntry = {
      conversationId,
      clientMessageId,
      payload,
      createdAt: new Date().toISOString(),
    }
    rememberChatOutbox(entry)
    const sent = await this.deliverOutbox(entry, this.captureRequest(), false)
    if (!sent) this.wakeOutbox()
    return sent
  }

  async retry(conversationId: string, messageId: string): Promise<void> {
    const entry = readChatOutbox().find((row) => row.clientMessageId === messageId)
    if (!entry || entry.conversationId !== conversationId || !this.includesChannel(conversationId)) throw new Error('消息暂不可重试。')
    const retry = { ...entry, blockedReason: undefined }
    rememberChatOutbox(retry)
    markDelivery(conversationId, messageId, 'sending')
    const sent = await this.deliverOutbox(retry, this.captureRequest(), true)
    if (!sent) this.wakeOutbox()
    if (!sent) throw new Error('消息尚未发送，请重试。')
  }

  discard(conversationId: string, messageId: string): void {
    // A send already in flight can still be accepted. Keep it visible until it
    // settles instead of pretending that deleting local state cancels the send.
    if (this.sends.get(messageId)?.request.current()) return
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
    const result = await messagesApi.toggleReaction(conversationId, messageMetadata(message).imMessageId ?? messageId, sequence, emoji)
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

  async readQuestionnaire(conversationId: string, questionId: string, signal?: AbortSignal): Promise<QuestionnaireState> {
    const request = this.captureRequest()
    if (!getMeId() || !getActiveCompanyId() || !this.includesChannel(conversationId)) throw new Error('这条消息不可回复')
    const state = await questionnairesApi.read(conversationId, questionId, signal ? AbortSignal.any([signal, request.signal]) : request.signal)
    if (!request.current()) throw new Error('登录或工作区已变化，请重新载入')
    return state
  }

  answerQuestionnaire(conversationId: string, questionId: string, answers: QuestionnaireAnswers): Promise<QuestionnaireState> {
    const request = this.captureRequest()
    const key = JSON.stringify([request.identity, conversationId, questionId])
    const existing = this.questionnaireSubmissions.get(key)
    if (existing) return existing
    const operation = (async () => {
      // Reconcile a lost submit receipt before retrying the same durable question.
      const current = await this.readQuestionnaire(conversationId, questionId)
      if (!request.current()) throw new Error('登录或工作区已变化，请重新载入')
      if (current.status === 'submitted' || current.status === 'resuming' && !current.retryable) return current
      if (current.status !== 'pending' && current.status !== 'resuming' && (current.status !== 'waiting' || current.readOnly)) throw new Error('这份问卷已不可提交')
      const accepted = await questionnairesApi.submit(conversationId, questionId, current.status === 'pending' || current.status === 'resuming' ? current.answers : answers, request.signal)
      if (!request.current()) throw new Error('登录或工作区已变化，请重新载入')
      const echo = accepted.echo
      if (echo.channelId !== conversationId || echo.fromUid !== getMeId() || echo.messageId === '0'
        || echo.clientMsgNo !== echo.payload.id
        || (echo.payload.metadata.custom.questionnaireReply as { questionId?: unknown } | undefined)?.questionId !== questionId) throw new Error('提交回执待核对')
      this.commitEnvelope(echo)
      const saved = await this.readQuestionnaire(conversationId, questionId)
      if (saved.status !== 'submitted' && saved.status !== 'pending' && saved.status !== 'resuming') throw new Error('提交状态待确认，请重试')
      return saved
    })().finally(() => { if (this.questionnaireSubmissions.get(key) === operation) this.questionnaireSubmissions.delete(key) })
    this.questionnaireSubmissions.set(key, operation)
    return operation
  }

  async answerRecommendation(conversationId: string, questionId: string, answers: Record<string, string | string[]>): Promise<void> {
    const userId = getMeId(), companyId = getActiveCompanyId()
    if (!userId || !companyId) throw new Error('请先登录后回复卡片')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([companyId, conversationId, userId, questionId])))
    const id = 'q-' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const text = `问答卡片回复：\n${Object.entries(answers).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join('\n')}`
    const sent = await this.send(conversationId, text, null, questionId, id, createNativeMessage({ id, role: 'user', content: [{ type: 'text', text }],
      custom: { replyToClientMsgNo: questionId, recommendationReply: { questionId, answers } } }))
    if (!sent) throw new Error('卡片回复尚未发送，请重试')
  }

  async votePoll(messageId: string, optionIds: string[]): Promise<void> {
    await messagesApi.castPollVote(messageId, optionIds)
  }

  async continueRun(target: AgentRunTarget, text: string, requestVersion: number): Promise<void> {
    const clientMsgNo = `temp-${crypto.randomUUID()}`
    const accepted = await this.send(target.conversationId,text,null,target.threadId ?? null,clientMsgNo,createNativeMessage({
      id: clientMsgNo, role: 'user', content: [{ type: 'text', text: text.trim() }],
      custom: { ...(target.threadId ? { replyToClientMsgNo: target.threadId } : {}), mentionedIds: [target.agentId],
        agentContinuation: { runId: target.runId, agentId: target.agentId, requestVersion } },
    }))
    if (!accepted) throw new Error('补充信息尚未发送，可在消息中重试')
    await harnessApi.continue(target,clientMsgNo,requestVersion)
  }

  async refreshRun(target: AgentRunTarget): Promise<void> {
    if (!this.includesChannel(target.conversationId)) return
    this.runStreams.get(target.runId)?.abort()
    this.runStreams.delete(target.runId)
    this.blockedRuns.delete(target.runId)
    this.subscribeRun(target)
  }

  private commitEnvelope(envelope: ImEnvelope): void {
    if (this.connection.signal.aborted || !this.includesChannel(envelope.channelId)) return
    try {
      const message = convertEnvelope(envelope, conversionContext())
      const metadata = messageMetadata(message)
      if (metadata.isMine && envelope.messageSeq > 0) forgetChatOutbox(envelope.clientMsgNo || metadata.clientMessageId)
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
      this.syncRunStreams(envelope.channelId)
    } catch (error) {
      console.error('[chat.transport] rejected unsupported WuKong message', error, {
        channelId: envelope.channelId,
        messageId: envelope.messageId,
        role: envelope.payload.role,
      })
      updateConversation(envelope.channelId, (state) => ({
        ...state,
        error: userFacingError(error, '这条消息暂时无法显示。'),
      }))
    }
  }

  private async readRunRecovery(conversationId: string, request: RequestContext, anchors?: RunHistoryAnchors): Promise<RunRecovery> {
    const recovery: RunRecovery = { targets: [], snapshots: [], error: null }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)])
    try {
      const [recent, historical] = await Promise.all([harnessApi.list(conversationId,signal),
        anchors && (anchors.sourceClientMsgNos.length || anchors.runIds.length) ? harnessApi.history(conversationId,anchors,signal) : []])
      recovery.targets = [...new Map([...recent,...historical].map(target => [target.runId,target])).values()]
      if (!request.current()) return recovery
      // Stopped runs may have no committed IM message. Hydrate their durable
      // snapshot without holding already-readable messages behind diagnostics.
      const snapshots = await Promise.all(recovery.targets.map(async target => {
        if (target.status !== 'failed' && target.status !== 'cancelled') return null
        try { return { target, snapshot: await harnessApi.read(target, signal) } }
        catch (error) { recovery.error = userFacingError(error, '任务进度暂不可用，请刷新。'); return null }
      }))
      recovery.snapshots = snapshots.filter((item): item is NonNullable<typeof item> => item !== null)
    } catch (error) { recovery.error = userFacingError(error, '任务进度暂不可用，请刷新。') }
    return recovery
  }

  private async discoverConversationRuns(conversationId: string, request: RequestContext): Promise<void> {
    const recovery = await this.readRunRecovery(conversationId, request)
    if (!request.current()) return
    updateConversation(conversationId, state => restoreStoppedRuns(state, recovery))
    this.subscribeDiscoveredRuns(conversationId, recovery.targets)
  }

  private subscribeDiscoveredRuns(conversationId: string, targets: RunTargets): void {
    const messages = useChatThreadStore.getState().conversations[conversationId]?.messages ?? []
    for (const target of targets) {
      const current = messages.map(messageMetadata).find(meta => meta.runId === target.runId && isRunMessage(meta))?.harness
      if (!current || needsRunStream(target.status,current.delivery) || current.requestVersion < target.requestVersion
        || current.fence < target.fence || current.lifecycle !== target.status) this.subscribeRun(target)
    }
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
        await this.discoverConversationRuns(conversationId, request)
        if (!request.current()) return
      }
    } catch (error) { if (request.current()) console.warn('[chat.transport] run discovery failed',error) }
    finally { if (this.discovering === request) this.discovering = undefined }
  }

  private subscribeRun(target: AgentRunTarget): void {
    if (!this.includesChannel(target.conversationId) || this.connection.signal.aborted || this.runStreams.has(target.runId) || this.blockedRuns.has(target.runId)) return
    if (this.runStreams.size >= 128) {
      const oldest = this.runStreams.keys().next().value!
      this.runStreams.get(oldest)?.abort(); this.runStreams.delete(oldest)
    }
    const request = this.captureRequest(), controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, request.signal])
    this.runStreams.set(target.runId, controller)
    let confirmedAt = Date.now(), released = false, waitTimer: number | undefined
    const clearWait = () => { if (waitTimer !== undefined) window.clearTimeout(waitTimer); waitTimer = undefined }
    signal.addEventListener('abort', clearWait, { once: true })
    const uncertain = (inaccessible = false) => {
      released ||= inaccessible || Date.now() - confirmedAt >= RUN_RECOVERY.waitMs
      updateConversation(target.conversationId, state => ({ ...state,
        activeRuns: released ? Object.fromEntries(Object.entries(state.activeRuns).filter(([, run]) => run.id !== target.runId)) : state.activeRuns,
        messages: state.messages.map(message => {
          const meta = messageMetadata(message)
          if (meta.runId !== target.runId || !isRunMessage(meta)) return message
          return { ...message, status: message.role === 'assistant' && message.status?.type === 'running'
            ? { type: 'requires-action', reason: 'interrupt' } : message.status,
            metadata: { ...message.metadata, custom: { ...meta,
              ...(inaccessible ? { harnessControl: false } : {}),
              runConnection: inaccessible ? 'inaccessible' : released ? 'released' : 'checking',
            } } } as ThreadMessage
        }),
      }))
      if (!released && waitTimer === undefined) waitTimer = window.setTimeout(() => {
        waitTimer = undefined
        if (!signal.aborted && request.current()) uncertain()
      }, Math.max(1, RUN_RECOVERY.waitMs - (Date.now() - confirmedAt)))
    }
    const receive = (snapshot: AgentRunSnapshot) => {
      if (!request.current() || signal.aborted) return
      const view = snapshot.message.metadata.custom.harness as RunDisplayState
      const previous = useChatThreadStore.getState().conversations[target.conversationId]?.messages
        .map(messageMetadata).find(meta => meta.runId === target.runId && isRunMessage(meta))?.harness
      if (previous && isOlderRun(previous, view)) return
      updateConversation(target.conversationId, state => applyRunSnapshot(state, target, snapshot, useParticipants.getState().byId[target.agentId]))
      clearWait()
      confirmedAt = Date.now(); released = false
      if (!needsRunStream(view.lifecycle, view.delivery)) controller.abort()
    }
    const failed = (error: unknown) => {
      if (signal.aborted || !request.current()) return
      chatLatency.disconnected(target.runId)
      const inaccessible = permanentRecoveryError(error)
      uncertain(inaccessible)
      if (inaccessible) { this.blockedRuns.add(target.runId); controller.abort() }
    }
    // Poll durable work/result/delivery even while SSE is open: a proxy can
    // silently swallow the terminal frame without closing the connection.
    const polling = (async () => {
      while (!signal.aborted && request.current()) {
        await waitForRecovery(released ? RUN_RECOVERY.backgroundMs : RUN_RECOVERY.pollMs, signal)
        if (signal.aborted || !request.current()) return
        try {
          receive(await harnessApi.read(target, AbortSignal.any([signal, AbortSignal.timeout(RUN_RECOVERY.requestMs)])))
        } catch (error) { failed(error) }
      }
    })()
    const streaming = (async () => {
      let failures = 0
      while (!signal.aborted && request.current()) {
        let latest: AgentRunSnapshot | undefined
        try {
          await harnessApi.subscribe(target, snapshot => {
            if (!request.current() || signal.aborted) return
            const custom = snapshot.message.metadata.custom, view = custom.harness as RunDisplayState
            const previous = latest?.message.metadata.custom.harness as RunDisplayState | undefined
            if (typeof custom.sourceRef === 'string' && custom.sourceRef !== latest?.message.metadata.custom.sourceRef) chatLatency.bind(target.runId, custom.sourceRef)
            const text = nativeText(snapshot.message)
            if (snapshot.message.status?.type === 'running' && text) chatLatency.preview(target.runId, view.lastSeq, text.length)
            if (latest?.message.content.length && !snapshot.message.content.length) chatLatency.reset(target.runId, 'retracted')
            if (view.resultId && !previous?.resultId) chatLatency.completed(target.runId)
            latest = snapshot
            receive(snapshot)
          }, signal)
          if (!signal.aborted) throw new Error('运行流提前结束')
        } catch (error) { failed(error) }
        await waitForRecovery(released ? RUN_RECOVERY.backgroundMs : retryDelay(failures++, 30_000), signal)
      }
    })()
    void Promise.all([polling, streaming]).finally(() => {
      controller.abort()
      signal.removeEventListener('abort', clearWait)
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
      this.recoverConnection()
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

  private cancelRecovery(): void {
    if (this.outboxRecovery?.timer !== undefined) window.clearTimeout(this.outboxRecovery.timer)
    this.outboxRecovery = undefined
    this.sends.clear()
    this.blockedRuns.clear()
  }

  private recoverConnection(): void {
    if (!this.booted) return
    this.wakeOutbox()
    void lingxiIm.connect().catch(() => {})
    void this.discoverRuns()
    for (const id of Object.keys(useChatThreadStore.getState().conversations)) this.syncRunStreams(id)
  }

  private wakeOutbox(): void {
    if (!this.booted || this.connection.signal.aborted || !this.workspaceChannels || !getMeId()) return
    let cycle = this.outboxRecovery
    if (!cycle?.request.current()) {
      cycle = { request: this.captureRequest(), deadline: Date.now() + OUTBOX_RECOVERY.deadlineMs,
        passes: 0, attempts: new Map(), cursor: 0, running: false }
      this.outboxRecovery = cycle
    }
    if (cycle.running) return
    if (cycle.timer !== undefined) window.clearTimeout(cycle.timer)
    cycle.timer = undefined
    void this.recoverOutbox(cycle)
  }

  private async recoverOutbox(cycle: OutboxRecovery): Promise<void> {
    cycle.running = true
    try {
      const entries = readChatOutbox().filter(entry => this.workspaceChannels?.has(entry.conversationId))
      for (const entry of entries) this.restoreOutbox(entry)
      const eligible = entries.filter(entry => !entry.blockedReason
        && (cycle.attempts.get(entry.clientMessageId) ?? 0) < OUTBOX_RECOVERY.attempts)
      // Rotate failed entries behind untouched ones, so a bad first batch
      // cannot starve the rest of the bounded persisted outbox.
      const offset = eligible.length ? cycle.cursor % eligible.length : 0
      const batch = [...eligible.slice(offset), ...eligible.slice(0, offset)].slice(0, OUTBOX_RECOVERY.batch)
      cycle.cursor += batch.length
      for (const entry of batch) {
        if (!cycle.request.current() || Date.now() >= cycle.deadline || cycle.passes >= OUTBOX_RECOVERY.passes) return
        cycle.attempts.set(entry.clientMessageId, (cycle.attempts.get(entry.clientMessageId) ?? 0) + 1)
        await this.deliverOutbox(entry, cycle.request, true, cycle.deadline)
      }
      cycle.passes++
    } finally {
      cycle.running = false
      if (this.outboxRecovery === cycle) {
        const pending = readChatOutbox().some(entry => this.workspaceChannels?.has(entry.conversationId)
          && !entry.blockedReason && (cycle.attempts.get(entry.clientMessageId) ?? 0) < OUTBOX_RECOVERY.attempts)
        if (cycle.request.current() && pending && cycle.passes < OUTBOX_RECOVERY.passes && Date.now() < cycle.deadline) {
          cycle.timer = window.setTimeout(() => { cycle.timer = undefined; void this.recoverOutbox(cycle) },
            Math.min(retryDelay(cycle.passes - 1), cycle.deadline - Date.now()))
        } else this.outboxRecovery = undefined
      }
    }
  }

  private restoreOutbox(entry: ChatOutboxEntry): void {
    const current = useChatThreadStore.getState().conversations[entry.conversationId]
    if (!current?.messages.some(message => messageMetadata(message).clientMessageId === entry.clientMessageId)) {
      setConversationMessages(entry.conversationId, [optimisticMessage(entry.conversationId, entry.payload)])
      this.failOutbox(entry, entry.blockedReason)
    }
  }

  private failOutbox(entry: ChatOutboxEntry, blockedReason?: string): void {
    if (blockedReason) rememberChatOutbox({ ...entry, blockedReason })
    markDelivery(entry.conversationId, entry.clientMessageId, 'failed')
    updateConversation(entry.conversationId, state => ({ ...state, messages: state.messages.map(message =>
      messageMetadata(message).clientMessageId === entry.clientMessageId ? { ...message,
        metadata: { ...message.metadata, custom: { ...message.metadata.custom,
          sendError: blockedReason ?? '发送状态待确认，将在连接恢复后核对。' } } } as ThreadMessage : message) }))
  }

  private deliverOutbox(entry: ChatOutboxEntry, request: RequestContext, checkStatus: boolean, deadline?: number): Promise<boolean> {
    const pending = this.sends.get(entry.clientMessageId)
    if (pending?.request.current()) return pending.promise
    const operation = (async () => {
      try {
        if (!request.current() || !this.includesChannel(entry.conversationId)) return false
        const signal = AbortSignal.any([request.signal, AbortSignal.timeout(Math.max(1,
          Math.min(OUTBOX_RECOVERY.requestMs, (deadline ?? Infinity) - Date.now())))])
        if (checkStatus) {
          const status = await lingxiIm.sendStatus(entry.clientMessageId, signal)
          if (!request.current()) return false
          signal.throwIfAborted()
          if (status.status === 'accepted') {
            this.acceptOutboxEcho(entry, status.echo)
            return true
          }
          // Missing/pending are the existing server's idempotent accept
          // protocol. Unknown/new states require reconciliation, never a new ID.
          if (status.status !== 'missing' && status.status !== 'pending') throw new Error('发送状态待确认')
        }
        if (!request.current() || !readChatOutbox().some(row => row.clientMessageId === entry.clientMessageId)) return false
        signal.throwIfAborted()
        const echo = await lingxiIm.send(entry.conversationId, entry.payload, signal)
        if (!request.current()) return false
        signal.throwIfAborted()
        this.acceptOutboxEcho(entry, echo)
        chatLatency.submitted(entry.clientMessageId)
        return true
      } catch (error) {
        // A direct IM echo can win the race against a lost HTTP response.
        // Once canonical delivery is known, a network failure cannot undo it.
        if (request.current() && useChatThreadStore.getState().conversations[entry.conversationId]?.messages.some(message => {
          const meta = messageMetadata(message)
          return meta.clientMessageId === entry.clientMessageId && meta.sequence !== null && meta.sequence > 0
        })) return true
        if (request.current()) this.failOutbox(entry, permanentRecoveryError(error)
          ? '自动发送已停止：登录、权限或消息状态已变化。请确认后手动重试或移除。' : undefined)
        return false
      }
    })().finally(() => { if (this.sends.get(entry.clientMessageId)?.promise === operation) this.sends.delete(entry.clientMessageId) })
    this.sends.set(entry.clientMessageId, { request, promise: operation })
    return operation
  }

  private acceptOutboxEcho(entry: ChatOutboxEntry, echo?: ImEnvelope): void {
    if (!echo || echo.clientMsgNo !== entry.clientMessageId || echo.payload.id !== entry.clientMessageId
      || echo.channelId !== entry.conversationId || echo.fromUid !== getMeId() || !echo.messageId || echo.messageId === '0'
      || !Number.isSafeInteger(echo.messageSeq) || echo.messageSeq <= 0) throw new Error('发送回执待核对')
    this.commitEnvelope(echo)
    if (nativeAttachments(entry.payload).length) {
      const request = this.captureRequest()
      window.setTimeout(() => {
        if (request.current()) void import('@/features/knowledge/state')
          .then(({ useKnowledgeSources }) => { if (request.current()) return useKnowledgeSources.getState().load() })
          .catch(() => {})
      }, 750)
    }
  }
}

export const chatTransport = new ChatTransport()
registerAuthTeardown(() => chatTransport.disconnect())

export function filterThreadMessages(
  messages: readonly ThreadMessage[],
  threadRootId: string | null,
): ThreadMessage[] {
  return projectMessageGroups(messages.filter(message => messageMetadata(message).messageKind !== 'tool_activity'
    && (!threadRootId || message.id === threadRootId || messageMetadata(message).quotedMessageId === threadRootId
      || messageMetadata(message).replyBranches?.threadRootId === threadRootId || messageMetadata(message).replyBranches?.rootId === threadRootId)))
}
