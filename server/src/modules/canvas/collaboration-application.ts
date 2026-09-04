import { randomUUID } from 'node:crypto'
import type { CanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'
import type {
  CanvasActivity,
  CanvasActorKind,
  CanvasAssignmentStatus,
  CanvasComment,
  CanvasFrame,
  CanvasPresence,
} from './contracts.js'
import type { CanvasRow } from './repository.js'
import {
  availableAgents,
  currentPresence,
  deletePresence,
  insertComment,
  updateAssignmentPresence,
  upsertPresence,
} from './repository.js'

type PublishCanvas = (
  companyId: string,
  event: Omit<CanvasEvent, 'type' | 'companyId' | 'timestamp'>,
) => Promise<void>
type LogActivity = (input: {
  companyId: string; canvasId: string; actorId: string; actorKind: CanvasActorKind
  action: CanvasActivityKind; frameId?: string | null; detail?: Record<string, unknown>; idempotencyKey?: string
}) => Promise<CanvasActivity>

export interface CanvasCollaborationApplicationContext {
  db: Queryable
  resolveCanvas(companyId: string, actorId: string, canvasId?: string, projectId?: string): Promise<CanvasRow>
  requireFrame(companyId: string, frameId: string): Promise<CanvasFrame>
  publishCanvas: PublishCanvas
  publishAssignments(companyId: string, canvasId: string): Promise<void>
  logActivity: LogActivity
}

export function createCanvasCollaborationApplication(context: CanvasCollaborationApplicationContext) {
  const { db, resolveCanvas, requireFrame, publishCanvas, publishAssignments, logActivity } = context

async function setCanvasStatus(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; status: string; canvasId?: string
  projectId?: string; frameId?: string | null; cursorX?: number | null; cursorY?: number | null
}): Promise<CanvasPresence | null> {
  const canvas = await resolveCanvas(input.companyId, input.actorId, input.canvasId, input.projectId)
  const status = input.status.trim().slice(0, 120)
  const previous = input.actorKind === 'agent'
    ? await currentPresence(db, canvas.id, input.actorId)
    : undefined
  if (!status || status === 'offline') {
    await deletePresence(db, canvas.id, input.actorId)
    await publishCanvas(input.companyId, {
      kind: 'presence.removed', canvasId: canvas.id, participantId: input.actorId,
    })
    return null
  }
  if (input.frameId) await requireFrame(input.companyId, input.frameId)
  const row = await upsertPresence(db, {
    canvasId: canvas.id,
    participantId: input.actorId,
    participantKind: input.actorKind,
    status,
    frameId: input.frameId ?? null,
    cursorX: input.cursorX ?? null,
    cursorY: input.cursorY ?? null,
  })
  const presence: CanvasPresence = {
    participantId: row.participant_id, participantKind: row.participant_kind,
    status: row.status, frameId: row.frame_id, color: row.color,
    cursorX: row.cursor_x === null ? null : Number(row.cursor_x), cursorY: row.cursor_y === null ? null : Number(row.cursor_y),
    lastSeenAt: row.last_seen_at,
  }
  if (input.actorKind === 'agent') {
    const assignmentStatus = (['queued','blocked','working','waiting','completed','failed','cancelled'] as string[]).includes(status)
      ? status as CanvasAssignmentStatus
      : 'working'
    await updateAssignmentPresence(db, {
      canvasId: canvas.id,
      agentId: input.actorId,
      status: assignmentStatus,
      frameId: input.frameId ?? null,
      cursorX: input.cursorX ?? null,
      cursorY: input.cursorY ?? null,
    })
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

async function addCanvasComment(input: {
  companyId: string; actorId: string; actorKind: CanvasActorKind; canvasId?: string; projectId?: string; frameId?: string | null; body: string
}): Promise<CanvasComment> {
  const canvas = await resolveCanvas(input.companyId, input.actorId, input.canvasId, input.projectId)
  if (input.frameId) await requireFrame(input.companyId, input.frameId)
  const body = input.body.trim().slice(0, 8_000)
  if (!body) throw new Error('body is required')
  const id = `comment-${randomUUID()}`
  const row = await insertComment(db, {
    id,
    canvasId: canvas.id,
    frameId: input.frameId ?? null,
    authorId: input.actorId,
    authorKind: input.actorKind,
    body,
  })
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

async function listCanvasAvailableAgents(companyId: string): Promise<Array<{ id: string; name: string; role: string; status: string }>> {
  const rows = await availableAgents(db, companyId)
  return rows.map((row) => ({ id: row.id, name: row.name, role: row.role ?? 'Learning Agent', status: row.status ?? 'available' }))
}
  return { addCanvasComment, listCanvasAvailableAgents, setCanvasStatus }
}

