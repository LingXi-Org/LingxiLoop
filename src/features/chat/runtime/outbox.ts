import { nativeMessageSchema, type NativeMessage } from '@/lib/nativeMessage'
import { getActiveCompanyId, getMeId } from '@/stores/auth'
import { getWorkspaceSession } from '@/lib/workspaceSession'

export interface ChatOutboxEntry {
  conversationId: string
  clientMessageId: string
  payload: NativeMessage
  createdAt: string
  projectId?: string
  blockedReason?: string
}

function storageKey(): string | null {
  const companyId = getActiveCompanyId()
  const userId = getMeId()
  return companyId && userId ? `lingxiloop.chat.outbox.v2:${companyId}:${userId}` : null
}

function readAll(): ChatOutboxEntry[] {
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
        && (row.projectId === undefined || typeof row.projectId === 'string')
        && (row.blockedReason === undefined || typeof row.blockedReason === 'string')
        && nativeMessageSchema.safeParse(row.payload).success
        && row.payload?.id === row.clientMessageId,
      )
    }).slice(-100)
  } catch {
    return []
  }
}

export function readChatOutbox(): ChatOutboxEntry[] {
  const projectId = getWorkspaceSession()?.projectId
  // Legacy entries stay recoverable, but the transport also requires the
  // authoritative workspace channel allowlist before replaying any entry.
  return readAll().filter(row => row.projectId === undefined || row.projectId === projectId)
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
  write([...readAll().filter((row) => row.clientMessageId !== entry.clientMessageId),
    { ...entry, projectId: entry.projectId ?? getWorkspaceSession()?.projectId }])
}

export function forgetChatOutbox(clientMessageId: string): void {
  write(readAll().filter((row) => row.clientMessageId !== clientMessageId))
}
