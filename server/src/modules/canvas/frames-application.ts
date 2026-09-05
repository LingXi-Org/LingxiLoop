import { createHash, randomUUID } from 'node:crypto'
import type { CanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import { findCanvasPlacement } from '../../../../src/lib/canvasLayout.js'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'
import {
  CANVAS_FRAME_TYPES,
  type CanvasActivity,
  type CanvasActorKind,
  type CanvasFrame,
  type CanvasFrameType,
} from './contracts.js'
import type { CanvasRow, FrameRow, FrameUpdateField } from './repository.js'
import {
  appendFrame,
  assignmentOrigin,
  deleteFrame,
  findFrame,
  insertFrame,
  lockCanvasLayout,
  markAssignmentFrame,
  occupiedFrames,
  touchCanvas,
  updateFrame,
} from './repository.js'

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type PublishCanvas = (
  companyId: string,
  event: Omit<CanvasEvent, 'type' | 'companyId' | 'timestamp'>,
) => Promise<void>
type LogActivity = (input: {
  companyId: string; canvasId: string; actorId: string; actorKind: CanvasActorKind
  action: CanvasActivityKind; frameId?: string | null; detail?: Record<string, unknown>; idempotencyKey?: string
}) => Promise<CanvasActivity>

export interface CanvasFrameApplicationContext {
  db: Queryable
  transaction: Transaction
  resolveCanvas(companyId: string, actorId: string, canvasId?: string, projectId?: string): Promise<CanvasRow>
  publishCanvas: PublishCanvas
  logActivity: LogActivity
}

const MAX_FRAME_CONTENT = 1024 * 1024
const MAX_FRAME_TITLE = 200
const MIN_FRAME_SIZE = 120
const MAX_FRAME_SIZE = 8_000

function finiteNumber(value: unknown, name: string): number {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new Error(`${name} must be a finite number`)
  return number
}

function frameSize(value: unknown, name: string, defaultValue: number): number {
  if (value === undefined) return defaultValue
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

export function toFrame(row: FrameRow): CanvasFrame {
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

export function createCanvasFrameApplication(context: CanvasFrameApplicationContext) {
  const { db, transaction, resolveCanvas, publishCanvas, logActivity } = context

  async function requireFrame(companyId: string, frameId: string): Promise<CanvasFrame> {
    const row = await findFrame(db, companyId, frameId)
    if (!row) throw new Error('frame not found')
    return toFrame(row)
  }

async function createCanvasFrame(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; idempotencyKey?: string
  canvasId?: string; projectId?: string
  frame: Record<string, unknown>
}): Promise<CanvasFrame> {
  const canvas = await resolveCanvas(input.companyId, input.actorId, input.canvasId, input.projectId)
  const type = frameType(input.frame.type)
  const title = String(input.frame.title ?? `${type[0].toUpperCase()}${type.slice(1)} frame`).trim().slice(0, MAX_FRAME_TITLE) || 'Untitled frame'
  const content = contentValue(input.frame.content)
  const data = objectValue(input.frame.data)
  const id = input.idempotencyKey
    ? `frame-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 24)}`
    : `frame-${randomUUID()}`
  const width = frameSize(input.frame.width, 'width', 420)
  const height = frameSize(input.frame.height, 'height', 300)
  const frame = await transaction(async (client) => {
    // Serialise automatic placement per workspace. Locking the canvas id,
    // rather than existing frame rows, also covers an initially empty board.
    await lockCanvasLayout(client, canvas.id)
    let defaultX = 80; let defaultY = 80
    if (input.actorKind === 'agent') {
      const area = await assignmentOrigin(client, canvas.id, input.actorId)
      if (area) { defaultX = Number(area.work_x) + 40; defaultY = Number(area.work_y) + 100 }
    }
    let x = finiteNumber(input.frame.x ?? defaultX, 'x')
    let y = finiteNumber(input.frame.y ?? defaultY, 'y')
    const occupied = await occupiedFrames(client, canvas.id)
    const placement = findCanvasPlacement(
      occupied.map((item) => ({ x: Number(item.x), y: Number(item.y), width: Number(item.width), height: Number(item.height) })),
      { width, height },
      { x, y },
    )
    x = placement.x; y = placement.y
    const created = toFrame(await insertFrame(client, {
      id, canvasId: canvas.id, type, title, x, y, width, height, content, data, actorId: input.actorId,
    }))
    if (input.actorKind === 'agent') {
      await markAssignmentFrame(client, canvas.id, input.actorId, created, true)
    }
    await touchCanvas(client, canvas.id)
    return created
  })
  await publishCanvas(input.companyId, { kind: 'frame.created', canvasId: canvas.id, revision: frame.revision, frame })
  await logActivity({
    companyId: input.companyId, canvasId: canvas.id, actorId: input.actorId,
    actorKind: input.actorKind, frameId: frame.id, action: 'frame_created',
    detail: { title: frame.title, type: frame.type },
  })
  return frame
}

async function updateCanvasFrame(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; frameId: string
  patch: Record<string, unknown>
}): Promise<CanvasFrame> {
  const current = await requireFrame(input.companyId, input.frameId)
  const changes: Array<{ field: FrameUpdateField; value: unknown; json?: boolean }> = []
  const add = (field: FrameUpdateField, value: unknown, json = false) => {
    changes.push({ field, value, json })
  }
  if (input.patch.type !== undefined) add('type', frameType(input.patch.type))
  if (input.patch.title !== undefined) add('title', String(input.patch.title).trim().slice(0, MAX_FRAME_TITLE) || 'Untitled frame')
  if (input.patch.x !== undefined) add('x', finiteNumber(input.patch.x, 'x'))
  if (input.patch.y !== undefined) add('y', finiteNumber(input.patch.y, 'y'))
  if (input.patch.width !== undefined) add('width', frameSize(input.patch.width, 'width', current.width))
  if (input.patch.height !== undefined) add('height', frameSize(input.patch.height, 'height', current.height))
  if (input.patch.content !== undefined) add('content', contentValue(input.patch.content))
  if (input.patch.data !== undefined) add('data', JSON.stringify(objectValue(input.patch.data)), true)
  if (changes.length === 0) return current
  add('updated_by', input.actorId)
  const contentMutation = ['type', 'title', 'content', 'data'].some((key) => input.patch[key] !== undefined)
  const baseRevision = input.patch.baseRevision === undefined ? null : Number(input.patch.baseRevision)
  if (contentMutation && !Number.isInteger(baseRevision)) throw new Error('baseRevision is required for content updates')
  const updated = await updateFrame(db, {
    companyId: input.companyId, frameId: input.frameId, baseRevision, changes,
  })
  if (!updated) {
    const latest = await requireFrame(input.companyId, input.frameId)
    throw Object.assign(new Error(`frame revision conflict; latest revision is ${latest.revision}`), { status: 409, latestFrame: latest })
  }
  const frame = toFrame(updated)
  if (input.actorKind === 'agent') {
    await markAssignmentFrame(db, frame.canvasId, input.actorId, frame, false)
  }
  await touchCanvas(db, frame.canvasId)
  await publishCanvas(input.companyId, { kind: 'frame.updated', canvasId: frame.canvasId, revision: frame.revision, frame })
  await logActivity({
    companyId: input.companyId, canvasId: frame.canvasId, actorId: input.actorId,
    actorKind: input.actorKind, frameId: frame.id, action: 'frame_updated',
    detail: { fields: Object.keys(input.patch) },
  })
  return frame
}

async function appendCanvasFrameContent(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; frameId: string; content: string
}): Promise<CanvasFrame> {
  if (!input.content) return requireFrame(input.companyId, input.frameId)
  if (Buffer.byteLength(input.content, 'utf8') > 64 * 1024) throw new Error('append content exceeds 64 KiB')
  const updated = await appendFrame(db, {
    companyId: input.companyId, frameId: input.frameId, actorId: input.actorId,
    content: input.content, maxBytes: MAX_FRAME_CONTENT,
  })
  if (!updated) {
    await requireFrame(input.companyId, input.frameId)
    throw new Error('frame content exceeds 1 MiB')
  }
  const frame = toFrame(updated)
  await touchCanvas(db, frame.canvasId)
  await publishCanvas(input.companyId, { kind: 'frame.updated', canvasId: frame.canvasId, revision: frame.revision, frame })
  await logActivity({
    companyId: input.companyId, canvasId: frame.canvasId, actorId: input.actorId,
    actorKind: input.actorKind, frameId: frame.id, action: 'frame_updated',
    detail: { operation: 'append', characters: input.content.length, title: frame.title },
  })
  return frame
}

async function deleteCanvasFrame(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; frameId: string
}): Promise<{ id: string; canvasId: string }> {
  const frame = await requireFrame(input.companyId, input.frameId)
  await deleteFrame(db, frame.id)
  await touchCanvas(db, frame.canvasId)
  await publishCanvas(input.companyId, { kind: 'frame.deleted', canvasId: frame.canvasId, frameId: frame.id })
  await logActivity({
    companyId: input.companyId, canvasId: frame.canvasId, actorId: input.actorId,
    actorKind: input.actorKind, action: 'frame_deleted', detail: { title: frame.title, type: frame.type },
  })
  return { id: frame.id, canvasId: frame.canvasId }
}

  return {
    appendCanvasFrameContent,
    createCanvasFrame,
    deleteCanvasFrame,
    requireFrame,
    updateCanvasFrame,
  }
}
