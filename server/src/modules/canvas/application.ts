import { createHash, randomUUID } from 'node:crypto'
import { type CanvasActivityKind, parseCanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import { findCanvasPlacement } from '../../../../src/lib/canvasLayout.js'
import type { AgentExecutionRole } from '../../agent-os/types.js'
import { assertCanvasDependencyDAG, canvasAgentColor, canvasWorkArea } from '../../canvas/orchestration.js'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'
import {
  CANVAS_FRAME_TYPES,
  type CanvasActivity,
  type CanvasActorKind,
  type CanvasAgentAssignment,
  type CanvasAssignmentReport,
  type CanvasAssignmentStatus,
  type CanvasComment,
  type CanvasEvidenceRef,
  type CanvasFrame,
  type CanvasFrameType,
  type CanvasMemberInput,
  type CanvasPresence,
  type CanvasReportVerdict,
  type CanvasSnapshot,
  type CanvasWorkspaceSummary,
} from './contracts.js'
import {
  type ActivityRow,
  acquireCanvasSharedFence,
  appendIdempotentAssignmentSteer,
  appendFrame,
  appendAssignmentSteer,
  assignmentVerifierId,
  assignmentOrigin,
  assignmentExists,
  availableAgents,
  availableCanvasMemberIds,
  canvasAssignmentPublicationRows,
  canvasById,
  canvasEventScope,
  canvasFrameIds,
  conversationCanvasId,
  completeCanvasWorkState,
  currentPresence,
  deleteFrame,
  deleteAssignmentDependencies,
  deletePresence,
  detachAssignmentWork,
  ensureConversationCanvasId,
  missingEvidenceRefs,
  existingReportIds,
  findCanvas,
  findActivity,
  findFrame,
  type AssignmentRow,
  type CanvasRow,
  type FrameRow,
  type FrameUpdateField,
  insertActivity,
  insertAgentWorkspace,
  insertAssignment,
  insertAssignmentDependency,
  insertCanvasWork,
  insertComment,
  insertFrame,
  insertReport,
  listWorkspaceRows,
  listAssignments,
  lockAssignment,
  lockCanvas,
  lockCanvasLayout,
  lockReportWork,
  markAssignmentFrame,
  occupiedFrames,
  participantNames,
  type ReportRow,
  resetAssignment,
  reportExists,
  reportIdentity,
  releaseCanvasSharedFence,
  snapshotRows,
  steerCanvasWork,
  stopCanvasAssignmentState,
  stopCanvasWorkspaceState,
  setAssignmentVerifier,
  touchCanvas,
  updateAssignmentText,
  updateAssignmentTextReturning,
  updateAssignmentPresence,
  updateFrame,
  upsertPresence,
  workReportContext,
} from './repository.js'
import type { CanvasInfrastructure } from './infrastructure.js'

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

export interface CanvasHandoffResult {
  snapshot: CanvasSnapshot
  activity: CanvasActivity
}

export function createCanvasApplication(infrastructure: CanvasInfrastructure) {
const { db, transaction, connectionTransaction, acquireConnection, publishEvent } = infrastructure

async function publishCanvas(companyId: string, event: Omit<CanvasEvent, 'type' | 'companyId' | 'timestamp'>): Promise<void> {
  const scope = await canvasEventScope(db, companyId, event.canvasId)
  await publishEvent({
    type: 'canvas.changed', companyId,
    ...(scope?.conversation_id ? { conversationId: scope.conversation_id } : {}),
    ...(scope?.project_id ? { workspaceId: scope.project_id } : {}),
    timestamp: new Date().toISOString(), ...event,
  })
}

function toAssignment(row: AssignmentRow, dependencies: string[] = []): CanvasAgentAssignment {
  return {
    id: row.id, canvasId: row.canvas_id, agentId: row.agent_id, assignment: row.assignment,
    color: row.color, status: row.status,
    workArea: { x: Number(row.work_x), y: Number(row.work_y), width: Number(row.work_width), height: Number(row.work_height) },
    activeFrameId: row.active_frame_id,
    cursor: row.cursor_x === null || row.cursor_y === null ? null : { x: Number(row.cursor_x), y: Number(row.cursor_y) },
    workId: row.work_id, dependsOnAgentIds: dependencies, executionRole: row.execution_role,
    verifiesAssignmentId: row.verifies_assignment_id, progressFingerprint: row.progress_fingerprint,
    noProgressCount: Number(row.no_progress_count ?? 0), result: row.result, error: row.error,
    startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at,
  }
}

function toReport(row: ReportRow): CanvasAssignmentReport {
  return { id:row.id,canvasId:row.canvas_id,assignmentId:row.assignment_id,authorAgentId:row.author_agent_id,
    executionRole:row.execution_role,schemaVersion:row.schema_version,finding:row.finding,evidenceRefs:row.evidence_refs ?? [],
    confidence:Number(row.confidence),unresolved:row.unresolved ?? [],nextStep:row.next_step,verifiesReportId:row.verifies_report_id,
    disconfirmingChecks:row.disconfirming_checks ?? [],verdict:row.verdict,consumedReportIds:row.consumed_report_ids ?? [],
    conflictResolution:row.conflict_resolution ?? [],createdAt:row.created_at }
}

async function requireCanvas(companyId: string, canvasId: string, projectId?: string): Promise<CanvasRow> {
  const row = await findCanvas(db, companyId, canvasId, projectId)
  if (!row) throw new Error('canvas not found')
  return row
}

async function resolveCanvas(companyId: string, _actorId: string, canvasId?: string, projectId?: string): Promise<CanvasRow> {
  if (!canvasId) throw new Error('canvasId is required')
  return requireCanvas(companyId, canvasId, projectId)
}

function toActivity(row: ActivityRow): CanvasActivity {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    frameId: row.frame_id,
    actorId: row.actor_id,
    actorKind: row.actor_kind,
    action: parseCanvasActivityKind(row.action),
    detail: row.detail ?? {},
    createdAt: row.created_at,
  }
}

async function resolveCanvasRead(companyId: string, canvasId?: string, projectId?: string): Promise<CanvasRow> {
  if (!canvasId) throw new Error('canvasId is required')
  return requireCanvas(companyId, canvasId, projectId)
}


async function requireFrame(companyId: string, frameId: string): Promise<CanvasFrame> {
  const row = await findFrame(db, companyId, frameId)
  if (!row) throw new Error('frame not found')
  return toFrame(row)
}

async function logActivity(input: {
  companyId: string; canvasId: string; actorId: string; actorKind: CanvasActorKind
  action: CanvasActivityKind; frameId?: string | null; detail?: Record<string, unknown>; idempotencyKey?: string
}): Promise<CanvasActivity> {
  const id = input.idempotencyKey
    ? `activity-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)}`
    : `activity-${randomUUID()}`
  const row = await insertActivity(db, {
    id,
    canvasId: input.canvasId,
    frameId: input.frameId ?? null,
    actorId: input.actorId,
    actorKind: input.actorKind,
    action: input.action,
    detail: input.detail ?? {},
  })
  const activity: CanvasActivity = {
    id: row.id, canvasId: row.canvas_id, frameId: row.frame_id,
    actorId: row.actor_id, actorKind: row.actor_kind, action: parseCanvasActivityKind(row.action),
    detail: row.detail ?? {}, createdAt: row.created_at,
  }
  await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: input.canvasId, activity })
  return activity
}

async function listCanvasWorkspaces(companyId: string, conversationId?: string, projectId?: string): Promise<CanvasWorkspaceSummary[]> {
  const rows = await listWorkspaceRows(db, companyId, conversationId, projectId)
  return rows.map((row) => ({
    id: row.id, title: row.title, goal: row.goal, conversationId: row.conversation_id,
    initiatorAgentId: row.initiator_agent_id, status: row.status, origin: row.origin,
    frameCount: Number(row.frame_count), assignmentCount: Number(row.assignment_count),
    updatedAt: row.updated_at, createdAt: row.created_at,
  }))
}

/** Group-scoped Canvas is created lazily and is unique per conversation. */
async function ensureConversationCanvas(companyId: string, conversationId: string, actorId: string): Promise<CanvasSnapshot> {
  const id = stableCanvasId(`${companyId}:${conversationId}`)
  const canvasId = await ensureConversationCanvasId(db, { id, companyId, conversationId, actorId })
  if (!canvasId) throw Object.assign(new Error('group conversation not found'), { status: 404 })
  return getCanvasSnapshot(companyId, actorId, canvasId)
}

async function getConversationCanvas(companyId: string, conversationId: string, actorId: string): Promise<CanvasSnapshot | null> {
  const canvasId = await conversationCanvasId(db, companyId, conversationId)
  return canvasId ? getCanvasSnapshot(companyId, actorId, canvasId) : null
}

async function getCanvasSnapshot(companyId: string, actorId: string, canvasId?: string, projectId?: string): Promise<CanvasSnapshot> {
  void actorId
  const canvas = await resolveCanvasRead(companyId, canvasId, projectId)
  const snapshot = await snapshotRows(db, canvas.id)
  return {
    id: canvas.id,
    title: canvas.title,
    companyId,
    projectId: canvas.project_id,
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
    frames: snapshot.frames.map(toFrame),
    assignments: snapshot.assignments.map((row) => toAssignment(row, snapshot.dependencies.filter((item) => item.agent_id === row.agent_id).map((item) => item.depends_on_agent_id))),
    presence: snapshot.presence.map((row) => ({
      participantId: row.participant_id, participantKind: row.participant_kind,
      status: row.status, frameId: row.frame_id, color: row.color,
      cursorX: row.cursor_x === null ? null : Number(row.cursor_x), cursorY: row.cursor_y === null ? null : Number(row.cursor_y),
      lastSeenAt: row.last_seen_at,
    })),
    comments: snapshot.comments.map((row) => ({
      id: row.id, canvasId: row.canvas_id, frameId: row.frame_id,
      authorId: row.author_id, authorKind: row.author_kind, body: row.body, createdAt: row.created_at,
    })),
    activity: snapshot.activity.map((row) => ({
      id: row.id, canvasId: row.canvas_id, frameId: row.frame_id,
      actorId: row.actor_id, actorKind: row.actor_kind, action: parseCanvasActivityKind(row.action),
      detail: row.detail ?? {}, createdAt: row.created_at,
    })),
    reports: snapshot.reports.map(toReport),
  }
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

async function assertMembersAvailable(client: Queryable, companyId: string, members: CanvasMemberInput[]): Promise<void> {
  if (members.length === 0) throw new Error('at least one canvas member is required')
  const ids = members.map((member) => member.agentId)
  if (new Set(ids).size !== ids.length) throw new Error('canvas members must be unique')
  const availableIds = await availableCanvasMemberIds(client, companyId, ids)
  if (availableIds.length !== ids.length) throw new Error('every selected agent must be active and have the canvas capability')
  for (const member of members) {
    const role = member.executionRole ?? 'specialist'
    if (role === 'verifier') {
      if (!member.verifiesAgentId) throw new Error('verifier assignments require verifiesAgentId')
      if (member.verifiesAgentId === member.agentId) throw new Error('builder and verifier must be different agents')
      if (!ids.includes(member.verifiesAgentId) && !members.some((item) => item.agentId === member.verifiesAgentId)) {
        throw new Error('verifier target must be assigned to the same canvas')
      }
    } else if (member.verifiesAgentId) throw new Error('only verifier assignments may set verifiesAgentId')
  }
}

async function insertMembers(client: Queryable, input: {
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
    created.push(await insertAssignment(client, {
      id,
      canvasId: input.canvas.id,
      agentId: member.agentId,
      assignment: member.assignment.trim(),
      color,
      status: blocked ? 'blocked' : 'queued',
      x: area.x,
      y: area.y,
      workId,
      executionRole: member.executionRole ?? 'specialist',
    }))
  }
  const all = [...input.existing, ...created]
  for (const member of input.members) {
    if (!member.verifiesAgentId) continue
    const child = all.find((row) => row.agent_id === member.agentId)!
    const target = all.find((row) => row.agent_id === member.verifiesAgentId)
    if (!target || target.agent_id === child.agent_id) throw new Error('invalid verifier assignment target')
    await setAssignmentVerifier(client, child.id, target.id)
    child.verifies_assignment_id = target.id
  }
  for (const member of input.members) {
    const child = all.find((row) => row.agent_id === member.agentId)!
    for (const dependencyAgentId of member.dependsOnAgentIds ?? []) {
      const parent = all.find((row) => row.agent_id === dependencyAgentId)
      if (!parent) throw new Error(`unknown dependency agent: ${dependencyAgentId}`)
      await insertAssignmentDependency(client, child.id, parent.id)
    }
  }
  for (const row of created) {
    await insertCanvasWork(client, {
      id: row.work_id!,
      companyId: input.canvas.company_id,
      agentId: row.agent_id,
      channelId: input.canvas.conversation_id,
      triggerClientMsgNo: input.canvas.trigger_client_msg_no,
      status: row.status === 'queued' ? 'queued' : 'blocked',
      canvasId: input.canvas.id,
      assignmentId: row.id,
      executionRole: row.execution_role,
    })
  }
  return created
}

async function startCanvasWorkspace(input: {
  companyId: string; initiatorAgentId: string; conversationId: string; triggerClientMsgNo: string
  title: string; goal: string; members: CanvasMemberInput[]; idempotencyKey: string
}): Promise<CanvasSnapshot> {
  const id = `canvas-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
  const created = await transaction(async (client) => {
    const canvas = await insertAgentWorkspace(client, {
      id,
      companyId: input.companyId,
      title: input.title.trim().slice(0, 200) || 'Agent workspace',
      conversationId: input.conversationId,
      triggerClientMsgNo: input.triggerClientMsgNo,
      goal: input.goal.trim(),
      initiatorAgentId: input.initiatorAgentId,
    })
    if (!canvas) throw new Error('canvas requires a group conversation')
    const existing = await listAssignments(client, canvas.id)
    if (existing.length === 0) await insertMembers(client, { canvas, members: input.members, existing })
    const activityId = `activity-${createHash('sha256').update(`${input.idempotencyKey}:workspace_started`).digest('hex').slice(0, 32)}`
    const row = await insertActivity(client, {
      id: activityId, canvasId: canvas.id, frameId: null, actorId: input.initiatorAgentId,
      actorKind: 'agent', action: 'workspace_started', detail: { title: canvas.title, goal: canvas.goal },
    })
    const activity: CanvasActivity = { id: row.id, canvasId: row.canvas_id, frameId: row.frame_id, actorId: row.actor_id,
      actorKind: row.actor_kind, action: parseCanvasActivityKind(row.action), detail: row.detail ?? {}, createdAt: row.created_at }
    return { canvasId: canvas.id, activity }
  })
  const { canvasId, activity } = created
  const snapshot = await getCanvasSnapshot(input.companyId, input.initiatorAgentId, canvasId)
  await Promise.all([
    publishCanvas(input.companyId, {
      kind: 'workspace.started', canvasId, conversationId: input.conversationId,
      workspace: { id: canvasId, title: snapshot.title, goal: snapshot.goal, status: snapshot.status,
        assignmentCount: snapshot.assignments.length, frameCount: snapshot.frames.length },
    }),
    publishCanvas(input.companyId, { kind: 'activity.created', canvasId, activity }),
  ])
  return { ...snapshot, activity: [activity, ...snapshot.activity.filter((item) => item.id !== activity.id)] }
}

async function addCanvasWorkspaceAgents(input: {
  companyId: string; canvasId: string; actorId: string; members: CanvasMemberInput[]
}): Promise<CanvasSnapshot> {
  await transaction(async (client) => {
    const canvas = await lockCanvas(client, input.companyId, input.canvasId)
    if (!canvas || canvas.status !== 'active') throw new Error('only an active canvas can recruit agents')
    const actorAssigned = await assignmentExists(client, canvas.id, input.actorId)
    if (!actorAssigned && canvas.initiator_agent_id !== input.actorId) throw new Error('only a canvas participant may recruit agents')
    const existing = await listAssignments(client, canvas.id)
    await insertMembers(client, { canvas, members: input.members, existing })
    await touchCanvas(client, canvas.id)
  })
  const snapshot = await getCanvasSnapshot(input.companyId, input.actorId, input.canvasId)
  await publishCanvas(input.companyId, { kind: 'workspace.updated', canvasId: input.canvasId, conversationId: snapshot.conversationId ?? undefined, workspace: snapshot })
  return snapshot
}

async function assignCanvasWorkspaceWork(input: {
  companyId: string; canvasId: string; actorId: string; agentId: string; assignment: string
  actorKind?: CanvasActorKind
}): Promise<CanvasSnapshot> {
  const assignment = input.assignment.trim().slice(0, 4_000)
  if (!assignment) throw new Error('assignment is required')
  let action: CanvasActivityKind = 'assignment_created'
  await transaction(async (client) => {
    const canvas = await lockCanvas(client, input.companyId, input.canvasId)
    if (!canvas || canvas.status !== 'active') throw new Error('only an active canvas accepts new work')
    await assertMembersAvailable(client, input.companyId, [{ agentId: input.agentId, assignment }])
    const existing = await lockAssignment(client, canvas.id, input.agentId)
    if (!existing) {
      const all = await listAssignments(client, canvas.id)
      await insertMembers(client, { canvas, members: [{ agentId: input.agentId, assignment }], existing: all })
    } else {
      const terminal = ['completed', 'failed', 'cancelled'].includes(existing.status)
      const steerId = randomUUID()
      const steered = terminal ? null : await appendAssignmentSteer(client, {
        companyId: input.companyId, assignmentId: existing.id, actorId: steerId, text: assignment,
      })
      if (steered) {
        action = 'assignment_updated'
        await updateAssignmentText(client, existing.id, assignment)
      } else {
        action = 'assignment_updated'
        const workId = `canvas-work-${randomUUID()}`
        await detachAssignmentWork(client, existing.id)
        await deleteAssignmentDependencies(client, existing.id)
        await resetAssignment(client, { assignmentId: existing.id, assignment, workId })
        await insertCanvasWork(client, {
          id: workId, companyId: canvas.company_id, agentId: input.agentId, channelId: canvas.conversation_id,
          triggerClientMsgNo: canvas.trigger_client_msg_no, status: 'queued', canvasId: canvas.id,
          assignmentId: existing.id, executionRole: existing.execution_role,
          workTriggerClientMsgNo: `canvas-dialog:${canvas.id}:${steerId}`,
        })
      }
    }
    await touchCanvas(client, canvas.id)
  })
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

/** Transfer owned Canvas work through the existing durable assignment queue.
 * The handoff itself is an immutable Canvas activity carrying only the context
 * needed by the receiving worker; no parallel memory/runtime is introduced. */
async function handoffCanvasWork(input: {
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
  const activity = await transaction(async (client) => {
    // This canvas row lock makes the activity ledger and its assignment/work
    // mutation one atomic, serialised operation. A crash rolls back both; a
    // retry observes the same activity and never creates a second worker or steer.
    const canvas = await lockCanvas(client, input.companyId, input.canvasId)
    if (!canvas) throw Object.assign(new Error('canvas not found'), { status: 404 })
    const existingActivity = await findActivity(client, canvas.id, activityId)
    if (existingActivity) return toActivity(existingActivity)
    if (canvas.status !== 'active') throw new Error('only an active canvas accepts handoffs')

    const source = await lockAssignment(client, canvas.id, input.fromAgentId)
    if (!source) throw new Error('only a current Canvas worker can hand off work')
    const requestedFrameIds = [...new Set((input.frameIds ?? []).map(String).filter(Boolean))]
    if (requestedFrameIds.length > 0) {
      const matchingIds = await canvasFrameIds(client, canvas.id, requestedFrameIds)
      if (matchingIds.length !== requestedFrameIds.length) throw new Error('handoff frameIds must belong to this Canvas')
    }
    const frameIds = [...new Set([source.active_frame_id, ...requestedFrameIds].filter((id): id is string => Boolean(id)))]
    const handoffSteerText = [
      '[Canvas handoff]',
      `Task: ${task}`,
      ...(context ? [`Context: ${context}`] : []),
      ...(frameIds.length > 0 ? [`Canvas frame IDs: ${frameIds.join(', ')}`] : []),
    ].join('\n')
    await assertMembersAvailable(client, input.companyId, [{ agentId: input.toAgentId, assignment: task }])
    let target = await lockAssignment(client, canvas.id, input.toAgentId)
    if (!target) {
      const all = await listAssignments(client, canvas.id)
      target = (await insertMembers(client, { canvas, members: [{ agentId: input.toAgentId, assignment: task }], existing: all }))[0]
    } else {
      const terminal = ['completed', 'failed', 'cancelled'].includes(target.status)
      const steerId = `handoff-steer-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
      const steered = terminal ? null : await appendIdempotentAssignmentSteer(client, {
        assignmentId: target.id, canvasId: canvas.id, agentId: input.toAgentId, steerId, text: handoffSteerText,
      })
      if (!steered) {
        const workId = `canvas-handoff-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
        await detachAssignmentWork(client, target.id)
        await deleteAssignmentDependencies(client, target.id)
        target = await resetAssignment(client, { assignmentId: target.id, assignment: task, workId })
        await insertCanvasWork(client, {
          id: workId, companyId: canvas.company_id, agentId: input.toAgentId, channelId: canvas.conversation_id,
          triggerClientMsgNo: canvas.trigger_client_msg_no, status: 'queued', canvasId: canvas.id,
          assignmentId: target.id, executionRole: target.execution_role,
          workTriggerClientMsgNo: `canvas-handoff:${canvas.id}:${activityId}`,
        })
      } else {
        target = await updateAssignmentTextReturning(client, target.id, task)
      }
    }
    const names = await participantNames(client, input.companyId, [input.fromAgentId, input.toAgentId])
    const nameById = new Map(names.map((row) => [row.id, row.name]))
    const detail = { fromAgentId: input.fromAgentId, fromAgentName: nameById.get(input.fromAgentId) ?? input.fromAgentId,
      toAgentId: input.toAgentId, toAgentName: nameById.get(input.toAgentId) ?? input.toAgentId,
      sourceAssignmentId: source.id, targetAssignmentId: target?.id ?? null, task, context, frameIds }
    const activityRow = await insertActivity(client, {
      id: activityId, canvasId: canvas.id, frameId: source.active_frame_id, actorId: input.fromAgentId,
      actorKind: 'agent', action: 'handoff', detail,
    })
    await touchCanvas(client, canvas.id)
    return toActivity(activityRow)
  })
  const snapshot = await getCanvasSnapshot(input.companyId, input.fromAgentId, input.canvasId)
  await publishAssignments(input.companyId, input.canvasId)
  await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: input.canvasId, activity })
  return { snapshot: { ...snapshot, activity: [activity, ...snapshot.activity.filter((item) => item.id !== activity.id)] }, activity }
}

async function publishAssignments(companyId: string, canvasId: string): Promise<void> {
  const rows = await canvasAssignmentPublicationRows(db, companyId, canvasId)
  await Promise.all(rows.assignments.map((row) => publishCanvas(companyId, { kind: 'assignment.updated', canvasId,
    assignment: toAssignment(row, rows.dependencies.filter((item) => item.agent_id === row.agent_id).map((item) => item.depends_on_agent_id)) })))
}

async function validateEvidenceRefs(client: Queryable, input: { companyId:string;canvasId:string;refs:CanvasEvidenceRef[] }): Promise<void> {
  if (input.refs.length > 64) throw new Error('evidenceRefs may contain at most 64 items')
  for (const ref of input.refs) {
    if (!ref || typeof ref.id !== 'string' || !ref.id.trim()) throw new Error('every evidence reference requires an id')
  }
  const missing = await missingEvidenceRefs(client, input)
  if (missing[0]) throw new Error(`evidence reference is outside the current Canvas scope: ${missing[0].kind}:${missing[0].id}`)
}

async function submitCanvasReport(input: {
  companyId:string;workId:string;agentId:string;canvasId:string;executionRole:AgentExecutionRole
  finding:string;evidenceRefs:CanvasEvidenceRef[];confidence:number;unresolved?:string[];nextStep?:string
  verifiesReportId?:string;disconfirmingChecks?:string[];verdict?:CanvasReportVerdict
  consumedReportIds?:string[];conflictResolution?:unknown[]
}): Promise<CanvasAssignmentReport> {
  if (!['specialist','verifier','reporter'].includes(input.executionRole)) throw new Error('coordinator work cannot submit an assignment report')
  const confidence=Number(input.confidence)
  if (!Number.isFinite(confidence)||confidence<0||confidence>1) throw new Error('confidence must be between 0 and 1')
  const finding=input.finding.trim()
  if (!finding) throw new Error('finding is required')
  return transaction(async (client) => {
    const work = await lockReportWork(client, {
      workId: input.workId, companyId: input.companyId, agentId: input.agentId, canvasId: input.canvasId,
    })
    if (!work||work.execution_role!==input.executionRole) throw new Error('report execution role does not match the current durable work item')
    await validateEvidenceRefs(client,{companyId:input.companyId,canvasId:input.canvasId,refs:input.evidenceRefs})
    let verifiesReportId:string|null=null
    if (input.executionRole==='verifier') {
      if (!input.verifiesReportId||!input.verdict) throw new Error('verifier reports require verifiesReportId and verdict')
      const source = await reportIdentity(client, input.companyId, input.canvasId, input.verifiesReportId)
      if (!source) throw new Error('verified report is outside the current Canvas')
      if (source.author_agent_id===input.agentId) throw new Error('builder and verifier must be different agents')
      const verifiesAssignmentId = work.canvas_assignment_id
        ? await assignmentVerifierId(client,input.canvasId,work.canvas_assignment_id,input.agentId)
        : null
      if (!verifiesAssignmentId||verifiesAssignmentId!==source.assignment_id) throw new Error('verifier report does not match its assigned builder report')
      verifiesReportId=input.verifiesReportId
    } else if (input.verifiesReportId||input.verdict) throw new Error('only verifier reports may set verification fields')
    const consumed=(input.consumedReportIds??[]).map(String)
    if (input.executionRole==='reporter') {
      if (!consumed.length) throw new Error('reporter reports must consume at least one persisted report')
      const persisted = await existingReportIds(client,input.companyId,input.canvasId,consumed)
      if (new Set(persisted).size!==new Set(consumed).size) throw new Error('reporter consumed report is outside the current Canvas')
    } else if (consumed.length) throw new Error('only reporter reports may consume reportIds')
    const id=`report-${createHash('sha256').update(`${input.workId}:learning_report_v1`).digest('hex').slice(0,28)}`
    return toReport(await insertReport(client, {
      id, companyId: input.companyId, canvasId: input.canvasId, assignmentId: work.canvas_assignment_id,
      agentId: input.agentId, executionRole: input.executionRole, finding, evidenceRefs: input.evidenceRefs,
      confidence, unresolved: input.unresolved ?? [], nextStep: input.nextStep?.trim() || null,
      verifiesReportId, disconfirmingChecks: input.disconfirmingChecks ?? [], verdict: input.verdict ?? null,
      consumedReportIds: consumed, conflictResolution: input.conflictResolution ?? [],
    }))
  })
}

async function assertCanvasWorkReportReady(workId:string,companyId:string):Promise<void> {
  const work = await workReportContext(db, workId, companyId)
  if (!work?.canvas_id) return
  const ready = work.reason==='canvas_summary'
    ? await reportExists(db, { canvasId: work.canvas_id, reporter: true })
    : await reportExists(db, { assignmentId: work.canvas_assignment_id ?? undefined })
  if (!ready) throw new Error(work.reason==='canvas_summary'
    ? 'reporter work requires a learning_report_v1 submission before completion'
    : 'canvas worker requires a learning_report_v1 submission before completion')
}

async function completeCanvasWork(input: {
  workId: string; companyId: string; status: 'completed' | 'failed' | 'cancelled'; resultText?: string; error?: string
}): Promise<void> {
  const state = await transaction((client) => completeCanvasWorkState(client, input))
  if (!state.canvasId) return
  if (state.workspace) {
    await publishCanvas(input.companyId, {
      kind: 'workspace.updated',
      canvasId: state.canvasId,
      conversationId: state.workspace.conversation_id ?? undefined,
      workspace: {
        id: state.canvasId,
        status: state.workspace.status,
        title: state.workspace.title,
        goal: state.workspace.goal,
      },
    })
    return
  }
  await publishAssignments(input.companyId, state.canvasId)
  if (state.completion) {
    await logActivity({
      companyId: input.companyId,
      canvasId: state.canvasId,
      actorId: state.completion.agentId,
      actorKind: 'agent',
      frameId: state.completion.frameId,
      action: state.completion.status === 'completed'
        ? 'task_completed'
        : state.completion.status === 'failed' ? 'task_failed' : 'task_cancelled',
      detail: { status: state.completion.status, result: input.resultText, error: input.error },
    })
  }
  const canvas = await canvasById(db, input.companyId, state.canvasId)
  if (canvas) {
    await publishCanvas(input.companyId, {
      kind: 'workspace.updated',
      canvasId: state.canvasId,
      conversationId: canvas.conversation_id ?? undefined,
      workspace: { id: state.canvasId, status: canvas.status, title: canvas.title, goal: canvas.goal },
    })
  }
}

async function steerCanvasAssignment(input: { companyId: string; canvasId: string; agentId: string; text: string }): Promise<void> {
  const text = input.text.trim().slice(0, 4000)
  if (!text) throw new Error('steer text is required')
  const workId = await steerCanvasWork(db, {
    companyId: input.companyId,
    canvasId: input.canvasId,
    agentId: input.agentId,
    steerId: randomUUID(),
    text,
  })
  if (!workId) throw new Error('active canvas assignment not found')
}

async function stopCanvasAssignment(input: { companyId: string; canvasId: string; agentId: string }): Promise<void> {
  const client = await acquireConnection()
  let activity: CanvasActivity
  try {
    await acquireCanvasSharedFence(client, input.canvasId)
    activity = toActivity(await connectionTransaction(client, (transactionDb) => stopCanvasAssignmentState(transactionDb, input)))
  } finally {
    await releaseCanvasSharedFence(client, input.canvasId).catch(() => undefined)
    client.release()
  }
  await publishAssignments(input.companyId, input.canvasId)
  await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: input.canvasId, activity })
  const canvas = await canvasById(db, input.companyId, input.canvasId)
  if (canvas) {
    await publishCanvas(input.companyId, {
      kind: 'workspace.updated',
      canvasId: input.canvasId,
      conversationId: canvas.conversation_id ?? undefined,
      workspace: { id: input.canvasId, status: canvas.status, title: canvas.title, goal: canvas.goal },
    })
  }
}

async function stopCanvasWorkspace(input: { companyId: string; canvasId: string }): Promise<void> {
  await transaction((client) => stopCanvasWorkspaceState(client, input.companyId, input.canvasId))
  await publishCanvas(input.companyId, {
    kind: 'workspace.updated',
    canvasId: input.canvasId,
    workspace: { id: input.canvasId, status: 'stopped' },
  })
}

return {
  addCanvasComment,
  addCanvasWorkspaceAgents,
  appendCanvasFrameContent,
  assertCanvasWorkReportReady,
  assignCanvasWorkspaceWork,
  completeCanvasWork,
  createCanvasFrame,
  deleteCanvasFrame,
  ensureConversationCanvas,
  getCanvasSnapshot,
  getConversationCanvas,
  handoffCanvasWork,
  listCanvasAvailableAgents,
  listCanvasWorkspaces,
  setCanvasStatus,
  startCanvasWorkspace,
  steerCanvasAssignment,
  stopCanvasAssignment,
  stopCanvasWorkspace,
  submitCanvasReport,
  updateCanvasFrame,
}
}
