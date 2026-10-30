import { randomBytes } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'

// Ported from baoyu-design server.mjs (comments model and service). comments.json
// becomes artifact_comments.doc, locked by row instead of by a lock file.

export const COMMENTS_VERSION = 1
const LIMITS = { text: 1e4, label: 1e3, detail: 4e3, anchor: 2048, section: 200, name: 100 }

export class CommentsError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message) }
}

export interface CommentAuthor { kind: 'user' | 'agent'; name: string; id?: string }
export interface CommentMessage { id: string; author: CommentAuthor; text: string; at: string; editedAt?: string }
export interface CommentThread {
  id: string; anchor: string; label: string; detail?: string; location: Record<string, unknown>
  status: 'open' | 'resolved'; createdAt: string; updatedAt: string; resolvedAt?: string
  agent?: { status: 'pending' | 'delivered' | 'replied'; sentAt: string; deliveredAt?: string; repliedAt?: string; via?: string }
  messages: CommentMessage[]
}
export interface CommentsDoc { version: 1; threads: CommentThread[] }
export interface NewThread { anchor: string; label: string; detail?: string; area?: true; section?: string; text: string; send?: true }

export const emptyDoc = (): CommentsDoc => ({ version: COMMENTS_VERSION, threads: [] })
const newId = (prefix: string) => `${prefix}_${randomBytes(5).toString('hex')}`
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
function cleanText(v: unknown) {
  if (typeof v !== 'string') return null
  const text = v.replace(/\r\n?/g, '\n').trim()
  return text !== '' && text.length <= LIMITS.text ? text : null
}

export function readNewThread(body: unknown): NewThread | null {
  if (!isRecord(body)) return null
  const text = cleanText(body.text)
  if (text === null || !isText(body.anchor, LIMITS.anchor) || body.anchor === '' || !isText(body.label, LIMITS.label)) return null
  if (body.detail !== undefined && !isText(body.detail, LIMITS.detail)) return null
  if (body.section !== undefined && (!isText(body.section, LIMITS.section) || body.section === '')) return null
  if (body.area !== undefined && typeof body.area !== 'boolean') return null
  if (body.send !== undefined && typeof body.send !== 'boolean') return null
  return {
    anchor: body.anchor,
    label: body.label.trim() || 'Comment',
    ...body.detail ? { detail: body.detail as string } : {},
    ...body.area ? { area: true as const } : {},
    ...body.section ? { section: body.section as string } : {},
    text,
    ...body.send ? { send: true as const } : {},
  }
}
export function readReply(body: unknown): { text: string; send?: true } | null {
  if (!isRecord(body)) return null
  const text = cleanText(body.text)
  if (text === null) return null
  if (body.send !== undefined && typeof body.send !== 'boolean') return null
  return { text, ...body.send ? { send: true as const } : {} }
}
export const readEdit = readReply
export function readStatus(body: unknown) {
  return isRecord(body) && (body.status === 'open' || body.status === 'resolved') ? body.status : null
}
export function parseDoc(data: unknown): CommentsDoc {
  if (!isRecord(data) || data.version !== COMMENTS_VERSION || !Array.isArray(data.threads)) {
    throw new CommentsError('COMMENTS_FILE_INVALID', `not a version ${COMMENTS_VERSION} comments document`, 500)
  }
  const threads = data.threads.filter((t): t is CommentThread => isRecord(t) && typeof t.id === 'string' && typeof t.anchor === 'string'
    && typeof t.label === 'string' && (t.status === 'open' || t.status === 'resolved') && Array.isArray(t.messages)
    && t.messages.every(m => isRecord(m) && typeof m.text === 'string' && isRecord(m.author) && (m.author.kind === 'user' || m.author.kind === 'agent')))
  for (const t of threads) if (!isRecord(t.location)) t.location = {}
  return { version: COMMENTS_VERSION, threads }
}
export function addThread(doc: CommentsDoc, input: NewThread, location: Record<string, unknown>, author: CommentAuthor, now: string) {
  const thread: CommentThread = {
    id: uniqueId(doc),
    anchor: input.anchor,
    label: input.label,
    ...input.detail ? { detail: input.detail } : {},
    location: { ...location, ...input.section ? { section: input.section } : {}, ...input.area ? { area: true } : {} },
    status: 'open',
    createdAt: now,
    updatedAt: now,
    messages: [{ id: newId('m'), author, text: input.text, at: now }],
  }
  if (input.send) sendToAgent(thread, now)
  doc.threads.push(thread)
  return thread
}
function uniqueId(doc: CommentsDoc) {
  for (;;) {
    const id = newId('c')
    if (!doc.threads.some(t => t.id === id)) return id
  }
}
export function addMessage(thread: CommentThread, author: CommentAuthor, text: string, now: string) {
  const message: CommentMessage = { id: newId('m'), author, text, at: now }
  thread.messages.push(message)
  thread.updatedAt = now
  if (author.kind === 'agent') {
    if (thread.agent) thread.agent = { ...thread.agent, status: 'replied', repliedAt: now }
  } else if (thread.status === 'resolved') {
    thread.status = 'open'
    delete thread.resolvedAt
  }
  return message
}
export function editMessage(thread: CommentThread, messageId: string, text: string, now: string, actorId: string) {
  const message = thread.messages.find(m => m.id === messageId)
  if (!message) throw new CommentsError('MESSAGE_NOT_FOUND', `No message ${messageId} in ${thread.id}.`, 404)
  if (message.author.kind !== 'user' || message.author.id !== actorId) throw new CommentsError('MESSAGE_NOT_EDITABLE', 'Only your own messages can be edited.', 403)
  if (message.text !== text) {
    message.text = text
    message.editedAt = now
    thread.updatedAt = now
  }
  return message
}
export function canSendToAgent(thread: CommentThread) {
  const last = thread.messages.at(-1)
  if (thread.status !== 'open' || !last || last.author.kind !== 'user') return false
  return !thread.agent || (last.editedAt ?? last.at) > thread.agent.sentAt
}
export function sendToAgent(thread: CommentThread, now: string) {
  thread.agent = { status: 'pending', sentAt: now }
  thread.updatedAt = now
}
export function markDelivered(thread: CommentThread, now: string, via: string) {
  if (thread.agent?.status !== 'pending') return
  thread.agent = { ...thread.agent, status: 'delivered', deliveredAt: now, via }
}
export function setStatus(thread: CommentThread, status: 'open' | 'resolved', now: string) {
  if (thread.status === status) return
  thread.status = status
  thread.updatedAt = now
  if (status === 'resolved') thread.resolvedAt = now
  else delete thread.resolvedAt
}
export function findThread(doc: CommentsDoc, ref: string) {
  const exact = doc.threads.find(t => t.id === ref)
  if (exact) return exact
  const matches = ref.length >= 3 ? doc.threads.filter(t => t.id.startsWith(ref)) : []
  if (matches.length === 1) return matches[0]
  throw new CommentsError(matches.length ? 'AMBIGUOUS_COMMENT' : 'COMMENT_NOT_FOUND',
    matches.length ? `${ref} matches ${matches.length} comments; give more of the id.` : `No comment ${ref}.`, 404)
}
export function openThreads(doc: CommentsDoc) {
  return doc.threads.filter(t => t.status === 'open').sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)
}
export const pendingForAgent = (doc: CommentsDoc) => openThreads(doc).filter(t => t.agent?.status === 'pending')
export function agentView(thread: CommentThread, n?: number) {
  return {
    id: thread.id,
    ...n !== undefined ? { n } : {},
    status: thread.status,
    ...thread.location.file ? { file: thread.location.file } : {},
    where: thread.label,
    ...thread.detail ? { detail: thread.detail } : {},
    location: thread.location,
    anchor: thread.anchor,
    ...thread.agent ? { agent: thread.agent } : {},
    messages: thread.messages.map(m => ({ from: m.author.kind, name: m.author.name, text: m.text, at: m.at, ...m.editedAt ? { editedAt: m.editedAt } : {} })),
  }
}
export function agentViews(doc: CommentsDoc, threads: CommentThread[]) {
  const open = openThreads(doc)
  return threads.map(t => {
    const i = open.indexOf(t)
    return agentView(t, i >= 0 ? i + 1 : undefined)
  })
}

export async function readComments(db: Queryable, artifactId: string): Promise<CommentsDoc> {
  const { rows } = await db.query<{ doc: unknown }>('SELECT doc FROM artifact_comments WHERE artifact_id=$1', [artifactId])
  return rows[0] ? parseDoc(rows[0].doc) : emptyDoc()
}

/** One locked read-modify-write of the document; unchanged documents are not rewritten. */
export async function updateComments<T>(db: Queryable, artifactId: string, change: (doc: CommentsDoc) => T | Promise<T>): Promise<T> {
  await db.query('SELECT id FROM artifacts WHERE id=$1 FOR UPDATE', [artifactId])
  const doc = await readComments(db, artifactId)
  const before = JSON.stringify(doc)
  const result = await change(doc)
  const after = JSON.stringify(doc)
  if (after !== before) {
    await db.query(`INSERT INTO artifact_comments(artifact_id,doc) VALUES($1,$2::jsonb)
      ON CONFLICT(artifact_id) DO UPDATE SET doc=EXCLUDED.doc,updated_at=NOW()`, [artifactId, after])
  }
  return result
}
