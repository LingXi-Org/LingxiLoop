import { create } from 'zustand'
import { type ApiMessage, api, type WsEvent, ws } from '@/api/client'
import {
  ACTIVE_STREAM_EXPIRY_MS,
  hasBroadcastMention,
  shouldApplyStreamEvent,
  streamExpiryForOpen,
  streamModeForOpen,
  withoutFinalizedActiveRuns,
} from '@/lib/chatMessages'
import { isMockImDevelopment } from '@/lib/devMode'
import { type ImEnvelope, isInternalAgentStatus, type LingxiMessageV1, lingxiIm } from '@/lib/im/wukong'
import { useApp } from '@/stores/app'
import { getActiveCompanyId, getMeId } from '@/stores/auth'
import { useParticipants } from '@/stores/participants'
import type { Message, ReactionEntry } from '@/types'

const EMPTY_MESSAGES: Message[] = []

/** Default page size for both initial load and "load older". Matches the
 *  server's default cap; keep these in sync. */
export const MESSAGES_PAGE_SIZE = 80

/** Starting value for react-virtuoso's `firstItemIndex`. The virtualized
 *  message list anchors its scroll on prepend ONLY when we hand it a
 *  firstItemIndex that decreases by the number of rows prepended; without it,
 *  loading older history jumps the viewport or stalls at the top. Base is
 *  arbitrary-large so a long session of paging upward never reaches 0. */
export const VIRTUOSO_FIRST_INDEX_BASE = 1_000_000

export interface MessagesState {
  byConvo: Record<string, Message[]>
  /** in-flight streaming bodies, keyed by message id */
  streaming: Record<string, { body: string; conversationId: string; authorId: string; sequence: number; mode?: 'placeholder' | 'markdown'; runId?: string }>
  /** which agents are currently typing in each conversation */
  typing: Record<string, string[]>
  loaded: Set<string>
  loading: Set<string>
  /** Per-convo flag: does the server have more messages OLDER than what we
   *  currently hold? Initialized after `loadConversation`. False once a
   *  loadOlder returns fewer rows than requested. */
  hasMoreOlder: Record<string, boolean>
  /** In-flight loadOlder calls — guards against double-fire when the
   *  virtualized list scroll keeps tripping the start-reached threshold. */
  loadingOlder: Set<string>
  /** Per-convo react-virtuoso `firstItemIndex`. Starts at
   *  VIRTUOSO_FIRST_INDEX_BASE on first load and is decremented by the number
   *  of rows prepended on each loadOlder, so the list keeps its scroll anchor
   *  when older history is paged in. Updated in the SAME `set` as `byConvo`
   *  so the data growth and the index shift land in one render. */
  firstItemIndex: Record<string, number>
  errors: Record<string, string>

  loadConversation: (id: string) => Promise<void>
  loadOlder: (id: string) => Promise<void>
  reloadConversation: (id: string) => Promise<void>
  retryLoad: (id: string) => Promise<void>
  applyEvent: (e: WsEvent) => void
}

function timeFromIso(iso?: string): string {
  const d = iso ? new Date(iso) : new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const TYPING_STALE_MS = 45_000
const typingExpiryTimers = new Map<string, number>()
// A real turn can go quiet between deltas for longer than a token gap —
// a tool call (web fetch, shell, etc.) commonly takes several seconds,
// and under concurrent-broadcast load (@all to several agents) a turn
// can also sit queued behind MANAGED_TURN_CONCURRENCY for a stretch
// before its first delta. 10s was tripping on legitimate gaps, dropping
// the in-progress bubble and force-reloading mid-reply — which reads as
// "the reply failed and got resent." Give it real headroom.
const streamingExpiryTimers = new Map<string, number>()
const streamEventSequences = new Map<string, number>()
const STREAM_EVENT_SEQUENCE_LIMIT = 2_000

function acceptStreamEvent(messageId: string, sequence: number | undefined): boolean {
  if (!shouldApplyStreamEvent(streamEventSequences.get(messageId), sequence)) return false
  if (sequence !== undefined) {
    // Refresh insertion order so the bounded map retains recently active runs.
    streamEventSequences.delete(messageId)
    streamEventSequences.set(messageId, sequence)
    if (streamEventSequences.size > STREAM_EVENT_SEQUENCE_LIMIT) {
      const oldest = streamEventSequences.keys().next().value
      if (oldest !== undefined) streamEventSequences.delete(oldest)
    }
  }
  return true
}

function clearStreamingExpiry(messageId: string): void {
  const timer = streamingExpiryTimers.get(messageId)
  if (timer !== undefined) window.clearTimeout(timer)
  streamingExpiryTimers.delete(messageId)
}

function scheduleStreamingExpiry(messageId: string, conversationId: string, timeoutMs = ACTIVE_STREAM_EXPIRY_MS): void {
  clearStreamingExpiry(messageId)
  const timer = window.setTimeout(() => {
    streamingExpiryTimers.delete(messageId)
    useMessages.setState((state) => {
      const { [messageId]: _drop, ...streaming } = state.streaming
      return { streaming }
    })
    // The database already contains the authoritative full row before any
    // delta is sent. Refetching converts a missed terminal event into the
    // complete message instead of leaving a permanent half-bubble.
    void useMessages.getState().reloadConversation(conversationId)
  }, timeoutMs)
  streamingExpiryTimers.set(messageId, timer)
}

function clearAllStreamingExpiries(): void {
  for (const timer of streamingExpiryTimers.values()) window.clearTimeout(timer)
  streamingExpiryTimers.clear()
}

function typingKey(conversationId: string, agentId: string): string {
  return `${conversationId}:${agentId}`
}

function withoutTypingAgent(
  typing: Record<string, string[]>,
  conversationId: string,
  agentId: string,
): Record<string, string[]> {
  const cur = typing[conversationId]
  if (!cur?.includes(agentId)) return typing
  const next = cur.filter((id) => id !== agentId)
  if (next.length > 0) return { ...typing, [conversationId]: next }
  const { [conversationId]: _drop, ...rest } = typing
  return rest
}

function withTypingAgent(
  typing: Record<string, string[]>,
  conversationId: string,
  agentId: string,
): Record<string, string[]> {
  const cur = typing[conversationId] ?? []
  const without = cur.filter((id) => id !== agentId)
  return { ...typing, [conversationId]: [...without, agentId] }
}

function clearTypingExpiry(conversationId: string, agentId: string): void {
  const key = typingKey(conversationId, agentId)
  const timer = typingExpiryTimers.get(key)
  if (timer !== undefined) window.clearTimeout(timer)
  typingExpiryTimers.delete(key)
}

function clearAllTypingExpiries(): void {
  for (const timer of typingExpiryTimers.values()) window.clearTimeout(timer)
  typingExpiryTimers.clear()
}

function scheduleTypingExpiry(conversationId: string, agentId: string): void {
  clearTypingExpiry(conversationId, agentId)
  const timer = window.setTimeout(() => {
    typingExpiryTimers.delete(typingKey(conversationId, agentId))
    useMessages.setState((s) => ({
      typing: withoutTypingAgent(s.typing, conversationId, agentId),
    }))
  }, TYPING_STALE_MS)
  typingExpiryTimers.set(typingKey(conversationId, agentId), timer)
}

/** Re-derive every reaction's `mine` flag from `users` + the local user id.
 *  The server no longer computes `mine` because the same reactions array is
 *  reused over WS broadcasts where "I" is recipient-specific — see
 *  server/src/api/router.ts and server/src/agents/tools.ts for the
 *  matching server-side rationale. Anonymous (no meId) means mine=false. */
function deriveMineForReactions<R extends { users?: string[] | null }>(
  reactions: R[] | null | undefined,
): Array<R & { mine: boolean }> | undefined {
  if (!reactions || reactions.length === 0) return undefined
  const meId = getMeId()
  return reactions.map((r) => ({
    ...r,
    mine: !!meId && Array.isArray(r.users) && r.users.includes(meId),
  }))
}

function compactReactions(reactions: ReactionEntry[]): ReactionEntry[] | undefined {
  const next = reactions.filter((r) => r.count > 0)
  return next.length > 0 ? next : undefined
}

function mergeReactionOrder(
  current: ReactionEntry[] | undefined,
  incoming: ReactionEntry[] | undefined,
): ReactionEntry[] | undefined {
  if (!incoming || incoming.length === 0) return undefined
  if (!current || current.length === 0) return incoming

  const byEmoji = new Map(incoming.map((r) => [r.emoji, r]))
  const next: ReactionEntry[] = []
  const seen = new Set<string>()
  for (const r of current) {
    // Guard against a `current` array that already contains duplicates of
    // the same emoji — without this check the inner push would emit the
    // same `updated` entry once per duplicate, producing visible
    // "✅ 2 2 3"-style stutter in the pill row when rapid clicks race
    // with WS echoes. Defensive: nothing in our own pipeline should
    // produce duplicates, but we'd rather collapse than amplify.
    if (seen.has(r.emoji)) continue
    const updated = byEmoji.get(r.emoji)
    if (!updated || updated.count <= 0) continue
    next.push(updated)
    seen.add(r.emoji)
  }
  for (const r of incoming) {
    if (seen.has(r.emoji) || r.count <= 0) continue
    next.push(r)
    seen.add(r.emoji)
  }
  return next.length > 0 ? next : undefined
}

function optimisticToggleReactions(
  reactions: ReactionEntry[] | undefined,
  emoji: string,
): ReactionEntry[] | undefined {
  const meId = getMeId()
  const next = reactions ? reactions.map((r) => ({ ...r, users: r.users ? [...r.users] : undefined })) : []
  const idx = next.findIndex((r) => r.emoji === emoji)
  if (idx === -1) {
    next.push({ emoji, count: 1, mine: true, users: meId ? [meId] : undefined })
    return next
  }

  const cur = next[idx]
  const users = cur.users
  const hadMine = meId
    ? !!cur.mine || (Array.isArray(users) && users.includes(meId))
    : !!cur.mine
  const count = hadMine ? Math.max(0, cur.count - 1) : cur.count + 1
  const patchedUsers = meId
    ? hadMine
      ? users?.filter((id) => id !== meId)
      : Array.from(new Set([...(users ?? []), meId]))
    : users

  if (count === 0) next.splice(idx, 1)
  else next[idx] = { ...cur, count, mine: !hadMine, users: patchedUsers }
  return compactReactions(next)
}

function patchMessageReactions(
  messageId: string,
  updater: (reactions: ReactionEntry[] | undefined) => ReactionEntry[] | undefined,
): Map<string, ReactionEntry[] | undefined> {
  const previous = new Map<string, ReactionEntry[] | undefined>()
  useMessages.setState((s) => {
    let changed = false
    const byConvo = { ...s.byConvo }
    for (const [convoId, list] of Object.entries(s.byConvo)) {
      let listChanged = false
      const next = list.map((m) => {
        if (m.id !== messageId) return m
        previous.set(convoId, m.reactions)
        listChanged = true
        return { ...m, reactions: updater(m.reactions) }
      })
      if (listChanged) {
        byConvo[convoId] = next
        changed = true
      }
    }
    return changed ? { byConvo } : {}
  })
  return previous
}

function restoreMessageReactions(
  messageId: string,
  previous: Map<string, ReactionEntry[] | undefined>,
): void {
  if (previous.size === 0) return
  useMessages.setState((s) => {
    let changed = false
    const byConvo = { ...s.byConvo }
    for (const [convoId, reactions] of previous.entries()) {
      const list = s.byConvo[convoId]
      if (!list) continue
      byConvo[convoId] = list.map((m) => (
        m.id === messageId ? { ...m, reactions } : m
      ))
      changed = true
    }
    return changed ? { byConvo } : {}
  })
}

function fromApi(m: ApiMessage): Message {
  // Always render local HH:MM. If `at` came back as an ISO timestamp, reformat;
  // if `at` is missing, derive from createdAt; if neither, use now.
  let at: string
  if (m.at && !ISO_RE.test(m.at)) {
    at = m.at
  } else if (m.at && ISO_RE.test(m.at)) {
    at = timeFromIso(m.at)
  } else if (m.createdAt) {
    at = timeFromIso(m.createdAt)
  } else {
    at = timeFromIso()
  }
  const raw = m as unknown as {
    tool?: Message['tool']
    attachment?: Message['attachment']
    whisperLink?: Message['whisperLink']
    quotedMessageId?: string | null
    quoted?: Message['quoted'] | null
    replyCount?: number | null
    email?: Message['email'] | null
    poll?: Message['poll'] | null
    pollTallies?: Message['pollTallies'] | null
    clientId?: string | null
    mentionedIds?: string[] | null
    mentionAll?: boolean | null
    runId?: string | null
    handoff?: Message['handoff'] | null
    approval?: Message['approval'] | null
    canvas?: Message['canvas'] | null
    citations?: Message['citations'] | null
  }
  const out: Message = {
    id: m.id,
    conversationId: m.conversationId,
    authorId: m.authorId,
    kind: m.kind as Message['kind'],
    body: m.body,
    at,
    createdAt: m.createdAt ?? (m.at && ISO_RE.test(m.at) ? m.at : undefined),
    reactions: deriveMineForReactions(m.reactions),
    tool: raw.tool ?? undefined,
    attachment: raw.attachment ?? undefined,
    whisperLink: raw.whisperLink ?? undefined,
    quotedMessageId: raw.quotedMessageId ?? undefined,
    quoted: raw.quoted ?? undefined,
    replyCount: raw.replyCount ?? undefined,
    email: raw.email ?? undefined,
    poll: raw.poll ?? undefined,
    pollTallies: raw.pollTallies ?? undefined,
    clientId: raw.clientId ?? undefined,
    mentionedIds: raw.mentionedIds ?? undefined,
    mentionAll: raw.mentionAll ?? undefined,
    runId: raw.runId ?? undefined,
    handoff: raw.handoff ?? undefined,
    approval: raw.approval ?? undefined,
    canvas: raw.canvas ?? undefined,
    citations: raw.citations ?? undefined,
  }
  ;(out as Message & { sequence?: number }).sequence = m.sequence
  return out
}

function fromIm(message: ImEnvelope): Message {
  const payload = message.payload
  const data = payload.data ?? {}
  const kind = payload.kind === 'tool_activity' || payload.kind === 'artifact' ? 'tool' : payload.kind
  const pollClientMsgNo = payload.kind === 'poll'
    ? String(payload.refs?.pollClientMsgNo ?? payload.clientMsgNo)
    : null
  const approvalId = payload.kind === 'approval' && payload.refs?.approvalId
    ? `approval-${payload.refs.approvalId}`
    : null
  const pollData = payload.kind === 'poll' && data.poll && typeof data.poll === 'object'
    ? data.poll as Message['poll']
    : payload.kind === 'poll' ? data as unknown as Message['poll'] : undefined
  return fromApi({
    // Poll update messages deliberately share the original poll's stable
    // client id so a WuKong event snapshot replaces the bubble in place.
    id: pollClientMsgNo ?? approvalId ?? (message.messageId || payload.clientMsgNo),
    clientId: payload.clientMsgNo,
    conversationId: message.channelId,
    authorId: message.fromUid,
    kind: kind as Message['kind'],
    body: payload.body ?? '',
    at: new Date(message.timestamp > 10_000_000_000 ? message.timestamp : message.timestamp * 1000).toISOString(),
    createdAt: new Date(message.timestamp > 10_000_000_000 ? message.timestamp : message.timestamp * 1000).toISOString(),
    sequence: message.messageSeq,
    quotedMessageId: payload.replyToClientMsgNo,
    attachment: payload.kind === 'attachment' ? data as Message['attachment'] : undefined,
    tool: payload.kind === 'tool_activity' || payload.kind === 'artifact' ? {
      name: String(data.name ?? payload.body ?? payload.kind),
      arg: String(data.arg ?? ''),
      status: String(data.status ?? data.stage ?? 'completed'),
      detail: String(data.detail ?? ''),
    } : undefined,
    handoff: payload.kind === 'handoff' ? data as unknown as Message['handoff'] : undefined,
    approval: payload.kind === 'approval' ? data as unknown as Message['approval'] : undefined,
    canvas: payload.kind === 'canvas' ? data as unknown as Message['canvas'] : undefined,
    citations: Array.isArray(data.citations) ? data.citations as Message['citations'] : undefined,
    poll: pollData,
    pollTallies: payload.kind === 'poll' && Array.isArray(data.pollTallies)
      ? data.pollTallies as Message['pollTallies']
      : undefined,
    mentionedIds: Array.isArray(data.mentionedIds) ? data.mentionedIds.map(String) : undefined,
    mentionAll: data.mentionAll === true,
    runId: typeof payload.refs?.runId === 'string' ? payload.refs.runId : undefined,
  })
}

function fromImBatch(messages: ImEnvelope[]): Message[] {
  const byId = new Map<string, Message>()
  for (const envelope of messages) {
    const next = fromIm(envelope)
    const previous = byId.get(next.id)
    if (!previous) {
      byId.set(next.id, next)
      continue
    }
    // WuKong keeps each poll revision as a durable message. Collapse those
    // snapshots to one bubble while retaining the original timeline slot.
    const previousSeq = sequenceOf(previous)
    const nextSeq = sequenceOf(next)
    const latest = (nextSeq ?? 0) >= (previousSeq ?? 0) ? next : previous
    ;(latest as Message & { sequence?: number }).sequence = Math.min(
      previousSeq ?? Number.MAX_SAFE_INTEGER,
      nextSeq ?? Number.MAX_SAFE_INTEGER,
    )
    byId.set(next.id, latest)
  }
  return sortMessagesStable([...byId.values()])
}

const activeReadTimers = new Map<string, number>()

/** WuKong-delivered Agent OS messages do not necessarily have a matching app
 * WebSocket message.new event. Mark the open room read from this transport as
 * well, optimistically clearing its badge and debouncing the server cursor so
 * a burst of streamed/final messages advances to the newest one. */
function markConversationReadWhileOpen(conversationId: string): void {
  void import('@/stores/conversations').then(({ useConversations }) => {
    useConversations.setState((state) => ({
      list: state.list.map((conversation) => conversation.id === conversationId
        ? { ...conversation, unread: undefined }
        : conversation),
    }))
  })
  const current = activeReadTimers.get(conversationId)
  if (current !== undefined) window.clearTimeout(current)
  activeReadTimers.set(conversationId, window.setTimeout(() => {
    activeReadTimers.delete(conversationId)
    if (useApp.getState().selectedConversationId !== conversationId) return
    void api.markRead(conversationId)
      .then(() => import('@/stores/conversations'))
      .then(({ useConversations }) => useConversations.getState().reload())
      .catch(() => undefined)
  }, 50))
}

function sequenceOf(m: Message): number | null {
  const raw = (m as Message & { sequence?: unknown }).sequence
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

function sortMessagesStable(messages: Message[]): Message[] {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => {
      const sa = sequenceOf(a.message)
      const sb = sequenceOf(b.message)
      if (sa !== null && sb !== null && sa !== sb) return sa - sb
      if (sa !== null && sb === null) return -1
      if (sa === null && sb !== null) return 1
      return a.index - b.index
    })
    .map((x) => x.message)
}

function mergeFetchedMessages(current: Message[] | undefined, incoming: Message[]): Message[] {
  if (!current || current.length === 0) return incoming

  const currentById = new Map(current.map((m) => [m.id, m]))
  const incomingIds = new Set(incoming.map((m) => m.id))
  const incomingClientIds = new Set(incoming.map((m) => m.clientId).filter(Boolean))
  const merged = incoming.map((m) => {
    const prev = currentById.get(m.id)
    // Keep the local optimistic key stable after a fetch returns the same
    // persisted row. The API snapshot is authoritative for message content,
    // but `clientId` is a renderer-only identity.
    return prev?.clientId && !m.clientId ? { ...m, clientId: prev.clientId } : m
  })

  for (const m of current) {
    if (incomingIds.has(m.id)) continue
    if (m.clientId && incomingClientIds.has(m.clientId)) continue
    // A fetch response can be older than the WS events already applied to this
    // store. Never let that snapshot delete a message the UI has already seen;
    // later fresher fetches will merge into the same row by id.
    merged.push(m)
  }

  return sortMessagesStable(merged)
}

export const useMessages = create<MessagesState>((set, get) => ({
  byConvo: {},
  streaming: {},
  typing: {},
  loaded: new Set(),
  loading: new Set(),
  hasMoreOlder: {},
  loadingOlder: new Set(),
  firstItemIndex: {},
  errors: {},

  async loadConversation(id) {
    const s = get()
    if (s.loaded.has(id) || s.loading.has(id)) return
    set((s) => {
      const { [id]: _drop, ...restErrors } = s.errors
      return { loading: new Set(s.loading).add(id), errors: restErrors }
    })
    try {
      const msgs = await lingxiIm.history(id, MESSAGES_PAGE_SIZE)
      const normalized = fromImBatch(msgs)
      // Fewer rows than the page cap → we've already got everything older.
      // Equal-to-cap is ambiguous (could be exactly N or N+more) so default
      // to optimistic "more available" and let the next loadOlder confirm.
      const hasMore = normalized.length >= MESSAGES_PAGE_SIZE
      set((s) => ({
        byConvo: { ...s.byConvo, [id]: mergeFetchedMessages(s.byConvo[id], normalized) },
        loaded: new Set(s.loaded).add(id),
        loading: new Set([...s.loading].filter((x) => x !== id)),
        hasMoreOlder: { ...s.hasMoreOlder, [id]: hasMore },
        firstItemIndex: { ...s.firstItemIndex, [id]: s.firstItemIndex[id] ?? VIRTUOSO_FIRST_INDEX_BASE },
      }))
    } catch (err) {
      console.warn('[messages] loadConversation failed', err)
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      // A 404 means the conversation no longer exists (deleted server-side,
      // or a stale id leaked in from somewhere). Don't surface a hard error
      // panel for that — silently drop the selection so the chat pane falls
      // back to the "Select a conversation" empty state.
      if (/\b404\b/.test(msg) || /not found/i.test(msg)) {
        set((s) => ({
          loading: new Set([...s.loading].filter((x) => x !== id)),
        }))
        if (useApp.getState().selectedConversationId === id) {
          useApp.getState().selectConversation(null)
        }
        return
      }
      set((s) => ({
        loading: new Set([...s.loading].filter((x) => x !== id)),
        errors: { ...s.errors, [id]: msg },
      }))
    }
  },

  async reloadConversation(id) {
    try {
      // Reload pulls the same window the initial load did — last N. Older
      // history that was already paged in stays in byConvo via the merge.
      const msgs = await lingxiIm.history(id, MESSAGES_PAGE_SIZE)
      const normalized = fromImBatch(msgs)
      const hasMore = normalized.length >= MESSAGES_PAGE_SIZE
      set((s) => ({
        byConvo: { ...s.byConvo, [id]: mergeFetchedMessages(s.byConvo[id], normalized) },
        loaded: new Set(s.loaded).add(id),
        hasMoreOlder: {
          ...s.hasMoreOlder,
          // Don't downgrade a known-true to false just because reload landed
          // on the tail page — only widen the optimistic guess.
          [id]: s.hasMoreOlder[id] ?? hasMore,
        },
      }))
    } catch (err) {
      console.warn('[messages] reload failed', err)
    }
  },

  async loadOlder(id) {
    const s = get()
    // Guard: nothing loaded yet, no more pages known, or another loadOlder
    // is already mid-flight (virtuoso start-reached fires more than once
    // during a single momentum scroll).
    if (!s.loaded.has(id)) return
    if (s.hasMoreOlder[id] === false) return
    if (s.loadingOlder.has(id)) return
    const list = s.byConvo[id] ?? []
    if (list.length === 0) return
    // Find the oldest known sequence — that's our cursor.
    let oldest: number | null = null
    for (const m of list) {
      const seq = sequenceOf(m)
      if (seq === null) continue
      if (oldest === null || seq < oldest) oldest = seq
    }
    if (oldest === null || oldest <= 1) {
      // No sequence on any row, or we're already at the bottom of the
      // sequence space — nothing older to fetch.
      set((s) => ({ hasMoreOlder: { ...s.hasMoreOlder, [id]: false } }))
      return
    }
    // WuKongIM owns pagination. The initial v3 adapter returns the committed
    // tail window; do not fall back to the retired Postgres message table.
    // A subsequent SDK contract upgrade can expose its sequence cursor here.
    set((state) => ({ hasMoreOlder: { ...state.hasMoreOlder, [id]: false } }))
  },

  async retryLoad(id) {
    // Force a fresh attempt even though the previous one technically
    // "finished" (with an error). Clear the loaded/error flags so
    // loadConversation will run instead of bailing out early.
    set((s) => {
      const { [id]: _drop, ...restErrors } = s.errors
      return {
        loaded: new Set([...s.loaded].filter((x) => x !== id)),
        errors: restErrors,
      }
    })
    await get().loadConversation(id)
  },

  applyEvent(e) {
    if (e.type === 'message.new') {
      const m = fromApi(e.message)
      clearStreamingExpiry(m.id)
      clearTypingExpiry(e.conversationId, m.authorId)
      set((s) => {
        const existing = s.byConvo[e.conversationId] ?? []
        // Match the optimistic bubble against the server echo. We have to
        // try BOTH keys:
        //   - id matches when the POST has already resolved and renamed
        //     the temp bubble to the real id.
        //   - clientId matches when the WS event races ahead of the POST
        //     response — the local bubble is still keyed by tempId, so an
        //     id-only check would miss it and we'd double-render (bubble
        //     appears, server echo lands as a separate row, then the POST
        //     resolves and drops the temp → user sees a flicker).
        const prior = existing.find(
          (x) => x.id === m.id
            || (!!m.clientId && x.clientId === m.clientId && x.authorId === m.authorId),
        )
        // Carry the optimistic clientId onto the server echo so the React
        // list key (m.clientId ?? m.id) stays stable across the replacement
        // — otherwise the row remounts and re-animates.
        const merged: Message = prior?.clientId ? { ...m, clientId: prior.clientId } : m
        const without = existing.filter((x) => x !== prior && x.id !== m.id)
        let next = [...without, merged].sort((a, b) => {
          const sa = (a as { sequence?: number }).sequence ?? 0
          const sb = (b as { sequence?: number }).sequence ?? 0
          return sa - sb
        })
        // Live replyCount bump on the quoted-original. Server doesn't publish
        // the new count separately; without this the "N replies" link on the
        // root would only catch up on a full refetch. Only bump for fresh
        // arrivals (`prior` was absent) so a server-echo of an optimistic
        // bubble doesn't double-count.
        if (!prior && m.quotedMessageId) {
          const rootId = m.quotedMessageId
          next = next.map((x) =>
            x.id === rootId ? { ...x, replyCount: (x.replyCount ?? 0) + 1 } : x,
          )
        }
        // Drop the matching streaming entry. Streaming rows are keyed by a
        // synthetic `live:${runId}:${callId}` id, not the real DB message
        // id, so an id-only match here is a no-op — the stale streaming
        // entry lingers (rendered alongside the now-finalized message)
        // until its 10s stale-timer fires. Only one live reply per
        // author/conversation runs at a time, so match on that too.
        const rest = Object.fromEntries(
          Object.entries(s.streaming).filter(([id, x]) =>
            id !== m.id
            && !(x.conversationId === e.conversationId && x.authorId === m.authorId),
          ),
        )
        return {
          streaming: rest,
          typing: withoutTypingAgent(s.typing, e.conversationId, m.authorId),
          byConvo: { ...s.byConvo, [e.conversationId]: next },
        }
      })
    } else if (e.type === 'message.delta') {
      clearTypingExpiry(e.conversationId, e.authorId)
      if (e.done) {
        clearStreamingExpiry(e.messageId)
        set((s) => {
          const { [e.messageId]: _drop, ...rest } = s.streaming
          return {
            streaming: rest,
            typing: withoutTypingAgent(s.typing, e.conversationId, e.authorId),
          }
        })
        return
      }
      set((s) => {
        const cur = s.streaming[e.messageId]
        const body = (cur?.body ?? '') + e.delta
        return {
          typing: withoutTypingAgent(s.typing, e.conversationId, e.authorId),
          streaming: {
            ...s.streaming,
            [e.messageId]: {
              body,
              conversationId: e.conversationId,
              authorId: e.authorId,
              sequence: e.sequence,
            },
          },
        }
      })
      scheduleStreamingExpiry(e.messageId, e.conversationId)
    } else if (e.type === 'typing') {
      if (e.done) clearTypingExpiry(e.conversationId, e.agentId)
      else scheduleTypingExpiry(e.conversationId, e.agentId)
      set((s) => {
        const typing = e.done
          ? withoutTypingAgent(s.typing, e.conversationId, e.agentId)
          : withTypingAgent(s.typing, e.conversationId, e.agentId)
        return { typing }
      })
    } else if (e.type === 'message.reactions') {
      set((s) => {
        const list = s.byConvo[e.conversationId]
        if (!list) return {}
        // Server no longer ships `mine` — we re-derive it from `users` so
        // the per-recipient view is correct even though the broadcast was
        // identical across the tenant.
        const incoming = deriveMineForReactions(e.reactions)
        const next = list.map((m) =>
          m.id === e.messageId
            ? { ...m, reactions: mergeReactionOrder(m.reactions, incoming) }
            : m,
        )
        return { byConvo: { ...s.byConvo, [e.conversationId]: next } }
      })
    } else if (e.type === 'poll.updated') {
      // Patch the poll bubble in place — both the structured payload
      // (closedAt may have flipped) and the tally array.
      set((s) => {
        const list = s.byConvo[e.conversationId]
        if (!list) return {}
        const next = list.map((m) =>
          m.id === e.messageId
            ? { ...m, poll: e.poll, pollTallies: e.tallies }
            : m,
        )
        return { byConvo: { ...s.byConvo, [e.conversationId]: next } }
      })
    }
  },
}))

export const messagesFor = (s: MessagesState, convoId: string | null): Message[] => {
  if (!convoId) return EMPTY_MESSAGES
  const stored = s.byConvo[convoId] ?? EMPTY_MESSAGES
  const activeRunIds = new Set(Object.values(s.streaming)
    .flatMap((entry) => entry.conversationId === convoId && entry.runId ? [entry.runId] : []))
  // The durable final WuKong message can land just before stream.close.
  // Keep showing the live Markdown row until that terminal event, then the
  // already-cached final row takes over in the same timeline position.
  const base = withoutFinalizedActiveRuns(stored, activeRunIds)
  const streaming = Object.entries(s.streaming)
    .filter(([id, x]) => x.conversationId === convoId
      // A streaming row's synthetic id never equals a real DB message id, so
      // this also has to check for a finalized message from the same author
      // that landed at or after the streaming point (only one live reply per
      // author/conversation is ever in flight) — otherwise a dropped `done`
      // delta leaves the full text rendered twice. Compare by sequence, not
      // just authorId, so an older finalized message from the same author
      // doesn't wrongly suppress an unrelated newer streaming entry.
      && !base.some((m) => m.id === id
        || (m.authorId === x.authorId
          && ((m as { sequence?: number }).sequence ?? 0) >= (x.sequence ?? 0))))
    .map(([id, x]) => ({
      id,
      conversationId: convoId,
      authorId: x.authorId,
      kind: 'text' as const,
      body: x.body,
      at: timeFromIso(),
      sequence: x.sequence,
      streaming: x.mode === 'markdown' || x.body ? 'markdown' as const : 'placeholder' as const,
    }))
  const streamingAuthors = new Set(streaming.map((message) => message.authorId))
  const meId = getMeId()
  const typing = (s.typing?.[convoId] ?? [])
    // The server echoes typing events to every member, including their
    // author. Rendering our own echo created a bogus "thinking" row directly
    // above the composer on every keystroke.
    .filter((authorId) => authorId !== meId && !streamingAuthors.has(authorId))
    .map((authorId, index) => ({
      id: `typing:${convoId}:${authorId}`,
      conversationId: convoId,
      authorId,
      kind: 'text' as const,
      body: '',
      at: '',
      sequence: Number.MAX_SAFE_INTEGER - 1_000 + index,
      streaming: 'placeholder' as const,
    }))
  if (streaming.length === 0 && typing.length === 0) return base
  return [...base, ...streaming, ...typing].sort((a, b) =>
    ((a as Message & { sequence?: number }).sequence ?? 0) - ((b as Message & { sequence?: number }).sequence ?? 0),
  )
}

function newTempId(): string {
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `temp-${rnd}`
}

interface MessageOutboxEntry { convoId: string; nonce: string; payload: LingxiMessageV1; createdAt: string }
function outboxKey(): string | null {
  const companyId = getActiveCompanyId(), userId = getMeId()
  return companyId && userId ? `lingxiloop.im.outbox:${companyId}:${userId}` : null
}
function readOutbox(): MessageOutboxEntry[] {
  const key = outboxKey(); if (!key) return []
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(value) ? value.filter((item): item is MessageOutboxEntry => Boolean(item && typeof item === 'object' && typeof (item as MessageOutboxEntry).nonce === 'string')) : []
  } catch { return [] }
}
function writeOutbox(entries: MessageOutboxEntry[]): void {
  const key = outboxKey(); if (!key) return
  try { localStorage.setItem(key, JSON.stringify(entries.slice(-100))) } catch { /* best effort */ }
}
function rememberOutbox(entry: MessageOutboxEntry): void {
  const entries = readOutbox().filter((item) => item.nonce !== entry.nonce)
  writeOutbox([...entries, entry])
}
function forgetOutbox(nonce: string): void { writeOutbox(readOutbox().filter((item) => item.nonce !== nonce)) }

export async function sendUserMessage(
  convoId: string,
  body: string,
  attachment?: import('@/api/client').ApiAttachment | null,
  quotedMessageId?: string | null,
  clientNonce?: string,
  replayPayload?: LingxiMessageV1,
): Promise<void> {
  const v = body.trim()
  if (!v && !attachment) return
  const meId = getMeId()
  // WuKong identity is derived from the signed-in user; never fall back to a
  // second message store when that identity is missing.
  if (!meId) {
    console.warn('[messages] send skipped: no authenticated WuKong identity')
    return
  }

  // Build the optimistic quote summary from whatever's already in the store,
  // so the reply bubble shows its quote card immediately instead of popping
  // it in when the server echo arrives. We don't fetch on miss — if the
  // quoted message isn't loaded yet (rare; only happens if the user managed
  // to quote something the store evicted), the server echo will fill it in.
  let quotedSummary: import('@/types').QuotedSummary | undefined
  if (quotedMessageId) {
    const list = useMessages.getState().byConvo[convoId] ?? []
    const orig = list.find((m) => m.id === quotedMessageId)
    if (orig) {
      quotedSummary = {
        id: orig.id,
        authorId: orig.authorId,
        kind: orig.kind,
        body: orig.body.slice(0, 240),
        sequence: (orig as Message & { sequence?: number }).sequence ?? 0,
      }
    }
  }

  const tempId = clientNonce ?? newTempId()
  const optimistic: Message = {
    id: tempId,
    clientId: tempId,
    conversationId: convoId,
    authorId: meId,
    kind: 'text',
    body: v,
    at: timeFromIso(),
    attachment: attachment
      ? {
          name: attachment.name,
          kind: attachment.kind,
          url: attachment.url,
          mime: attachment.mime,
          size: attachment.size,
        }
      : undefined,
    quotedMessageId: quotedMessageId ?? undefined,
    quoted: quotedSummary,
    pending: true,
  }
  // Pin the optimistic bubble to the tail of the list — applyEvent sorts by
  // a hidden `sequence` field, so an unrelated message.new arriving mid-send
  // shouldn't shove our bubble up the timeline.
  ;(optimistic as Message & { sequence?: number }).sequence = Number.MAX_SAFE_INTEGER

  useMessages.setState((s) => {
    const list = s.byConvo[convoId] ?? []
    const exists = list.some((item) => item.id === tempId)
    return { byConvo: { ...s.byConvo, [convoId]: exists
      ? list.map((item) => item.id === tempId ? { ...item, pending: true, failed: false } : item)
      : [...list, optimistic] } }
  })

  if (isMockImDevelopment()) {
    const realId = `mock-${Date.now()}`
    useMessages.setState((s) => ({
      byConvo: {
        ...s.byConvo,
        [convoId]: (s.byConvo[convoId] ?? []).map((item) =>
          item.id === tempId
            ? { ...item, id: realId, pending: false, sequence: Date.now() }
            : item,
        ),
      },
    }))
    return
  }

  try {
    const mentionAll = hasBroadcastMention(v)
    const mentionedIds = Object.values(useParticipants.getState().byId)
      .filter((participant) => participant.kind === 'agent')
      .filter((participant) => [participant.id, participant.name].some((label) => {
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        return new RegExp(`(^|\\s)@${escaped}(?=\\s|$|[.,!?，。！？])`, 'i').test(v)
      }))
      .map((participant) => participant.id)
    const payload: LingxiMessageV1 = replayPayload ?? {
      version: 1,
      kind: attachment ? 'attachment' : 'text',
      clientMsgNo: tempId,
      body: v,
      ...(quotedMessageId ? { replyToClientMsgNo: quotedMessageId } : {}),
      data: {
        ...(attachment ?? {}),
        mentionedIds,
        mentionAll,
        ...(quotedSummary ? { replyAuthorId: quotedSummary.authorId } : {}),
      },
    }
    rememberOutbox({ convoId, nonce: tempId, payload, createdAt: new Date().toISOString() })
    const sent = await lingxiIm.send(convoId, payload)
    forgetOutbox(tempId)
    const realId = sent.messageId || sent.clientMsgNo
    // Reconcile the temp bubble with the server. Either the WS `message.new`
    // already raced ahead of us (real id already in the list → drop the temp)
    // or it hasn't (rename temp → real id so the eventual WS event dedupes
    // cleanly via the existing id-equality filter in applyEvent).
    useMessages.setState((s) => {
      const list = s.byConvo[convoId] ?? []
      const realExists = list.some((m) => m.id === realId)
      const next = realExists
        ? list.filter((m) => m.id !== tempId)
        : list.map((m) =>
            m.id === tempId ? { ...m, id: realId, pending: false } : m,
          )
      return { byConvo: { ...s.byConvo, [convoId]: next } }
    })
    if (attachment) {
      // The webhook creates the local Source immediately after WuKong commits
      // the attachment. Refresh once after the acknowledgement; once the
      // queued row is visible, the existing SourcePanel poll follows it to a
      // terminal Open Notebook state.
      window.setTimeout(() => {
        void import('@/stores/knowledgeSources')
          .then(({ useKnowledgeSources }) => useKnowledgeSources.getState().load())
          .catch(() => undefined)
      }, 750)
    }
  } catch (err) {
    console.warn('[messages] send failed', err)
    useMessages.setState((s) => {
      const list = s.byConvo[convoId] ?? []
      const next = list.map((m) =>
        m.id === tempId ? { ...m, pending: false, failed: true } : m,
      )
      return { byConvo: { ...s.byConvo, [convoId]: next } }
    })
  }
}

/** Drop a failed optimistic bubble and its local recovery intent. A server-
 * accepted echo, if one exists, remains authoritative and may still arrive. */
export function discardFailedMessage(convoId: string, tempId: string): void {
  forgetOutbox(tempId)
  useMessages.setState((s) => {
    const list = s.byConvo[convoId]
    if (!list) return s
    const next = list.filter((m) => m.id !== tempId)
    if (next.length === list.length) return s
    return { byConvo: { ...s.byConvo, [convoId]: next } }
  })
}

/** Retry a failed-to-send optimistic bubble. We remove the failed
 *  bubble, then resubmit the same body / attachment / quote pointer
 *  via `sendUserMessage`, which paints a fresh optimistic bubble at the
 *  tail of the list. If the retry also fails, that fresh bubble ends
 *  up in the failed state and the user can retry again. */
export async function retryFailedMessage(convoId: string, tempId: string): Promise<void> {
  const list = useMessages.getState().byConvo[convoId] ?? []
  const msg = list.find((m) => m.id === tempId)
  if (!msg) return
  const body = msg.body ?? ''
  const att = msg.attachment
  // The optimistic bubble carried a denormalized attachment shape that
  // mirrors ApiAttachment minus `key` (we never stashed it on the
  // bubble). For retry that's fine — the server resolves the row by
  // url + name + mime + size, and `key` is only used as an internal
  // optimization marker.
  const retryAttachment: import('@/api/client').ApiAttachment | null = att
    ? { url: att.url ?? '', name: att.name, kind: att.kind, mime: att.mime, size: att.size }
    : null
  const quotedId = msg.quotedMessageId ?? null
  const replayPayload = readOutbox().find((entry) => entry.nonce === tempId)?.payload
  await sendUserMessage(convoId, body, retryAttachment, quotedId, tempId, replayPayload)
}

async function recoverMessageOutbox(): Promise<void> {
  for (const entry of readOutbox()) {
    try {
      const status = await lingxiIm.sendStatus(entry.nonce)
      if (status.status === 'accepted' && status.echo) {
        forgetOutbox(entry.nonce)
        const normalized = fromIm(status.echo)
        useMessages.setState((state) => ({ byConvo: {
          ...state.byConvo,
          [entry.convoId]: mergeFetchedMessages((state.byConvo[entry.convoId] ?? []).filter((item) => item.id !== entry.nonce), [normalized]),
        } }))
        continue
      }
      const data = entry.payload.data ?? {}
      const attachment = entry.payload.kind === 'attachment' ? data as unknown as import('@/api/client').ApiAttachment : null
      await sendUserMessage(entry.convoId, entry.payload.body ?? '', attachment, entry.payload.replyToClientMsgNo, entry.nonce, entry.payload)
    } catch (error) { console.warn('[messages] outbox recovery deferred', error) }
  }
}

export async function toggleReaction(messageId: string, emoji: string): Promise<void> {
  const previous = patchMessageReactions(messageId, (reactions) =>
    optimisticToggleReactions(reactions, emoji),
  )
  if (isMockImDevelopment()) return
  try {
    const res = await api.toggleReaction(messageId, emoji)
    const incoming = deriveMineForReactions(res.reactions)
    patchMessageReactions(messageId, (reactions) => mergeReactionOrder(reactions, incoming))
  } catch (err) {
    restoreMessageReactions(messageId, previous)
    console.warn('[reactions] toggle failed', err)
  }
}

// Bound once; workspace switches reset the per-conversation message
// caches so old-tenant message arrays don't linger past a remount.
let wsBound = false
let imBound = false
export function bootMessagesStream() {
  // Reset every time bootMessagesStream is called (App.tsx remounts on
  // companyId change) — drops any messages the previous tenant left
  // behind in the byConvo cache.
  clearAllTypingExpiries()
  clearAllStreamingExpiries()
  for (const timer of activeReadTimers.values()) window.clearTimeout(timer)
  activeReadTimers.clear()
  useMessages.setState({
    byConvo: {},
    streaming: {},
    typing: {},
    loaded: new Set(),
    loading: new Set(),
    errors: {},
  })
  if (!imBound) {
    imBound = true
    lingxiIm.subscribe((message) => {
      if (isInternalAgentStatus(message)) return
      const normalized = fromIm(message)
      forgetOutbox(message.clientMsgNo)
      useMessages.setState((state) => ({
        byConvo: {
          ...state.byConvo,
          [normalized.conversationId]: mergeFetchedMessages(state.byConvo[normalized.conversationId], [normalized]),
        },
      }))
      if (message.channelId === useApp.getState().selectedConversationId) {
        void markConversationReadWhileOpen(message.channelId)
      }
    })
    lingxiIm.subscribeEvent((event) => {
      const id = event.clientMsgNo
      if (!acceptStreamEvent(id, event.streamSeq)) return
      if (event.type === 'stream.open') {
        useMessages.setState((state) => ({
          streaming: {
            ...state.streaming,
            [id]: {
              body: event.text ?? '', conversationId: event.channelId, authorId: event.fromUid,
              sequence: Number.MAX_SAFE_INTEGER - 10, mode: streamModeForOpen(event.phase),
              runId: id.startsWith('preview-') ? id.slice('preview-'.length) : undefined,
            },
          },
        }))
        scheduleStreamingExpiry(id, event.channelId, streamExpiryForOpen(event.queued === true))
        return
      }
      if (event.type === 'stream.delta') {
        useMessages.setState((state) => {
          const current = state.streaming[id] ?? {
            body: '', conversationId: event.channelId, authorId: event.fromUid, sequence: Number.MAX_SAFE_INTEGER - 10,
          }
          return { streaming: { ...state.streaming, [id]: { ...current, body: current.body + (event.delta ?? ''), mode: 'markdown' } } }
        })
        scheduleStreamingExpiry(id, event.channelId)
        return
      }
      clearStreamingExpiry(id)
      useMessages.setState((state) => {
        const { [id]: _drop, ...streaming } = state.streaming
        return { streaming }
      })
    })
    void lingxiIm.connect().catch((error) => console.warn('[im] connect failed', error))
  }
  void recoverMessageOutbox()
  if (wsBound) return
  wsBound = true
  ws.connect()
  ws.on((e) => {
    if (e.type === 'hello') {
      // Fresh WS connection — could be the initial connect OR a reconnect
      // after a network blip / server rollout. Redis pubsub doesn't queue
      // events, so any `message.new` / `message.delta` / `message.reactions`
      // that fired while we were disconnected is gone. Refetch the open
      // conversation to backfill those misses, and invalidate `loaded` for
      // the rest so they refetch on next view instead of serving stale
      // cache from before the gap. Also clear streaming/typing in case we
      // missed their terminal events and they're stuck.
      const active = useApp.getState().selectedConversationId
      clearAllTypingExpiries()
      clearAllStreamingExpiries()
      useMessages.setState({ streaming: {}, typing: {} })
      useMessages.setState((s) => ({
        loaded: new Set(active && s.loaded.has(active) ? [active] : []),
      }))
      if (active) void useMessages.getState().reloadConversation(active)
      return
    }
    // Chat transport is WuKongIM-authoritative. Keep the legacy socket for
    // documents, boards, calendar and presence only.
    if (e.type === 'message.new' || e.type === 'message.delta' || e.type === 'message.reactions' || e.type === 'typing') return
    useMessages.getState().applyEvent(e)
  })
}
