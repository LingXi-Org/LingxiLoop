import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { type CanvasActivityKind, normalizeCanvasActivityKind } from '../../../src/lib/canvasEventKinds.js'
import { findCanvasPlacement } from '../../../src/lib/canvasLayout.js'
import { pool } from '../db/pool.js'
import { type CanvasEvent, CH_CANVAS, publish } from '../redis.js'
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
  action: CanvasActivityKind
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
  action: CanvasActivityKind; frameId?: string | null; detail?: Record<string, unknown>; idempotencyKey?: string
}): Promise<CanvasActivity> {
  const id = input.idempotencyKey
    ? `activity-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)}`
    : `activity-${randomUUID()}`
  const { rows } = await pool.query<{
    id: string; canvas_id: string; frame_id: string | null; actor_id: string
    actor_kind: CanvasActorKind; action: string; detail: Record<string, unknown>; created_at: string
  }>(
    `INSERT INTO canvas_activity (id, canvas_id, frame_id, actor_id, actor_kind, action, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (id) DO UPDATE SET id=canvas_activity.id
     RETURNING *`,
    [id, input.canvasId, input.frameId ?? null, input.actorId, input.actorKind, input.action, JSON.stringify(input.detail ?? {})],
  )
  const row = rows[0]
  const activity: CanvasActivity = {
    id: row.id, canvasId: row.canvas_id, frameId: row.frame_id,
    actorId: row.actor_id, actorKind: row.actor_kind, action: normalizeCanvasActivityKind(row.action),
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
      actorId: row.actor_id, actorKind: row.actor_kind, action: normalizeCanvasActivityKind(row.action),
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
  const width = frameSize(input.frame.width, 'width', 420)
  const height = frameSize(input.frame.height, 'height', 300)
  const client = await pool.connect()
  let frame: CanvasFrame
  try {
    await client.query('BEGIN')
    // Serialise automatic placement per workspace. Locking the canvas id,
    // rather than existing frame rows, also covers an initially empty board.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`canvas-layout:${canvas.id}`])
    let defaultX = 80; let defaultY = 80
    if (input.actorKind === 'agent') {
      const { rows: areas } = await client.query<{ work_x: number | string; work_y: number | string }>(
        `SELECT work_x,work_y FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2`, [canvas.id, input.actorId],
      )
      if (areas[0]) { defaultX = Number(areas[0].work_x) + 40; defaultY = Number(areas[0].work_y) + 100 }
    }
    let x = finiteNumber(input.frame.x ?? defaultX, 'x')
    let y = finiteNumber(input.frame.y ?? defaultY, 'y')
    const { rows: occupied } = await client.query<Pick<FrameRow, 'x' | 'y' | 'width' | 'height'>>(
      `SELECT x,y,width,height FROM canvas_frames WHERE canvas_id=$1 ORDER BY created_at ASC`, [canvas.id],
    )
    const placement = findCanvasPlacement(
      occupied.map((item) => ({ x: Number(item.x), y: Number(item.y), width: Number(item.width), height: Number(item.height) })),
      { width, height },
      { x, y },
    )
    x = placement.x; y = placement.y
    const { rows } = await client.query<FrameRow>(
      `INSERT INTO canvas_frames
         (id, canvas_id, type, title, x, y, width, height, content, data, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)
       ON CONFLICT (id) DO UPDATE SET id=canvas_frames.id
       RETURNING *`,
      [id, canvas.id, type, title, x, y, width, height, content, JSON.stringify(data), input.actorId],
    )
    frame = toFrame(rows[0])
    if (input.actorKind === 'agent') {
      await client.query(
        `UPDATE canvas_agent_assignments SET active_frame_id=$3,cursor_x=$4,cursor_y=$5,status='working',
           started_at=COALESCE(started_at,NOW()),updated_at=NOW() WHERE canvas_id=$1 AND agent_id=$2`,
        [canvas.id, input.actorId, frame.id, frame.x + frame.width / 2, frame.y + 28],
      )
    }
    await client.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [canvas.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  await publishCanvas(input.companyId, { kind: 'frame.created', canvasId: canvas.id, revision: frame.revision, frame })
  await logActivity({
    companyId: input.companyId, canvasId: canvas.id, actorId: input.actorId,
    actorKind: input.actorKind, frameId: frame.id, action: 'frame_created',
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
    actorKind: input.actorKind, frameId: frame.id, action: 'frame_updated',
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
    actorKind: input.actorKind, frameId: frame.id, action: 'frame_updated',
    detail: { operation: 'append', characters: input.content.length, title: frame.title },
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
    actorKind: input.actorKind, action: 'frame_deleted', detail: { title: frame.title, type: frame.type },
  })
  return { id: frame.id, canvasId: frame.canvasId }
}

export async function setCanvasStatus(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; status: string; canvasId?: string
  frameId?: string | null; cursorX?: number | null; cursorY?: number | null
}): Promise<CanvasPresence | null> {
  const canvas = await resolveCanvas(input.companyId, input.actorId, input.canvasId)
  const status = input.status.trim().slice(0, 120)
  const previous = input.actorKind === 'agent'
    ? (await pool.query<{ status: string; frame_id: string | null }>(
      `SELECT status,frame_id FROM canvas_presence WHERE canvas_id=$1 AND participant_id=$2 LIMIT 1`,
      [canvas.id, input.actorId],
    )).rows[0]
    : undefined
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
  if (input.actorKind === 'agent') {
    await publishAssignments(input.companyId, canvas.id)
    if (previous?.status !== status || previous?.frame_id !== (input.frameId ?? null)) {
      await logActivity({
        companyId: input.companyId,
        canvasId: canvas.id,
        actorId: input.actorId,
        actorKind: input.actorKind,
        frameId: input.frameId,
        action: 'agent_status',
        detail: { status },
      })
    }
  }
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
    actorKind: input.actorKind, frameId: input.frameId, action: 'comment_created',
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
  let activity: CanvasActivity
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
    const activityId = `activity-${createHash('sha256').update(`${input.idempotencyKey}:workspace_started`).digest('hex').slice(0, 32)}`
    const { rows: activities } = await client.query<{
      id: string; canvas_id: string; frame_id: string | null; actor_id: string; actor_kind: CanvasActorKind; action: string; detail: Record<string, unknown>; created_at: string
    }>(
      `INSERT INTO canvas_activity (id,canvas_id,frame_id,actor_id,actor_kind,action,detail)
       VALUES ($1,$2,NULL,$3,'agent','workspace_started',$4::jsonb)
       ON CONFLICT (id) DO UPDATE SET id=canvas_activity.id RETURNING *`,
      [activityId, id, input.initiatorAgentId, JSON.stringify({ title: canvas.title, goal: canvas.goal })],
    )
    const row = activities[0]
    activity = { id: row.id, canvasId: row.canvas_id, frameId: row.frame_id, actorId: row.actor_id,
      actorKind: row.actor_kind, action: normalizeCanvasActivityKind(row.action), detail: row.detail ?? {}, createdAt: row.created_at }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined); throw error
  } finally { client.release() }
  const snapshot = await getCanvasSnapshot(input.companyId, input.initiatorAgentId, id)
  await publishCanvas(input.companyId, {
    kind: 'workspace.started', canvasId: id, conversationId: input.conversationId,
    workspace: { id, title: snapshot.title, goal: snapshot.goal, status: snapshot.status,
      assignmentCount: snapshot.assignments.length, frameCount: snapshot.frames.length },
  }).catch(() => undefined)
  await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: id, activity }).catch(() => undefined)
  return { ...snapshot, activity: [activity, ...snapshot.activity.filter((item) => item.id !== activity.id)] }
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

export async function assignCanvasWorkspaceWork(input: {
  companyId: string; canvasId: string; actorId: string; agentId: string; assignment: string
  actorKind?: CanvasActorKind
}): Promise<CanvasSnapshot> {
  const assignment = input.assignment.trim().slice(0, 4_000)
  if (!assignment) throw new Error('assignment is required')
  const client = await pool.connect()
  let action: CanvasActivityKind = 'assignment_created'
  try {
    await client.query('BEGIN')
    const { rows: canvases } = await client.query<CanvasRow>(
      `SELECT * FROM canvases WHERE id=$1 AND company_id=$2 FOR UPDATE`,
      [input.canvasId, input.companyId],
    )
    const canvas = canvases[0]
    if (!canvas || canvas.status !== 'active') throw new Error('only an active canvas accepts new work')
    await assertMembersAvailable(client, input.companyId, [{ agentId: input.agentId, assignment }])
    const { rows: assignments } = await client.query<AssignmentRow>(
      `SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2 FOR UPDATE`,
      [canvas.id, input.agentId],
    )
    const existing = assignments[0]
    if (!existing) {
      const { rows: all } = await client.query<AssignmentRow>(`SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at`, [canvas.id])
      await insertMembers(client, { canvas, members: [{ agentId: input.agentId, assignment }], existing: all })
    } else {
      const terminal = ['completed', 'failed', 'cancelled'].includes(existing.status)
      const steerId = randomUUID()
      const { rows: steered } = terminal ? { rows: [] } : await client.query<{ id: string }>(
        `UPDATE agent_work_items w SET steer_inputs=w.steer_inputs || jsonb_build_array(jsonb_build_object(
           'id',$4,'text',$5,'createdAt',NOW())),updated_at=NOW()
          FROM canvas_agent_assignments a WHERE a.id=$1 AND w.canvas_assignment_id=a.id
           AND a.canvas_id=$2 AND a.agent_id=$3 AND w.status IN ('queued','blocked','leased') RETURNING w.id`,
        [existing.id, canvas.id, input.agentId, steerId, assignment],
      )
      if (steered[0]) {
        action = 'assignment_updated'
        await client.query(`UPDATE canvas_agent_assignments SET assignment=$2,updated_at=NOW() WHERE id=$1`, [existing.id, assignment])
      } else {
        action = 'assignment_updated'
        const workId = `canvas-work-${randomUUID()}`
        await client.query(`UPDATE agent_work_items SET canvas_assignment_id=NULL,updated_at=NOW() WHERE canvas_assignment_id=$1`, [existing.id])
        await client.query(`DELETE FROM canvas_assignment_dependencies WHERE assignment_id=$1`, [existing.id])
        await client.query(
          `UPDATE canvas_agent_assignments SET assignment=$2,status='queued',active_frame_id=NULL,work_id=$3,
             result=NULL,error=NULL,started_at=NULL,completed_at=NULL,updated_at=NOW() WHERE id=$1`,
          [existing.id, assignment, workId],
        )
        await client.query(
          `INSERT INTO agent_work_items
             (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,canvas_id,canvas_assignment_id)
           VALUES ($1,$2,$3,$4,$5,$6,'canvas_worker','queued',180,$7,$8)`,
          [workId, canvas.company_id, input.agentId, canvas.conversation_id,
            canvas.trigger_client_msg_no, `canvas-dialog:${canvas.id}:${steerId}`, canvas.id, existing.id],
        )
      }
    }
    await client.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [canvas.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  const snapshot = await getCanvasSnapshot(input.companyId, input.actorId, input.canvasId)
  await publishAssignments(input.companyId, input.canvasId)
  await logActivity({
    companyId: input.companyId,
    canvasId: input.canvasId,
    actorId: input.actorId,
    actorKind: input.actorKind ?? 'user',
    action,
    detail: { agentId: input.agentId, assignment },
  })
  return snapshot
}

export interface CanvasHandoffResult {
  snapshot: CanvasSnapshot
  activity: CanvasActivity
}

/** Transfer owned Canvas work through the existing durable assignment queue.
 * The handoff itself is an immutable Canvas activity carrying only the context
 * needed by the receiving worker; no parallel memory/runtime is introduced. */
export async function handoffCanvasWork(input: {
  companyId: string
  canvasId: string
  fromAgentId: string
  toAgentId: string
  task: string
  context?: string
  frameIds?: string[]
  idempotencyKey: string
}): Promise<CanvasHandoffResult> {
  if (input.fromAgentId === input.toAgentId) throw new Error('handoff target must be another agent')
  const task = input.task.trim().slice(0, 4_000)
  if (!task) throw new Error('handoff task is required')
  const context = input.context?.trim().slice(0, 8_000) ?? ''
  const activityId = `activity-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)}`
  type ActivityRow = { id: string; canvas_id: string; frame_id: string | null; actor_id: string; actor_kind: CanvasActorKind; action: string; detail: Record<string, unknown>; created_at: string }
  const toActivity = (row: ActivityRow): CanvasActivity => ({
    id: row.id, canvasId: row.canvas_id, frameId: row.frame_id, actorId: row.actor_id,
    actorKind: row.actor_kind, action: normalizeCanvasActivityKind(row.action), detail: row.detail ?? {}, createdAt: row.created_at,
  })
  const client = await pool.connect()
  let activity: CanvasActivity
  try {
    await client.query('BEGIN')
    // This canvas row lock makes the activity ledger and its assignment/work
    // mutation one atomic, serialised operation. A crash rolls back both; a
    // retry observes the same activity and never creates a second worker or steer.
    const { rows: canvases } = await client.query<CanvasRow>(
      `SELECT * FROM canvases WHERE id=$1 AND company_id=$2 FOR UPDATE`, [input.canvasId, input.companyId],
    )
    const canvas = canvases[0]
    if (!canvas) throw Object.assign(new Error('canvas not found'), { status: 404 })
    const { rows: existingActivities } = await client.query<ActivityRow>(
      `SELECT * FROM canvas_activity WHERE id=$1 AND canvas_id=$2`, [activityId, canvas.id],
    )
    if (existingActivities[0]) {
      activity = toActivity(existingActivities[0])
      await client.query('COMMIT')
      const snapshot = await getCanvasSnapshot(input.companyId, input.fromAgentId, input.canvasId)
      // Publishing is intentionally replay-safe. The durable activity is the
      // source of truth; a lost post-commit Redis delivery is recovered when
      // the caller retries the same idempotency key.
      await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: input.canvasId, activity }).catch(() => undefined)
      return { snapshot: { ...snapshot, activity: [activity, ...snapshot.activity.filter((item) => item.id !== activity.id)] }, activity }
    }
    if (canvas.status !== 'active') throw new Error('only an active canvas accepts handoffs')

    const { rows: sourceRows } = await client.query<AssignmentRow>(
      `SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2 FOR UPDATE`, [canvas.id, input.fromAgentId],
    )
    const source = sourceRows[0]
    if (!source) throw new Error('only a current Canvas worker can hand off work')
    const requestedFrameIds = [...new Set((input.frameIds ?? []).map(String).filter(Boolean))]
    if (requestedFrameIds.length > 0) {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM canvas_frames WHERE canvas_id=$1 AND id=ANY($2::text[])`, [canvas.id, requestedFrameIds],
      )
      if (rows.length !== requestedFrameIds.length) throw new Error('handoff frameIds must belong to this Canvas')
    }
    const frameIds = [...new Set([source.active_frame_id, ...requestedFrameIds].filter((id): id is string => Boolean(id)))]
    const handoffSteerText = [
      '[Canvas handoff]',
      `Task: ${task}`,
      ...(context ? [`Context: ${context}`] : []),
      ...(frameIds.length > 0 ? [`Canvas frame IDs: ${frameIds.join(', ')}`] : []),
    ].join('\n')
    await assertMembersAvailable(client, input.companyId, [{ agentId: input.toAgentId, assignment: task }])
    const { rows: targets } = await client.query<AssignmentRow>(
      `SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2 FOR UPDATE`, [canvas.id, input.toAgentId],
    )
    let target = targets[0]
    if (!target) {
      const { rows: all } = await client.query<AssignmentRow>(`SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at`, [canvas.id])
      target = (await insertMembers(client, { canvas, members: [{ agentId: input.toAgentId, assignment: task }], existing: all }))[0]
    } else {
      const terminal = ['completed', 'failed', 'cancelled'].includes(target.status)
      const steerId = `handoff-steer-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
      const { rows: steered } = terminal ? { rows: [] } : await client.query<{ id: string }>(
        `UPDATE agent_work_items w SET steer_inputs=CASE WHEN EXISTS (
             SELECT 1 FROM jsonb_array_elements(w.steer_inputs) item WHERE item->>'id'=$4
           ) THEN w.steer_inputs ELSE w.steer_inputs || jsonb_build_array(jsonb_build_object('id',$4,'text',$5::text,'createdAt',NOW())) END,
           updated_at=NOW()
           FROM canvas_agent_assignments a WHERE a.id=$1 AND w.canvas_assignment_id=a.id
            AND a.canvas_id=$2 AND a.agent_id=$3 AND w.status IN ('queued','blocked','leased') RETURNING w.id`,
        [target.id, canvas.id, input.toAgentId, steerId, handoffSteerText],
      )
      if (!steered[0]) {
        const workId = `canvas-handoff-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
        await client.query(`UPDATE agent_work_items SET canvas_assignment_id=NULL,updated_at=NOW() WHERE canvas_assignment_id=$1`, [target.id])
        await client.query(`DELETE FROM canvas_assignment_dependencies WHERE assignment_id=$1`, [target.id])
        const { rows: reset } = await client.query<AssignmentRow>(
          `UPDATE canvas_agent_assignments SET assignment=$2,status='queued',active_frame_id=NULL,work_id=$3,
             result=NULL,error=NULL,started_at=NULL,completed_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`, [target.id, task, workId],
        )
        target = reset[0]
        await client.query(
          `INSERT INTO agent_work_items
             (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,canvas_id,canvas_assignment_id)
           VALUES ($1,$2,$3,$4,$5,$6,'canvas_worker','queued',180,$7,$8)
           ON CONFLICT (id) DO NOTHING`,
          [workId, canvas.company_id, input.toAgentId, canvas.conversation_id, canvas.trigger_client_msg_no,
            `canvas-handoff:${canvas.id}:${activityId}`, canvas.id, target.id],
        )
      } else {
        const { rows: updated } = await client.query<AssignmentRow>(
          `UPDATE canvas_agent_assignments SET assignment=$2,updated_at=NOW() WHERE id=$1 RETURNING *`, [target.id, task],
        )
        target = updated[0]
      }
    }
    const { rows: names } = await client.query<{ id: string; name: string }>(
      `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`, [input.companyId, [input.fromAgentId, input.toAgentId]],
    )
    const nameById = new Map(names.map((row) => [row.id, row.name]))
    const detail = { fromAgentId: input.fromAgentId, fromAgentName: nameById.get(input.fromAgentId) ?? input.fromAgentId,
      toAgentId: input.toAgentId, toAgentName: nameById.get(input.toAgentId) ?? input.toAgentId,
      sourceAssignmentId: source.id, targetAssignmentId: target?.id ?? null, task, context, frameIds }
    const { rows: activityRows } = await client.query<ActivityRow>(
      `INSERT INTO canvas_activity (id,canvas_id,frame_id,actor_id,actor_kind,action,detail)
       VALUES ($1,$2,$3,$4,'agent','handoff',$5::jsonb) RETURNING *`,
      [activityId, canvas.id, source.active_frame_id, input.fromAgentId, JSON.stringify(detail)],
    )
    activity = toActivity(activityRows[0])
    await client.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [canvas.id])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  const snapshot = await getCanvasSnapshot(input.companyId, input.fromAgentId, input.canvasId)
  // The database transaction above is the handoff acknowledgement. Realtime
  // delivery is opportunistic and a retry of this key will republish it.
  await publishAssignments(input.companyId, input.canvasId).catch(() => undefined)
  await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: input.canvasId, activity }).catch(() => undefined)
  return { snapshot: { ...snapshot, activity: [activity, ...snapshot.activity.filter((item) => item.id !== activity.id)] }, activity }
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
  let completion: { agentId: string; frameId: string | null; status: CanvasAssignmentStatus } | null = null
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
    const { rows: completedAssignments } = await client.query<{ active_frame_id: string | null }>(
      `UPDATE canvas_agent_assignments SET status=$2,result=$3,error=$4,completed_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND status NOT IN ('completed','failed','cancelled') RETURNING active_frame_id`,
      [work.canvas_assignment_id, assignmentStatus, input.resultText ?? null, input.error ?? null],
    )
    if (completedAssignments[0]) completion = { agentId: work.agent_id, frameId: completedAssignments[0].active_frame_id, status: assignmentStatus }
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
    if (completion) await logActivity({
      companyId: input.companyId,
      canvasId,
      actorId: completion.agentId,
      actorKind: 'agent',
      frameId: completion.frameId,
      action: completion.status === 'completed'
        ? 'task_completed'
        : completion.status === 'failed' ? 'task_failed' : 'task_cancelled',
      detail: { status: completion.status, result: input.resultText, error: input.error },
    })
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
  const client = await pool.connect()
  let activity: CanvasActivity | null = null
  try {
    // Canvas-scoped operations always take the workspace fence before an
    // agent-work fence; this matches Host Actions and workspace Stop.
    await client.query(`SELECT pg_advisory_lock_shared(hashtextextended($1, 0))`, [`canvas-workspace:${input.canvasId}`])
    await client.query('BEGIN')
    const { rows: candidates } = await client.query<{ id: string }>(
      `SELECT w.id FROM agent_work_items w
        JOIN canvas_agent_assignments a ON w.canvas_assignment_id=a.id
        JOIN canvases c ON a.canvas_id=c.id
       WHERE a.canvas_id=$2 AND a.agent_id=$3 AND c.company_id=$1
         AND w.status IN ('queued','blocked','leased')`, [input.companyId, input.canvasId, input.agentId],
    )
    if (!candidates[0]) throw new Error('active canvas assignment not found')
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`agent-work:${candidates[0].id}`])
    const { rows: works } = await client.query<{ id: string; canvas_assignment_id: string }>(
      `UPDATE agent_work_items w SET cancel_requested_at=NOW(),status=CASE WHEN w.status IN ('queued','blocked') THEN 'cancelled' ELSE w.status END,updated_at=NOW()
        FROM canvas_agent_assignments a,canvases c WHERE a.canvas_id=$2 AND a.agent_id=$3 AND a.canvas_id=c.id AND c.company_id=$1
         AND w.canvas_assignment_id=a.id AND w.status IN ('queued','blocked','leased')
        RETURNING w.id,w.canvas_assignment_id`, [input.companyId, input.canvasId, input.agentId],
    )
    const work = works[0]
    if (!work) throw new Error('active canvas assignment not found')
    const { rows: assignments } = await client.query<{ active_frame_id: string | null }>(
      `UPDATE canvas_agent_assignments SET status='cancelled',error='Stopped by learner',completed_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND status NOT IN ('completed','failed','cancelled') RETURNING active_frame_id`, [work.canvas_assignment_id],
    )
    if (!assignments[0]) throw new Error('active canvas assignment not found')
    const activityId = `activity-${createHash('sha256').update(`canvas-stop:${work.id}`).digest('hex').slice(0, 32)}`
    const { rows: activities } = await client.query<{
      id: string; canvas_id: string; frame_id: string | null; actor_id: string; actor_kind: CanvasActorKind; action: string; detail: Record<string, unknown>; created_at: string
    }>(
      `INSERT INTO canvas_activity (id,canvas_id,frame_id,actor_id,actor_kind,action,detail)
       VALUES ($1,$2,$3,$4,'agent','task_cancelled',$5::jsonb)
       ON CONFLICT (id) DO UPDATE SET id=canvas_activity.id RETURNING *`,
      [activityId, input.canvasId, assignments[0].active_frame_id, input.agentId, JSON.stringify({ status: 'cancelled', error: 'Stopped by learner' })],
    )
    const row = activities[0]
    activity = { id: row.id, canvasId: row.canvas_id, frameId: row.frame_id, actorId: row.actor_id,
      actorKind: row.actor_kind, action: normalizeCanvasActivityKind(row.action), detail: row.detail ?? {}, createdAt: row.created_at }
    await client.query(
      `WITH RECURSIVE blocked_descendants(id) AS (
         SELECT d.assignment_id FROM canvas_assignment_dependencies d JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
          WHERE parent.canvas_id=$1 AND parent.status IN ('failed','cancelled')
         UNION SELECT d.assignment_id FROM canvas_assignment_dependencies d JOIN blocked_descendants b ON b.id=d.depends_on_assignment_id
       ) UPDATE canvas_agent_assignments child SET status='blocked',error='Blocked by a failed or stopped dependency',completed_at=NOW(),updated_at=NOW()
          WHERE child.id IN (SELECT id FROM blocked_descendants) AND child.status='blocked' AND child.error IS NULL`, [input.canvasId],
    )
    await client.query(
      `UPDATE agent_work_items work SET status='cancelled',cancel_requested_at=COALESCE(cancel_requested_at,NOW()),updated_at=NOW()
         FROM canvas_agent_assignments assignment WHERE work.canvas_assignment_id=assignment.id AND assignment.canvas_id=$1
          AND assignment.status='blocked' AND assignment.error IS NOT NULL AND work.status='blocked'`, [input.canvasId],
    )
    const { rows: unfinished } = await client.query(
      `SELECT 1 FROM canvas_agent_assignments WHERE canvas_id=$1 AND
        (status IN ('queued','working','waiting') OR (status='blocked' AND error IS NULL)) LIMIT 1`, [input.canvasId],
    )
    if (!unfinished[0]) {
      const { rows: canvases } = await client.query<CanvasRow>(
        `UPDATE canvases SET status='summarizing',updated_at=NOW() WHERE id=$1 AND status='active' RETURNING *`, [input.canvasId],
      )
      const canvas = canvases[0]
      if (canvas?.initiator_agent_id && canvas.conversation_id) {
        const summaryWorkId = `canvas-summary-${createHash('sha256').update(canvas.id).digest('hex').slice(0, 24)}`
        await client.query(
          `INSERT INTO agent_work_items (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,canvas_id)
           VALUES ($1,$2,$3,$4,$5,$6,'canvas_summary','queued',200,$7) ON CONFLICT (id) DO NOTHING`,
          [summaryWorkId, canvas.company_id, canvas.initiator_agent_id, canvas.conversation_id, canvas.trigger_client_msg_no, `canvas-summary:${canvas.id}`, canvas.id],
        )
      }
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.query(`SELECT pg_advisory_unlock_shared(hashtextextended($1, 0))`, [`canvas-workspace:${input.canvasId}`]).catch(() => undefined)
    client.release()
  }
  await publishAssignments(input.companyId, input.canvasId)
  if (activity) await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: input.canvasId, activity })
  const { rows: canvases } = await pool.query<CanvasRow>(`SELECT * FROM canvases WHERE id=$1`, [input.canvasId])
  if (canvases[0]) await publishCanvas(input.companyId, { kind: 'workspace.updated', canvasId: input.canvasId,
    conversationId: canvases[0].conversation_id ?? undefined, workspace: { id: input.canvasId, status: canvases[0].status, title: canvases[0].title, goal: canvases[0].goal } })
}

export async function stopCanvasWorkspace(input: { companyId: string; canvasId: string }): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Linearise the entire workspace without locking individual work rows
    // first. Canvas Host Actions hold the shared form across their side
    // effects, so no new Canvas action can cross this stop boundary.
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`canvas-workspace:${input.canvasId}`])
    const { rows: canvases } = await client.query<CanvasRow>(
      `SELECT * FROM canvases WHERE id=$1 AND company_id=$2 FOR UPDATE`, [input.canvasId, input.companyId],
    )
    const canvas = canvases[0]
    if (!canvas || !['active', 'summarizing', 'stopped'].includes(canvas.status)) throw new Error('active canvas not found')
    await client.query(`UPDATE canvases SET status='stopped',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW() WHERE id=$1`, [input.canvasId])
    await client.query(`UPDATE agent_work_items SET cancel_requested_at=COALESCE(cancel_requested_at,NOW()),status=CASE WHEN status IN ('queued','blocked') THEN 'cancelled' ELSE status END,updated_at=NOW() WHERE canvas_id=$1 AND status IN ('queued','blocked','leased')`, [input.canvasId])
    await client.query(`UPDATE canvas_agent_assignments SET status='cancelled',error='Workspace stopped by learner',completed_at=NOW(),updated_at=NOW() WHERE canvas_id=$1 AND status NOT IN ('completed','failed','cancelled')`, [input.canvasId])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error }
  finally { client.release() }
  await publishCanvas(input.companyId, { kind: 'workspace.updated', canvasId: input.canvasId, workspace: { id: input.canvasId, status: 'stopped' } }).catch(() => undefined)
}
