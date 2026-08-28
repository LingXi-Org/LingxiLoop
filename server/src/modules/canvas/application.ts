import { createHash, randomUUID } from 'node:crypto'
import { type CanvasActivityKind, parseCanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import { assertCanvasDependencyDAG, canvasAgentColor, canvasWorkArea } from '../../canvas/orchestration.js'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'
import type {
  CanvasActivity,
  CanvasActorKind,
  CanvasAgentAssignment,
  CanvasAssignmentReport,
  CanvasMemberInput,
  CanvasSnapshot,
  CanvasWorkspaceSummary,
} from './contracts.js'
import {
  type ActivityRow,
  appendIdempotentAssignmentSteer,
  appendAssignmentSteer,
  assignmentExists,
  availableCanvasMemberIds,
  canvasAssignmentPublicationRows,
  canvasById,
  canvasEventScope,
  canvasFrameIds,
  conversationCanvasId,
  deleteAssignmentDependencies,
  detachAssignmentWork,
  ensureConversationCanvasId,
  findCanvas,
  findActivity,
  type AssignmentRow,
  type CanvasRow,
  insertActivity,
  insertAgentWorkspace,
  insertAssignment,
  insertAssignmentDependency,
  insertCanvasWork,
  listWorkspaceRows,
  listAssignments,
  lockAssignment,
  lockCanvas,
  participantNames,
  type ReportRow,
  resetAssignment,
  snapshotRows,
  steerCanvasWork,
  stopCanvasAssignmentState,
  stopCanvasWorkspaceState,
  setAssignmentVerifier,
  touchCanvas,
  updateAssignmentText,
  updateAssignmentTextReturning,
} from './repository.js'
import type { CanvasInfrastructure } from './infrastructure.js'
import { createCanvasFrameApplication, toFrame } from './frames-application.js'
import { createCanvasCollaborationApplication } from './collaboration-application.js'
import { createCanvasReportApplication } from './reports-application.js'


function stableCanvasId(companyId: string): string {
  return `canvas-${createHash('sha256').update(companyId).digest('hex').slice(0, 20)}`
}


export interface CanvasHandoffResult {
  snapshot: CanvasSnapshot
  activity: CanvasActivity
}

export function createCanvasApplication(infrastructure: CanvasInfrastructure) {
const { db, transaction, withCanvasFence, publishEvent } = infrastructure

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

const {
  appendCanvasFrameContent,
  createCanvasFrame,
  deleteCanvasFrame,
  requireFrame,
  updateCanvasFrame,
} = createCanvasFrameApplication({ db, transaction, resolveCanvas, publishCanvas, logActivity })

const {
  addCanvasComment,
  listCanvasAvailableAgents,
  setCanvasStatus,
} = createCanvasCollaborationApplication({
  db, resolveCanvas, requireFrame, publishCanvas, publishAssignments, logActivity,
})

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

const {
  assertCanvasWorkReportReady,
  completeCanvasWork,
  submitCanvasReport,
} = createCanvasReportApplication({
  db,
  transaction,
  toReport,
  publishCanvas,
  publishAssignments,
  logActivity,
})


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
  const activity = toActivity(await withCanvasFence(
    input.canvasId,
    (transactionDb) => stopCanvasAssignmentState(transactionDb, input),
  ))
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
