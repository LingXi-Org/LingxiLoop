import { getActiveCompanyId, getMeId } from '@/stores/auth'

export interface ChatOutboxEntry {
  conversationId: string
  clientMessageId: string
  payload: Record<string, unknown>
  createdAt: string
}

function storageKey(): string | null {
  const companyId = getActiveCompanyId()
  const userId = getMeId()
  return companyId && userId ? `lingxiloop.chat.outbox:${companyId}:${userId}` : null
}

export function readChatOutbox(): ChatOutboxEntry[] {
  const key = storageKey()
  if (!key || typeof window === 'undefined') return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is ChatOutboxEntry => {
      const row = value as Partial<ChatOutboxEntry>
      return Boolean(
        value && typeof value === 'object'
        && typeof row.conversationId === 'string'
        && typeof row.clientMessageId === 'string'
        && typeof row.createdAt === 'string'
        && row.payload && typeof row.payload === 'object',
      )
    }).slice(-100)
  } catch {
    return []
  }
}

function write(entries: readonly ChatOutboxEntry[]): void {
  const key = storageKey()
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(entries.slice(-100)))
  } catch {
    // The canonical optimistic message remains visible without persistence.
  }
}

export function rememberChatOutbox(entry: ChatOutboxEntry): void {
  write([...readChatOutbox().filter((row) => row.clientMessageId !== entry.clientMessageId), entry])
}

export function forgetChatOutbox(clientMessageId: string): void {
  write(readChatOutbox().filter((row) => row.clientMessageId !== clientMessageId))
}
