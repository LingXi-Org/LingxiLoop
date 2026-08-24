import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db/pool.js'
import { CH_CANVAS, publish, type CanvasEvent } from '../redis.js'
import { assertCanvasDependencyDAG, canvasAgentColor, canvasWorkArea } from './orchestration.js'

export const CANVAS_FRAME_TYPES = ['html', 'markdown', 'document', 'image', 'artifact'] as const
export type CanvasFrameType = typeof CANVAS_FRAME_TYPES[number]
export type CanvasActorKind = 'user' | 'agent'
export type CanvasWorkspaceStatus = 'active' | 'summarizing' | 'completed' | 'stopped' | 'failed'
export type CanvasAssignmentStatus = 'queued' | 'blocked' | 'working' | 'waiting' | 'completed' | 'failed' | 'cancelled'

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
  color?: string | null
  cursorX?: number | null
  cursorY?: number | null
  lastSeenAt: string
}

export interface CanvasAgentAssignment {
  id: string
  canvasId: string
  agentId: string
  assignment: string
  color: string
  status: CanvasAssignmentStatus
  workArea: { x: number; y: number; width: number; height: number }
  activeFrameId: string | null
  cursor: { x: number; y: number } | null
  workId: string | null
  dependsOnAgentIds: string[]
  result: string | null
  error: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
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
  conversationId: string | null
  triggerClientMsgNo: string | null
  goal: string
  initiatorAgentId: string | null
  status: CanvasWorkspaceStatus
  origin: string
  summary: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  frames: CanvasFrame[]
  assignments: CanvasAgentAssignment[]
  presence: CanvasPresence[]
  comments: CanvasComment[]
  activity: CanvasActivity[]
}

export interface CanvasWorkspaceSummary {
  id: string
  title: string
  goal: string
  conversationId: string | null
  initiatorAgentId: string | null
  status: CanvasWorkspaceStatus
  origin: string
  frameCount: number
  assignmentCount: number
  updatedAt: string
  createdAt: string
}

export interface CanvasMemberInput {
  agentId: string
  assignment: string
  dependsOnAgentIds?: string[]
}

type FrameRow = {
  id: string; canvas_id: string; type: CanvasFrameType; title: string
  x: number | string; y: number | string; width: number | string; height: number | string
  content: string; data: Record<string, unknown> | null; revision: number | string
  created_by: string; updated_by: string; created_at: string; updated_at: string
}

type CanvasRow = {
  id: string; company_id: string; title: string; conversation_id: string | null
  trigger_client_msg_no: string | null; goal: string; initiator_agent_id: string | null
  status: CanvasWorkspaceStatus; origin: string; summary: string | null
  created_by: string; created_at: string; updated_at: string
}

type AssignmentRow = {
  id: string; canvas_id: string; agent_id: string; assignment: string; color: string
  status: CanvasAssignmentStatus; work_x: number | string; work_y: number | string
  work_width: number | string; work_height: number | string; active_frame_id: string | null
  cursor_x: number | string | null; cursor_y: number | string | null; work_id: string | null
  result: string | null; error: string | null; started_at: string | null; completed_at: string | null
  updated_at: string
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

async function publishCanvas(companyId: string, event: Omit<CanvasEvent, 'type' | 'companyId' | 'timestamp'>): Promise<void> {
  await publish(CH_CANVAS, { type: 'canvas.changed', companyId, timestamp: new Date().toISOString(), ...event })
}

function toAssignment(row: AssignmentRow, dependencies: string[] = []): CanvasAgentAssignment {
  return {
    id: row.id, canvasId: row.canvas_id, agentId: row.agent_id, assignment: row.assignment,
    color: row.color, status: row.status,
    workArea: { x: Number(row.work_x), y: Number(row.work_y), width: Number(row.work_width), height: Number(row.work_height) },
    activeFrameId: row.active_frame_id,
    cursor: row.cursor_x === null || row.cursor_y === null ? null : { x: Number(row.cursor_x), y: Number(row.cursor_y) },
    workId: row.work_id, dependsOnAgentIds: dependencies, result: row.result, error: row.error,
    startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at,
  }
}

async function ensureCanvas(companyId: string, actorId: string): Promise<CanvasRow> {
  const id = stableCanvasId(companyId)
  await pool.query(
    `INSERT INTO canvases (id, company_id, title, created_by, origin)
     VALUES ($1, $2, 'Legacy Canvas', $3, 'legacy')
     ON CONFLICT (id) DO NOTHING`,
    [id, companyId, actorId],
  )
  const { rows } = await pool.query<CanvasRow>(
    `SELECT * FROM canvases WHERE id=$1 AND company_id=$2 LIMIT 1`, [id, companyId],
  )
  if (!rows[0]) throw new Error('canvas is not available')
  return rows[0]
}

async function requireCanvas(companyId: string, canvasId: string): Promise<CanvasRow> {
  const { rows } = await pool.query<CanvasRow>(`SELECT * FROM canvases WHERE id=$1 AND company_id=$2 LIMIT 1`, [canvasId, companyId])
  if (!rows[0]) throw new Error('canvas not found')
  return rows[0]
}

async function resolveCanvas(companyId: string, actorId: string, canvasId?: string): Promise<CanvasRow> {
  return canvasId ? requireCanvas(companyId, canvasId) : ensureCanvas(companyId, actorId)
}

async function resolveCanvasRead(companyId: string, canvasId?: string): Promise<CanvasRow> {
  if (canvasId) return requireCanvas(companyId, canvasId)
  const { rows } = await pool.query<CanvasRow>(`SELECT * FROM canvases WHERE company_id=$1 ORDER BY updated_at DESC LIMIT 1`, [companyId])
  if (!rows[0]) throw Object.assign(new Error('canvas not found'), { status: 404 })
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

export async function listCanvasWorkspaces(companyId: string, conversationId?: string): Promise<CanvasWorkspaceSummary[]> {
  const values: unknown[] = [companyId]
  const conversation = conversationId ? `AND c.conversation_id=$${values.push(conversationId)}` : ''
  const { rows } = await pool.query<{
    id: string; title: string; goal: string; conversation_id: string | null; initiator_agent_id: string | null
    status: CanvasWorkspaceStatus; origin: string; frame_count: string | number; assignment_count: string | number
    updated_at: string; created_at: string
  }>(
    `SELECT c.id,c.title,c.goal,c.conversation_id,c.initiator_agent_id,c.status,c.origin,c.updated_at,c.created_at,
            COUNT(DISTINCT f.id)::int AS frame_count, COUNT(DISTINCT a.id)::int AS assignment_count
       FROM canvases c LEFT JOIN canvas_frames f ON f.canvas_id=c.id
       LEFT JOIN canvas_agent_assignments a ON a.canvas_id=c.id
      WHERE c.company_id=$1 ${conversation}
      GROUP BY c.id ORDER BY c.updated_at DESC`, values,
  )
  return rows.map((row) => ({
    id: row.id, title: row.title, goal: row.goal, conversationId: row.conversation_id,
    initiatorAgentId: row.initiator_agent_id, status: row.status, origin: row.origin,
    frameCount: Number(row.frame_count), assignmentCount: Number(row.assignment_count),
    updatedAt: row.updated_at, createdAt: row.created_at,
  }))
}

export async function getCanvasSnapshot(companyId: string, actorId: string, canvasId?: string): Promise<CanvasSnapshot> {
  void actorId
  const canvas = await resolveCanvasRead(companyId, canvasId)
  const [frames, presence, assignments, dependencies, comments, activity] = await Promise.all([
    pool.query<FrameRow>(`SELECT * FROM canvas_frames WHERE canvas_id=$1 ORDER BY created_at ASC`, [canvas.id]),
    pool.query<{
      participant_id: string; participant_kind: CanvasActorKind; status: string
      frame_id: string | null; color: string | null; cursor_x: number | string | null
      cursor_y: number | string | null; last_seen_at: string
    }>(
      `SELECT participant_id, participant_kind, status, frame_id, color, cursor_x, cursor_y, last_seen_at
         FROM canvas_presence
        WHERE canvas_id=$1 AND last_seen_at > NOW() - INTERVAL '2 minutes'
        ORDER BY last_seen_at DESC`, [canvas.id],
    ),
    pool.query<AssignmentRow>(`SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at ASC`, [canvas.id]),
    pool.query<{ agent_id: string; depends_on_agent_id: string }>(
      `SELECT child.agent_id, parent.agent_id AS depends_on_agent_id
         FROM canvas_assignment_dependencies d
         JOIN canvas_agent_assignments child ON child.id=d.assignment_id
         JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
        WHERE child.canvas_id=$1`, [canvas.id],
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
    conversationId: canvas.conversation_id,
    triggerClientMsgNo: canvas.trigger_client_msg_no,
    goal: canvas.goal,
    initiatorAgentId: canvas.initiator_agent_id,
    status: canvas.status,
    origin: canvas.origin,
    summary: canvas.summary,
    createdBy: canvas.created_by,
    createdAt: canvas.created_at,
    updatedAt: canvas.updated_at,
    frames: frames.rows.map(toFrame),
    assignments: assignments.rows.map((row) => toAssignment(row, dependencies.rows.filter((item) => item.agent_id === row.agent_id).map((item) => item.depends_on_agent_id))),
    presence: presence.rows.map((row) => ({
      participantId: row.participant_id, participantKind: row.participant_kind,
      status: row.status, frameId: row.frame_id, color: row.color,
      cursorX: row.cursor_x === null ? null : Number(row.cursor_x), cursorY: row.cursor_y === null ? null : Number(row.cursor_y),
      lastSeenAt: row.last_seen_at,
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
  canvasId?: string
  frame: Record<string, unknown>
}): Promise<CanvasFrame> {
  const canvas = await resolveCanvas(input.companyId, input.actorId, input.canvasId)
  const type = frameType(input.frame.type)
  const title = String(input.frame.title ?? `${type[0].toUpperCase()}${type.slice(1)} frame`).trim().slice(0, MAX_FRAME_TITLE) || 'Untitled frame'
  const content = contentValue(input.frame.content)
  const data = objectValue(input.frame.data)
  const id = input.idempotencyKey
    ? `frame-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24)}`
    : `frame-${randomUUID()}`
  let defaultX = 80; let defaultY = 80
  if (input.actorKind === 'agent') {
    const { rows: areas } = await pool.query<{ work_x: number | string; work_y: number | string }>(
      `SELECT work_x,work_y FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2`, [canvas.id, input.actorId],
    )
    if (areas[0]) { defaultX = Number(areas[0].work_x) + 40; defaultY = Number(areas[0].work_y) + 100 }
  }
  const { rows } = await pool.query<FrameRow>(
    `INSERT INTO canvas_frames
       (id, canvas_id, type, title, x, y, width, height, content, data, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)
     ON CONFLICT (id) DO UPDATE SET id=canvas_frames.id
     RETURNING *`,
    [id, canvas.id, type, title,
      finiteNumber(input.frame.x ?? defaultX, 'x'), finiteNumber(input.frame.y ?? defaultY, 'y'),
      frameSize(input.frame.width, 'width', 420), frameSize(input.frame.height, 'height', 300),
      content, JSON.stringify(data), input.actorId],
  )
  const frame = toFrame(rows[0])
  if (input.actorKind === 'agent') {
    await pool.query(
      `UPDATE canvas_agent_assignments SET active_frame_id=$3,cursor_x=$4,cursor_y=$5,status='working',
         started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE canvas_id=$1 AND agent_id=$2`,
      [canvas.id, input.actorId, frame.id, frame.x + frame.width / 2, frame.y + 28],
    )
  }
  await pool.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [canvas.id])
  await publishCanvas(input.companyId, { kind: 'frame.created', canvasId: canvas.id, revision: frame.revision, frame })
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
  const contentMutation = ['type', 'title', 'content', 'data'].some((key) => input.patch[key] !== undefined)
  const baseRevision = input.patch.baseRevision === undefined ? null : Number(input.patch.baseRevision)
  if (contentMutation && !Number.isInteger(baseRevision)) throw new Error('baseRevision is required for content updates')
  values.push(input.frameId, input.companyId, baseRevision)
  const { rows } = await pool.query<FrameRow>(
    `UPDATE canvas_frames f
        SET ${sets.join(', ')}, revision=revision+1, updated_at=NOW()
       FROM canvases c
      WHERE f.id=$${values.length - 2} AND f.canvas_id=c.id AND c.company_id=$${values.length - 1}
        AND ($${values.length}::bigint IS NULL OR f.revision=$${values.length}::bigint)
      RETURNING f.*`, values,
  )
  if (!rows[0]) {
    const latest = await requireFrame(input.companyId, input.frameId)
    throw Object.assign(new Error(`frame revision conflict; latest revision is ${latest.revision}`), { status: 409, latestFrame: latest })
  }
  const frame = toFrame(rows[0])
  if (input.actorKind === 'agent') {
    await pool.query(`UPDATE canvas_agent_assignments SET active_frame_id=$3,cursor_x=$4,cursor_y=$5,updated_at=NOW() WHERE canvas_id=$1 AND agent_id=$2`,
      [frame.canvasId, input.actorId, frame.id, frame.x + frame.width / 2, frame.y + 28])
  }
  await pool.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [frame.canvasId])
  await publishCanvas(input.companyId, { kind: 'frame.updated', canvasId: frame.canvasId, revision: frame.revision, frame })
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
  await publishCanvas(input.companyId, { kind: 'frame.updated', canvasId: frame.canvasId, revision: frame.revision, frame })
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
  companyId: string; actorId: string; actorKind: CanvasActorKind; status: string; canvasId?: string
  frameId?: string | null; cursorX?: number | null; cursorY?: number | null
}): Promise<CanvasPresence | null> {
  const canvas = await resolveCanvas(input.companyId, input.actorId, input.canvasId)
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
    frame_id: string | null; color: string | null; cursor_x: number | string | null; cursor_y: number | string | null; last_seen_at: string
  }>(
    `INSERT INTO canvas_presence (canvas_id, participant_id, participant_kind, status, frame_id, color, cursor_x, cursor_y, last_seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (canvas_id, participant_id) DO UPDATE SET
       participant_kind=EXCLUDED.participant_kind, status=EXCLUDED.status,
       frame_id=EXCLUDED.frame_id, color=COALESCE(EXCLUDED.color,canvas_presence.color),
       cursor_x=COALESCE(EXCLUDED.cursor_x,canvas_presence.cursor_x),cursor_y=COALESCE(EXCLUDED.cursor_y,canvas_presence.cursor_y),last_seen_at=NOW()
     RETURNING participant_id, participant_kind, status, frame_id, color, cursor_x, cursor_y, last_seen_at`,
    [canvas.id, input.actorId, input.actorKind, status, input.frameId ?? null, null, input.cursorX ?? null, input.cursorY ?? null],
  )
  const row = rows[0]
  const presence: CanvasPresence = {
    participantId: row.participant_id, participantKind: row.participant_kind,
    status: row.status, frameId: row.frame_id, color: row.color,
    cursorX: row.cursor_x === null ? null : Number(row.cursor_x), cursorY: row.cursor_y === null ? null : Number(row.cursor_y),
    lastSeenAt: row.last_seen_at,
  }
  if (input.actorKind === 'agent') {
    const assignmentStatus = (['queued','blocked','working','waiting','completed','failed','cancelled'] as string[]).includes(status) ? status : 'working'
    await pool.query(
      `UPDATE canvas_agent_assignments SET status=$3,active_frame_id=$4,
         cursor_x=COALESCE($5,cursor_x),cursor_y=COALESCE($6,cursor_y),updated_at=NOW() WHERE canvas_id=$1 AND agent_id=$2`,
      [canvas.id, input.actorId, assignmentStatus, input.frameId ?? null, input.cursorX ?? null, input.cursorY ?? null],
    )
  }
  await publishCanvas(input.companyId, { kind: 'presence.updated', canvasId: canvas.id, presence })
  return presence
}

export async function addCanvasComment(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; canvasId?: string; frameId?: string | null; body: string
}): Promise<CanvasComment> {
  const canvas = await resolveCanvas(input.companyId, input.actorId, input.canvasId)
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

export async function listCanvasAvailableAgents(companyId: string): Promise<Array<{ id: string; name: string; role: string; status: string }>> {
  const { rows } = await pool.query<{ id: string; name: string; role: string | null; status: string | null }>(
    `SELECT id,name,role,status FROM participants
      WHERE company_id=$1 AND kind='agent' AND departed_at IS NULL AND capabilities @> '["canvas"]'::jsonb
      ORDER BY name`, [companyId],
  )
  return rows.map((row) => ({ id: row.id, name: row.name, role: row.role ?? 'Learning Agent', status: row.status ?? 'available' }))
}

async function assertMembersAvailable(client: PoolClient, companyId: string, members: CanvasMemberInput[]): Promise<void> {
  if (members.length === 0) throw new Error('at least one canvas member is required')
  const ids = members.map((member) => member.agentId)
  if (new Set(ids).size !== ids.length) throw new Error('canvas members must be unique')
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM participants WHERE company_id=$1 AND id=ANY($2::text[]) AND kind='agent'
       AND departed_at IS NULL AND capabilities @> '["canvas"]'::jsonb`, [companyId, ids],
  )
  if (rows.length !== ids.length) throw new Error('every selected agent must be active and have the canvas capability')
}

async function insertMembers(client: PoolClient, input: {
  canvas: CanvasRow; members: CanvasMemberInput[]; existing: AssignmentRow[]
}): Promise<AssignmentRow[]> {
  await assertMembersAvailable(client, input.canvas.company_id, input.members)
  const existingIds = new Set(input.existing.map((row) => row.agent_id))
  if (input.members.some((member) => existingIds.has(member.agentId))) throw new Error('agent is already assigned to this canvas')
  assertCanvasDependencyDAG(input.members, existingIds)
  const used = new Set(input.existing.map((row) => row.color))
  const created: AssignmentRow[] = []
  for (const [offset, member] of input.members.entries()) {
    const index = input.existing.length + offset
    const id = `assignment-${createHash('sha256').update(`${input.canvas.id}:${member.agentId}`).digest('hex').slice(0, 28)}`
    const workId = `canvas-work-${createHash('sha256').update(id).digest('hex').slice(0, 28)}`
    const color = canvasAgentColor(member.agentId, used); used.add(color)
    const area = canvasWorkArea(index)
    const blocked = (member.dependsOnAgentIds?.length ?? 0) > 0
    const { rows } = await client.query<AssignmentRow>(
      `INSERT INTO canvas_agent_assignments
         (id,canvas_id,agent_id,assignment,color,status,work_x,work_y,work_width,work_height,work_id,cursor_x,cursor_y)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,680,520,$9,$10,$11)
       ON CONFLICT (canvas_id,agent_id) DO UPDATE SET updated_at=canvas_agent_assignments.updated_at RETURNING *`,
      [id, input.canvas.id, member.agentId, member.assignment.trim(), color, blocked ? 'blocked' : 'queued',
        area.x, area.y, workId, area.x + 40, area.y + 60],
    )
    created.push(rows[0])
  }
  const all = [...input.existing, ...created]
  for (const member of input.members) {
    const child = all.find((row) => row.agent_id === member.agentId)!
    for (const dependencyAgentId of member.dependsOnAgentIds ?? []) {
      const parent = all.find((row) => row.agent_id === dependencyAgentId)
      if (!parent) throw new Error(`unknown dependency agent: ${dependencyAgentId}`)
      await client.query(
        `INSERT INTO canvas_assignment_dependencies (assignment_id,depends_on_assignment_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [child.id, parent.id],
      )
    }
  }
  for (const row of created) {
    await client.query(
      `INSERT INTO agent_work_items
         (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,canvas_id,canvas_assignment_id)
       VALUES ($1,$2,$3,$4,$5,$6,'canvas_worker',$7,180,$8,$9)
       ON CONFLICT (canvas_assignment_id) WHERE canvas_assignment_id IS NOT NULL DO NOTHING`,
      [row.work_id, input.canvas.company_id, row.agent_id, input.canvas.conversation_id,
        input.canvas.trigger_client_msg_no, `canvas:${input.canvas.id}:${row.agent_id}`, row.status === 'queued' ? 'queued' : 'blocked', input.canvas.id, row.id],
    )
  }
  return created
}

export async function startCanvasWorkspace(input: {
  companyId: string; initiatorAgentId: string; conversationId: string; triggerClientMsgNo: string
  title: string; goal: string; members: CanvasMemberInput[]; idempotencyKey: string
}): Promise<CanvasSnapshot> {
  const id = `canvas-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<CanvasRow>(
      `INSERT INTO canvases
         (id,company_id,title,conversation_id,trigger_client_msg_no,goal,initiator_agent_id,status,origin,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active','agent_os',$7)
       ON CONFLICT (id) DO UPDATE SET updated_at=canvases.updated_at RETURNING *`,
      [id, input.companyId, input.title.trim().slice(0, 200) || 'Agent workspace', input.conversationId,
        input.triggerClientMsgNo, input.goal.trim(), input.initiatorAgentId],
    )
    const canvas = rows[0]
    const { rows: existing } = await client.query<AssignmentRow>(`SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at`, [id])
    if (existing.length === 0) await insertMembers(client, { canvas, members: input.members, existing })
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); throw error
  } finally { client.release() }
  const snapshot = await getCanvasSnapshot(input.companyId, input.initiatorAgentId, id)
  await publishCanvas(input.companyId, {
    kind: 'workspace.started', canvasId: id, conversationId: input.conversationId,
    workspace: { id, title: snapshot.title, goal: snapshot.goal, status: snapshot.status,
      assignmentCount: snapshot.assignments.length, frameCount: snapshot.frames.length },
  })
  return snapshot
}

export async function addCanvasWorkspaceAgents(input: {
  companyId: string; canvasId: string; actorId: string; members: CanvasMemberInput[]
}): Promise<CanvasSnapshot> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: canvases } = await client.query<CanvasRow>(`SELECT * FROM canvases WHERE id=$1 AND company_id=$2 FOR UPDATE`, [input.canvasId, input.companyId])
    const canvas = canvases[0]
    if (!canvas || canvas.status !== 'active') throw new Error('only an active canvas can recruit agents')
    const { rows: actor } = await client.query(`SELECT 1 FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2`, [canvas.id, input.actorId])
    if (!actor[0] && canvas.initiator_agent_id !== input.actorId) throw new Error('only a canvas participant may recruit agents')
    const { rows: existing } = await client.query<AssignmentRow>(`SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at`, [canvas.id])
    await insertMembers(client, { canvas, members: input.members, existing })
    await client.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [canvas.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); throw error
  } finally { client.release() }
  const snapshot = await getCanvasSnapshot(input.companyId, input.actorId, input.canvasId)
  await publishCanvas(input.companyId, { kind: 'workspace.updated', canvasId: input.canvasId, conversationId: snapshot.conversationId ?? undefined, workspace: snapshot })
  return snapshot
}

async function publishAssignments(companyId: string, canvasId: string): Promise<void> {
  const { rows } = await pool.query<AssignmentRow>(`SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1`, [canvasId])
  const { rows: dependencies } = await pool.query<{ agent_id: string; depends_on_agent_id: string }>(
    `SELECT child.agent_id,parent.agent_id AS depends_on_agent_id FROM canvas_assignment_dependencies d
      JOIN canvas_agent_assignments child ON child.id=d.assignment_id JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
      WHERE child.canvas_id=$1`, [canvasId],
  )
  await Promise.all(rows.map((row) => publishCanvas(companyId, { kind: 'assignment.updated', canvasId,
    assignment: toAssignment(row, dependencies.filter((item) => item.agent_id === row.agent_id).map((item) => item.depends_on_agent_id)) })))
}

export async function completeCanvasWork(input: {
  workId: string; companyId: string; status: 'completed' | 'failed' | 'cancelled'; resultText?: string; error?: string
}): Promise<void> {
  const client = await pool.connect(); let canvasId: string | null = null
  try {
    await client.query('BEGIN')
    const { rows: works } = await client.query<{ canvas_id: string | null; canvas_assignment_id: string | null; reason: string; agent_id: string }>(
      `SELECT canvas_id,canvas_assignment_id,reason,agent_id FROM agent_work_items WHERE id=$1 FOR UPDATE`, [input.workId],
    )
    const work = works[0]; canvasId = work?.canvas_id ?? null
    if (!work?.canvas_id) { await client.query('COMMIT'); return }
    if (work.reason === 'canvas_summary') {
      const { rows: updated } = await client.query<{ status: CanvasWorkspaceStatus; conversation_id: string | null; title: string; goal: string }>(
        `UPDATE canvases SET status=$2,summary=$3,completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='summarizing'
         RETURNING status,conversation_id,title,goal`,
        [work.canvas_id, input.status === 'completed' ? 'completed' : 'failed', input.resultText ?? input.error ?? null],
      )
      await client.query('COMMIT')
      const workspace = updated[0]
      if (workspace) await publishCanvas(input.companyId, { kind: 'workspace.updated', canvasId: work.canvas_id,
        conversationId: workspace.conversation_id ?? undefined, workspace: { id: work.canvas_id, status: workspace.status, title: workspace.title, goal: workspace.goal } })
      return
    }
    if (!work.canvas_assignment_id) { await client.query('COMMIT'); return }
    const assignmentStatus: CanvasAssignmentStatus = input.status === 'completed' ? 'completed' : input.status === 'failed' ? 'failed' : 'cancelled'
    await client.query(
      `UPDATE canvas_agent_assignments SET status=$2,result=$3,error=$4,completed_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND status NOT IN ('completed','failed','cancelled')`,
      [work.canvas_assignment_id, assignmentStatus, input.resultText ?? null, input.error ?? null],
    )
    await client.query(
      `WITH RECURSIVE blocked_descendants(id) AS (
         SELECT d.assignment_id FROM canvas_assignment_dependencies d
          JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
          WHERE parent.canvas_id=$1 AND parent.status IN ('failed','cancelled')
         UNION
         SELECT d.assignment_id FROM canvas_assignment_dependencies d JOIN blocked_descendants b ON b.id=d.depends_on_assignment_id
       ) UPDATE canvas_agent_assignments child SET status='blocked',error='Blocked by a failed or stopped dependency',completed_at=NOW(),updated_at=NOW()
          WHERE child.id IN (SELECT id FROM blocked_descendants) AND child.status='blocked' AND child.error IS NULL`, [work.canvas_id],
    )
    await client.query(
      `UPDATE agent_work_items work
          SET status='cancelled',cancel_requested_at=COALESCE(cancel_requested_at,NOW()),updated_at=NOW()
         FROM canvas_agent_assignments assignment
        WHERE work.canvas_assignment_id=assignment.id
          AND assignment.canvas_id=$1
          AND assignment.status='blocked'
          AND assignment.error IS NOT NULL
          AND work.status='blocked'`,
      [work.canvas_id],
    )
    await client.query(
      `WITH ready AS (
         SELECT child.id,child.work_id FROM canvas_agent_assignments child
          WHERE child.canvas_id=$1 AND child.status='blocked' AND child.error IS NULL
            AND NOT EXISTS (SELECT 1 FROM canvas_assignment_dependencies d JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
                             WHERE d.assignment_id=child.id AND parent.status <> 'completed')
       ) UPDATE canvas_agent_assignments a SET status='queued',updated_at=NOW() FROM ready WHERE a.id=ready.id`, [work.canvas_id],
    )
    await client.query(
      `UPDATE agent_work_items w SET status='queued',available_at=NOW(),updated_at=NOW()
        FROM canvas_agent_assignments a WHERE w.canvas_assignment_id=a.id AND a.canvas_id=$1 AND a.status='queued' AND w.status='blocked'`,
      [work.canvas_id],
    )
    const { rows: unfinished } = await client.query(
      `SELECT 1 FROM canvas_agent_assignments WHERE canvas_id=$1 AND
        (status IN ('queued','working','waiting') OR (status='blocked' AND error IS NULL)) LIMIT 1`, [work.canvas_id],
    )
    if (!unfinished[0]) {
      const { rows: canvases } = await client.query<CanvasRow>(
        `UPDATE canvases SET status='summarizing',updated_at=NOW() WHERE id=$1 AND status='active' RETURNING *`, [work.canvas_id],
      )
      const canvas = canvases[0]
      if (canvas?.initiator_agent_id && canvas.conversation_id) {
        const summaryWorkId = `canvas-summary-${createHash('sha256').update(canvas.id).digest('hex').slice(0, 24)}`
        await client.query(
          `INSERT INTO agent_work_items
             (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,canvas_id)
           VALUES ($1,$2,$3,$4,$5,$6,'canvas_summary','queued',200,$7) ON CONFLICT (id) DO NOTHING`,
          [summaryWorkId, canvas.company_id, canvas.initiator_agent_id, canvas.conversation_id,
            canvas.trigger_client_msg_no, `canvas-summary:${canvas.id}`, canvas.id],
        )
      }
    }
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error }
  finally { client.release() }
  if (canvasId) {
    await publishAssignments(input.companyId, canvasId)
    const { rows } = await pool.query<CanvasRow>(`SELECT * FROM canvases WHERE id=$1`, [canvasId])
    if (rows[0]) await publishCanvas(input.companyId, { kind: 'workspace.updated', canvasId,
      conversationId: rows[0].conversation_id ?? undefined, workspace: { id: canvasId, status: rows[0].status, title: rows[0].title, goal: rows[0].goal } })
  }
}

export async function steerCanvasAssignment(input: { companyId: string; canvasId: string; agentId: string; text: string }): Promise<void> {
  const text = input.text.trim().slice(0, 4000); if (!text) throw new Error('steer text is required')
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE agent_work_items w SET steer_inputs=w.steer_inputs || jsonb_build_array(jsonb_build_object(
       'id',$4,'text',$5,'createdAt',NOW())),updated_at=NOW()
      FROM canvas_agent_assignments a,canvases c WHERE a.canvas_id=$2 AND a.agent_id=$3 AND a.canvas_id=c.id
       AND c.company_id=$1 AND w.canvas_assignment_id=a.id AND w.status IN ('queued','blocked','leased') RETURNING w.id`,
    [input.companyId, input.canvasId, input.agentId, randomUUID(), text],
  )
  if (!rows[0]) throw new Error('active canvas assignment not found')
}

export async function stopCanvasAssignment(input: { companyId: string; canvasId: string; agentId: string }): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE agent_work_items w SET cancel_requested_at=NOW(),status=CASE WHEN w.status IN ('queued','blocked') THEN 'cancelled' ELSE w.status END,updated_at=NOW()
      FROM canvas_agent_assignments a,canvases c WHERE a.canvas_id=$2 AND a.agent_id=$3 AND a.canvas_id=c.id AND c.company_id=$1
       AND w.canvas_assignment_id=a.id AND w.status IN ('queued','blocked','leased') RETURNING w.id`, [input.companyId, input.canvasId, input.agentId],
  )
  if (!rows[0]) throw new Error('active canvas assignment not found')
  await pool.query(`UPDATE canvas_agent_assignments SET status='cancelled',error='Stopped by learner',completed_at=NOW(),updated_at=NOW() WHERE canvas_id=$1 AND agent_id=$2`, [input.canvasId, input.agentId])
  await completeCanvasWork({ workId: rows[0].id, companyId: input.companyId, status: 'cancelled', error: 'Stopped by learner' })
}

export async function stopCanvasWorkspace(input: { companyId: string; canvasId: string }): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE canvases SET status='stopped',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND company_id=$2 AND status IN ('active','summarizing') RETURNING id`,
    [input.canvasId, input.companyId],
  )
  if (!rows[0]) throw new Error('active canvas not found')
  await pool.query(`UPDATE agent_work_items SET cancel_requested_at=NOW(),status=CASE WHEN status IN ('queued','blocked') THEN 'cancelled' ELSE status END,updated_at=NOW() WHERE canvas_id=$1 AND status IN ('queued','blocked','leased')`, [input.canvasId])
  await pool.query(`UPDATE canvas_agent_assignments SET status='cancelled',error='Workspace stopped by learner',completed_at=NOW(),updated_at=NOW() WHERE canvas_id=$1 AND status NOT IN ('completed','failed','cancelled')`, [input.canvasId])
  await publishCanvas(input.companyId, { kind: 'workspace.updated', canvasId: input.canvasId, workspace: { id: input.canvasId, status: 'stopped' } })
}
