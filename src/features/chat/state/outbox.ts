import type { LingxiMessageV1 } from '@/lib/im/wukong'
import { getActiveCompanyId, getMeId } from '@/stores/auth'

export interface MessageOutboxEntry {
  convoId: string
  nonce: string
  payload: LingxiMessageV1
  createdAt: string
}

function outboxKey(): string | null {
  const companyId = getActiveCompanyId()
  const userId = getMeId()
  return companyId && userId ? `lingxiloop.im.outbox:${companyId}:${userId}` : null
}

export function readOutbox(): MessageOutboxEntry[] {
  const key = outboxKey()
  if (!key || typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is MessageOutboxEntry => Boolean(
      item && typeof item === 'object'
      && typeof (item as MessageOutboxEntry).convoId === 'string'
      && typeof (item as MessageOutboxEntry).nonce === 'string'
      && typeof (item as MessageOutboxEntry).createdAt === 'string'
      && (item as MessageOutboxEntry).payload?.version === 1,
    )).slice(-100)
  } catch {
    return []
  }
}

function writeOutbox(entries: MessageOutboxEntry[]): void {
  const key = outboxKey()
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(entries.slice(-100)))
  } catch {
    // The in-memory optimistic row remains visible when browser storage is
    // unavailable; persistence only extends recovery across reloads.
  }
}

export function rememberOutbox(entry: MessageOutboxEntry): void {
  writeOutbox([...readOutbox().filter((item) => item.nonce !== entry.nonce), entry])
}

export function forgetOutbox(nonce: string): void {
  writeOutbox(readOutbox().filter((item) => item.nonce !== nonce))
}
