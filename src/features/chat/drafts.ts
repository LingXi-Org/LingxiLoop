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

export interface ComposerDraftScope {
  kind?: 'composer' | 'questionnaire' | 'artifact-question'
  companyId: string | null; userId: string | null; projectId: string | null
  conversationId: string; threadRootId: string | null
}
export interface DraftAttachment { id: string; name: string; contentType: string }
export interface ComposerDraft { text: string; attachments: DraftAttachment[]; savedAt: number }
const MAX_AGE = 7 * 24 * 60 * 60 * 1000
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const draftKey = (scope: ComposerDraftScope) => `lingxiloop.chat.drafts.v2:${JSON.stringify([scope.companyId, scope.userId])}`
const scopeKey = (scope: ComposerDraftScope) => JSON.stringify([scope.kind ?? 'composer', scope.projectId, scope.conversationId, scope.threadRootId])

function attachmentReferences(value: unknown, companyId: string): DraftAttachment[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap(item => {
    const row = record(item), status = record(row.status), upload = record(row.apiAttachment)
    // In-flight/failed uploads cannot be restored; only already-uploaded identities are cached.
    if (status.type && status.type !== 'complete' && !(status.type === 'requires-action' && upload.key === row.id)) return []
    return typeof row.id === 'string' && row.id.startsWith(`attachments/${companyId}/`) && row.id.length <= 2000
      && !/[?\s#]/.test(row.id) && !row.id.split('/').includes('..') && typeof row.name === 'string' && row.name.length <= 1000
      && typeof row.contentType === 'string' && row.contentType.length <= 200
      ? [{ id: row.id, name: row.name, contentType: row.contentType }] : []
  })
}
function readDrafts(scope: ComposerDraftScope, now: number): Record<string, ComposerDraft> {
  let rows: Record<string, unknown>
  try { rows = record(JSON.parse(window.localStorage.getItem(draftKey(scope)) ?? '{}')) } catch { rows = {} }
  return Object.fromEntries(Object.entries(rows).slice(-MAX_DRAFTS).flatMap(([key, value]) => {
    const row = record(value)
    if (key.length > 2000 || typeof row.text !== 'string' || typeof row.savedAt !== 'number'
      || !Number.isFinite(row.savedAt) || row.savedAt > now || now - row.savedAt >= MAX_AGE) return []
    return [[key, { text: row.text.slice(0, MAX_DRAFT_LENGTH), attachments: attachmentReferences(row.attachments, scope.companyId!), savedAt: row.savedAt }]]
  }))
}
export function readComposerDraft(scope: ComposerDraftScope, now = Date.now()): ComposerDraft | null {
  if (!scope.companyId || !scope.userId || typeof window === 'undefined') return null
  try { return readDrafts(scope, now)[scopeKey(scope)] ?? null } catch { return null }
}
export function saveComposerDraft(scope: ComposerDraftScope, draft: { text: string; attachments: readonly unknown[] }, now = Date.now()): void {
  if (!scope.companyId || !scope.userId || typeof window === 'undefined') return
  try {
    const rows = readDrafts(scope, now), key = scopeKey(scope)
    delete rows[key]
    const attachments = attachmentReferences(draft.attachments, scope.companyId)
    if (draft.text || attachments.length) rows[key] = { text: draft.text.slice(0, MAX_DRAFT_LENGTH), attachments, savedAt: now }
    window.localStorage.setItem(draftKey(scope), JSON.stringify(Object.fromEntries(Object.entries(rows).slice(-MAX_DRAFTS))))
  } catch { /* Optional cache: in-memory input and the existing outbox remain authoritative. */ }
}
