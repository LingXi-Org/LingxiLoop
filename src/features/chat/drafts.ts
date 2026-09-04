const MAX_DRAFTS = 100
const MAX_DRAFT_LENGTH = 20_000

function storageKey(companyId: string, userId: string): string {
  return `lingxiloop.chat.drafts.v1:${companyId}:${userId}`
}

function validDrafts(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([scope, text]) => scope.length > 0 && scope.length <= 500 && typeof text === 'string' && text.length > 0)
    .slice(-MAX_DRAFTS)
    .map(([scope, text]) => [scope, (text as string).slice(0, MAX_DRAFT_LENGTH)] as const)
  return Object.fromEntries(entries)
}

export function readComposerDraftTexts(
  companyId: string | null | undefined,
  userId: string | null | undefined,
): Record<string, string> {
  if (!companyId || !userId || typeof window === 'undefined') return {}
  try {
    return validDrafts(JSON.parse(window.localStorage.getItem(storageKey(companyId, userId)) ?? '{}'))
  } catch {
    return {}
  }
}

export function saveComposerDraftText(
  companyId: string | null | undefined,
  userId: string | null | undefined,
  scope: string,
  text: string,
): void {
  if (!companyId || !userId || !scope || typeof window === 'undefined') return
  try {
    const drafts = readComposerDraftTexts(companyId, userId)
    const next = text ? { ...drafts, [scope]: text.slice(0, MAX_DRAFT_LENGTH) } : { ...drafts }
    if (!text) delete next[scope]
    const bounded = Object.fromEntries(Object.entries(next).slice(-MAX_DRAFTS))
    window.localStorage.setItem(storageKey(companyId, userId), JSON.stringify(bounded))
  } catch {
    // Browser storage is an optional local reliability cache; the in-memory
    // controlled editor remains authoritative for the active session.
  }
}
