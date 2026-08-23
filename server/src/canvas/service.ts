import { createHash, randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { CH_CANVAS, publish, type CanvasEvent } from '../redis.js'

export const CANVAS_FRAME_TYPES = ['html', 'markdown', 'document', 'image', 'artifact'] as const
export type CanvasFrameType = typeof CANVAS_FRAME_TYPES[number]
export type CanvasActorKind = 'user' | 'agent'

export interface CanvasFrame {
  id: string
  canvasId: string
  type: CanvasFrameType
  title: string
  x: number
  y: number
  width: number
  height: number
  content: string
  data: Record<string, unknown>
  revision: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

export interface CanvasPresence {
  participantId: string
  participantKind: CanvasActorKind
  status: string
  frameId: string | null
  lastSeenAt: string
}

export interface CanvasComment {
  id: string
  canvasId: string
  frameId: string | null
  authorId: string
  authorKind: CanvasActorKind
  body: string
  createdAt: string
}

export interface CanvasActivity {
  id: string
  canvasId: string
  frameId: string | null
  actorId: string
  actorKind: CanvasActorKind
  action: string
  detail: Record<string, unknown>
  createdAt: string
}

export interface CanvasSnapshot {
  id: string
  title: string
  companyId: string
  createdBy: string
  createdAt: string
  updatedAt: string
  frames: CanvasFrame[]
  presence: CanvasPresence[]
  comments: CanvasComment[]
  activity: CanvasActivity[]
}

type FrameRow = {
  id: string; canvas_id: string; type: CanvasFrameType; title: string
  x: number | string; y: number | string; width: number | string; height: number | string
  content: string; data: Record<string, unknown> | null; revision: number | string
  created_by: string; updated_by: string; created_at: string; updated_at: string
}

const MAX_FRAME_CONTENT = 1024 * 1024
const MAX_FRAME_TITLE = 200
const MIN_FRAME_SIZE = 120
const MAX_FRAME_SIZE = 8_000

function stableCanvasId(companyId: string): string {
  return `canvas-${createHash('sha256').update(companyId).digest('hex').slice(0, 20)}`
}

function finiteNumber(value: unknown, name: string): number {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number`)
  return number
}

function frameSize(value: unknown, name: string, fallback: number): number {
  if (value === undefined) return fallback
  return Math.min(MAX_FRAME_SIZE, Math.max(MIN_FRAME_SIZE, finiteNumber(value, name)))
}

function frameType(value: unknown): CanvasFrameType {
  const type = String(value ?? 'markdown')
  if (!(CANVAS_FRAME_TYPES as readonly string[]).includes(type)) {
    throw new Error(`type must be one of: ${CANVAS_FRAME_TYPES.join(', ')}`)
  }
  return type as CanvasFrameType
}

function contentValue(value: unknown): string {
  const content = typeof value === 'string' ? value : ''
  if (Buffer.byteLength(content, 'utf8') > MAX_FRAME_CONTENT) throw new Error('frame content exceeds 1 MiB')
  return content
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('data must be an object')
  return value as Record<string, unknown>
}

function toFrame(row: FrameRow): CanvasFrame {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    type: row.type,
    title: row.title,
    x: Number(row.x),
    y: Number(row.y),
    width: Number(row.width),
    height: Number(row.height),
    content: row.content,
    data: row.data ?? {},
    revision: Number(row.revision),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function publishCanvas(companyId: string, event: Omit<CanvasEvent, 'type' | 'companyId'>): Promise<void> {
  await publish(CH_CANVAS, { type: 'canvas.changed', companyId, ...event })
}

async function ensureCanvas(companyId: string, actorId: string): Promise<{ id: string; title: string; created_by: string; created_at: string; updated_at: string }> {
  const id = stableCanvasId(companyId)
  await pool.query(
    `INSERT INTO canvases (id, company_id, title, created_by)
     VALUES ($1, $2, 'Shared Canvas', $3)
     ON CONFLICT (company_id) DO NOTHING`,
    [id, companyId, actorId],
  )
  const { rows } = await pool.query<{
    id: string; title: string; created_by: string; created_at: string; updated_at: string
  }>(
    `SELECT id, title, created_by, created_at, updated_at
       FROM canvases WHERE company_id = $1 LIMIT 1`,
    [companyId],
  )
  if (!rows[0]) throw new Error('canvas is not available')
  return rows[0]
}

async function requireFrame(companyId: string, frameId: string): Promise<CanvasFrame> {
  const { rows } = await pool.query<FrameRow>(
    `SELECT f.* FROM canvas_frames f
       JOIN canvases c ON c.id = f.canvas_id
      WHERE f.id = $1 AND c.company_id = $2 LIMIT 1`,
    [frameId, companyId],
  )
  if (!rows[0]) throw new Error('frame not found')
  return toFrame(rows[0])
}

async function logActivity(input: {
  companyId: string; canvasId: string; actorId: string; actorKind: CanvasActorKind
  action: string; frameId?: string | null; detail?: Record<string, unknown>
}): Promise<CanvasActivity> {
  const id = `activity-${randomUUID()}`
  const { rows } = await pool.query<{
    id: string; canvas_id: string; frame_id: string | null; actor_id: string
    actor_kind: CanvasActorKind; action: string; detail: Record<string, unknown>; created_at: string
  }>(
    `INSERT INTO canvas_activity (id, canvas_id, frame_id, actor_id, actor_kind, action, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING *`,
    [id, input.canvasId, input.frameId ?? null, input.actorId, input.actorKind, input.action, JSON.stringify(input.detail ?? {})],
  )
  const row = rows[0]
  const activity: CanvasActivity = {
    id: row.id, canvasId: row.canvas_id, frameId: row.frame_id,
    actorId: row.actor_id, actorKind: row.actor_kind, action: row.action,
    detail: row.detail ?? {}, createdAt: row.created_at,
  }
  await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: input.canvasId, activity })
  return activity
}

export async function getCanvasSnapshot(companyId: string, actorId: string): Promise<CanvasSnapshot> {
  const canvas = await ensureCanvas(companyId, actorId)
  const [frames, presence, comments, activity] = await Promise.all([
    pool.query<FrameRow>(`SELECT * FROM canvas_frames WHERE canvas_id=$1 ORDER BY created_at ASC`, [canvas.id]),
    pool.query<{
      participant_id: string; participant_kind: CanvasActorKind; status: string
      frame_id: string | null; last_seen_at: string
    }>(
      `SELECT participant_id, participant_kind, status, frame_id, last_seen_at
         FROM canvas_presence
        WHERE canvas_id=$1 AND last_seen_at > NOW() - INTERVAL '2 minutes'
        ORDER BY last_seen_at DESC`, [canvas.id],
    ),
    pool.query<{
      id: string; canvas_id: string; frame_id: string | null; author_id: string
      author_kind: CanvasActorKind; body: string; created_at: string
    }>(`SELECT * FROM canvas_comments WHERE canvas_id=$1 ORDER BY created_at DESC LIMIT 100`, [canvas.id]),
    pool.query<{
      id: string; canvas_id: string; frame_id: string | null; actor_id: string
      actor_kind: CanvasActorKind; action: string; detail: Record<string, unknown>; created_at: string
    }>(`SELECT * FROM canvas_activity WHERE canvas_id=$1 ORDER BY created_at DESC LIMIT 100`, [canvas.id]),
  ])
  return {
    id: canvas.id,
    title: canvas.title,
    companyId,
    createdBy: canvas.created_by,
    createdAt: canvas.created_at,
    updatedAt: canvas.updated_at,
    frames: frames.rows.map(toFrame),
    presence: presence.rows.map((row) => ({
      participantId: row.participant_id, participantKind: row.participant_kind,
      status: row.status, frameId: row.frame_id, lastSeenAt: row.last_seen_at,
    })),
    comments: comments.rows.map((row) => ({
      id: row.id, canvasId: row.canvas_id, frameId: row.frame_id,
      authorId: row.author_id, authorKind: row.author_kind, body: row.body, createdAt: row.created_at,
    })),
    activity: activity.rows.map((row) => ({
      id: row.id, canvasId: row.canvas_id, frameId: row.frame_id,
      actorId: row.actor_id, actorKind: row.actor_kind, action: row.action,
      detail: row.detail ?? {}, createdAt: row.created_at,
    })),
  }
}

export async function createCanvasFrame(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; idempotencyKey?: string
  frame: Record<string, unknown>
}): Promise<CanvasFrame> {
  const canvas = await ensureCanvas(input.companyId, input.actorId)
  const type = frameType(input.frame.type)
  const title = String(input.frame.title ?? `${type[0].toUpperCase()}${type.slice(1)} frame`).trim().slice(0, MAX_FRAME_TITLE) || 'Untitled frame'
  const content = contentValue(input.frame.content)
  const data = objectValue(input.frame.data)
  const id = input.idempotencyKey
    ? `frame-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24)}`
    : `frame-${randomUUID()}`
  const { rows } = await pool.query<FrameRow>(
    `INSERT INTO canvas_frames
       (id, canvas_id, type, title, x, y, width, height, content, data, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)
     ON CONFLICT (id) DO UPDATE SET id=canvas_frames.id
     RETURNING *`,
    [id, canvas.id, type, title,
      finiteNumber(input.frame.x ?? 80, 'x'), finiteNumber(input.frame.y ?? 80, 'y'),
      frameSize(input.frame.width, 'width', 420), frameSize(input.frame.height, 'height', 300),
      content, JSON.stringify(data), input.actorId],
  )
  const frame = toFrame(rows[0])
  await pool.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [canvas.id])
  await publishCanvas(input.companyId, { kind: 'frame.created', canvasId: canvas.id, frame })
  await logActivity({
    companyId: input.companyId, canvasId: canvas.id, actorId: input.actorId,
    actorKind: input.actorKind, frameId: frame.id, action: 'frame.created',
    detail: { title: frame.title, type: frame.type },
  })
  return frame
}

export async function updateCanvasFrame(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; frameId: string
  patch: Record<string, unknown>
}): Promise<CanvasFrame> {
  const current = await requireFrame(input.companyId, input.frameId)
  const sets: string[] = []
  const values: unknown[] = []
  const add = (column: string, value: unknown, cast = '') => {
    values.push(value)
    sets.push(`${column}=$${values.length}${cast}`)
  }
  if (input.patch.type !== undefined) add('type', frameType(input.patch.type))
  if (input.patch.title !== undefined) add('title', String(input.patch.title).trim().slice(0, MAX_FRAME_TITLE) || 'Untitled frame')
  if (input.patch.x !== undefined) add('x', finiteNumber(input.patch.x, 'x'))
  if (input.patch.y !== undefined) add('y', finiteNumber(input.patch.y, 'y'))
  if (input.patch.width !== undefined) add('width', frameSize(input.patch.width, 'width', current.width))
  if (input.patch.height !== undefined) add('height', frameSize(input.patch.height, 'height', current.height))
  if (input.patch.content !== undefined) add('content', contentValue(input.patch.content))
  if (input.patch.data !== undefined) add('data', JSON.stringify(objectValue(input.patch.data)), '::jsonb')
  if (sets.length === 0) return current
  add('updated_by', input.actorId)
  values.push(input.frameId, input.companyId)
  const { rows } = await pool.query<FrameRow>(
    `UPDATE canvas_frames f
        SET ${sets.join(', ')}, revision=revision+1, updated_at=NOW()
       FROM canvases c
      WHERE f.id=$${values.length - 1} AND f.canvas_id=c.id AND c.company_id=$${values.length}
      RETURNING f.*`, values,
  )
  if (!rows[0]) throw new Error('frame not found')
  const frame = toFrame(rows[0])
  await pool.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [frame.canvasId])
  await publishCanvas(input.companyId, { kind: 'frame.updated', canvasId: frame.canvasId, frame })
  await logActivity({
    companyId: input.companyId, canvasId: frame.canvasId, actorId: input.actorId,
    actorKind: input.actorKind, frameId: frame.id, action: 'frame.updated',
    detail: { fields: Object.keys(input.patch) },
  })
  return frame
}

export async function appendCanvasFrameContent(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; frameId: string; content: string
}): Promise<CanvasFrame> {
  if (!input.content) return requireFrame(input.companyId, input.frameId)
  if (Buffer.byteLength(input.content, 'utf8') > 64 * 1024) throw new Error('append content exceeds 64 KiB')
  const { rows } = await pool.query<FrameRow>(
    `UPDATE canvas_frames f
        SET content=f.content || $1, updated_by=$2, revision=revision+1, updated_at=NOW()
       FROM canvases c
      WHERE f.id=$3 AND f.canvas_id=c.id AND c.company_id=$4
        AND octet_length(f.content || $1) <= $5
      RETURNING f.*`,
    [input.content, input.actorId, input.frameId, input.companyId, MAX_FRAME_CONTENT],
  )
  if (!rows[0]) {
    await requireFrame(input.companyId, input.frameId)
    throw new Error('frame content exceeds 1 MiB')
  }
  const frame = toFrame(rows[0])
  await pool.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [frame.canvasId])
  await publishCanvas(input.companyId, { kind: 'frame.updated', canvasId: frame.canvasId, frame })
  await logActivity({
    companyId: input.companyId, canvasId: frame.canvasId, actorId: input.actorId,
    actorKind: input.actorKind, frameId: frame.id, action: 'frame.content_appended',
    detail: { characters: input.content.length },
  })
  return frame
}

export async function deleteCanvasFrame(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; frameId: string
}): Promise<{ id: string; canvasId: string }> {
  const frame = await requireFrame(input.companyId, input.frameId)
  await pool.query(`DELETE FROM canvas_frames WHERE id=$1`, [frame.id])
  await pool.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [frame.canvasId])
  await publishCanvas(input.companyId, { kind: 'frame.deleted', canvasId: frame.canvasId, frameId: frame.id })
  await logActivity({
    companyId: input.companyId, canvasId: frame.canvasId, actorId: input.actorId,
    actorKind: input.actorKind, action: 'frame.deleted', detail: { title: frame.title, type: frame.type },
  })
  return { id: frame.id, canvasId: frame.canvasId }
}

export async function setCanvasStatus(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; status: string; frameId?: string | null
}): Promise<CanvasPresence | null> {
  const canvas = await ensureCanvas(input.companyId, input.actorId)
  const status = input.status.trim().slice(0, 120)
  if (!status || status === 'offline') {
    await pool.query(`DELETE FROM canvas_presence WHERE canvas_id=$1 AND participant_id=$2`, [canvas.id, input.actorId])
    await publishCanvas(input.companyId, {
      kind: 'presence.removed', canvasId: canvas.id, participantId: input.actorId,
    })
    return null
  }
  if (input.frameId) await requireFrame(input.companyId, input.frameId)
  const { rows } = await pool.query<{
    participant_id: string; participant_kind: CanvasActorKind; status: string
    frame_id: string | null; last_seen_at: string
  }>(
    `INSERT INTO canvas_presence (canvas_id, participant_id, participant_kind, status, frame_id, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (canvas_id, participant_id) DO UPDATE SET
       participant_kind=EXCLUDED.participant_kind, status=EXCLUDED.status,
       frame_id=EXCLUDED.frame_id, last_seen_at=NOW()
     RETURNING participant_id, participant_kind, status, frame_id, last_seen_at`,
    [canvas.id, input.actorId, input.actorKind, status, input.frameId ?? null],
  )
  const row = rows[0]
  const presence: CanvasPresence = {
    participantId: row.participant_id, participantKind: row.participant_kind,
    status: row.status, frameId: row.frame_id, lastSeenAt: row.last_seen_at,
  }
  await publishCanvas(input.companyId, { kind: 'presence.updated', canvasId: canvas.id, presence })
  return presence
}

export async function addCanvasComment(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; frameId?: string | null; body: string
}): Promise<CanvasComment> {
  const canvas = await ensureCanvas(input.companyId, input.actorId)
  if (input.frameId) await requireFrame(input.companyId, input.frameId)
  const body = input.body.trim().slice(0, 8_000)
  if (!body) throw new Error('body is required')
  const id = `comment-${randomUUID()}`
  const { rows } = await pool.query<{
    id: string; canvas_id: string; frame_id: string | null; author_id: string
    author_kind: CanvasActorKind; body: string; created_at: string
  }>(
    `INSERT INTO canvas_comments (id, canvas_id, frame_id, author_id, author_kind, body)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [id, canvas.id, input.frameId ?? null, input.actorId, input.actorKind, body],
  )
  const row = rows[0]
  const comment: CanvasComment = {
    id: row.id, canvasId: row.canvas_id, frameId: row.frame_id,
    authorId: row.author_id, authorKind: row.author_kind, body: row.body, createdAt: row.created_at,
  }
  await publishCanvas(input.companyId, { kind: 'comment.created', canvasId: canvas.id, comment })
  await logActivity({
    companyId: input.companyId, canvasId: canvas.id, actorId: input.actorId,
    actorKind: input.actorKind, frameId: input.frameId, action: 'comment.created',
  })
  return comment
}
