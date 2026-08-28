import { withoutFinalizedActiveRuns } from '@/lib/chatMessages'
import { getMeId } from '@/stores/auth'
import type { Message } from '@/types'
import { timeFromIso } from './messageProjection'

interface TimelineState {
  byConvo: Record<string, Message[]>
  streaming: Record<string, {
    body: string
    conversationId: string
    authorId: string
    sequence: number
    mode?: 'placeholder' | 'markdown'
    runId?: string
  }>
  typing: Record<string, string[]>
}

const EMPTY_MESSAGES: Message[] = []

export function selectMessagesFor(state: TimelineState, conversationId: string | null): Message[] {
  if (!conversationId) return EMPTY_MESSAGES
  const stored = state.byConvo[conversationId] ?? EMPTY_MESSAGES
  const activeRunIds = new Set(Object.values(state.streaming)
    .flatMap((entry) => entry.conversationId === conversationId && entry.runId ? [entry.runId] : []))
  const base = withoutFinalizedActiveRuns(stored, activeRunIds)
  const streaming = Object.entries(state.streaming)
    .filter(([id, entry]) => entry.conversationId === conversationId
      && !base.some((message) => message.id === id
        || (message.authorId === entry.authorId
          && ((message as { sequence?: number }).sequence ?? 0) >= (entry.sequence ?? 0))))
    .map(([id, entry]) => ({
      id,
      conversationId,
      authorId: entry.authorId,
      kind: 'text' as const,
      body: entry.body,
      at: timeFromIso(),
      createdAt: new Date().toISOString(),
      sequence: entry.sequence,
      streaming: entry.mode === 'markdown' || entry.body ? 'markdown' as const : 'placeholder' as const,
    }))
  const streamingAuthors = new Set(streaming.map((message) => message.authorId))
  const meId = getMeId()
  const typing = (state.typing[conversationId] ?? [])
    .filter((authorId) => authorId !== meId && !streamingAuthors.has(authorId))
    .map((authorId, index) => ({
      id: `typing:${conversationId}:${authorId}`,
      conversationId,
      authorId,
      kind: 'text' as const,
      body: '',
      at: '',
      createdAt: new Date().toISOString(),
      sequence: Number.MAX_SAFE_INTEGER - 1_000 + index,
      streaming: 'placeholder' as const,
    }))
  if (streaming.length === 0 && typing.length === 0) return base
  return [...base, ...streaming, ...typing].sort((left, right) =>
    ((left as Message & { sequence?: number }).sequence ?? 0) - ((right as Message & { sequence?: number }).sequence ?? 0),
  )
}
