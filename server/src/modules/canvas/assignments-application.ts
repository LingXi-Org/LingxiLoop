import { createHash, randomUUID } from 'node:crypto'
import type { CanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import { parseCanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import { assertCanvasDependencyDAG, canvasAgentColor, canvasWorkArea } from '../../canvas/orchestration.js'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'
import type {
  CanvasActivity,
  CanvasActorKind,
  CanvasAgentAssignment,
  CanvasMemberInput,
  CanvasSnapshot,
} from './contracts.js'
import {
  appendAssignmentSteer,
  appendIdempotentAssignmentSteer,
  assignmentExists,
  availableCanvasMemberIds,
  canvasAssignmentPublicationRows,
  canvasById,
  canvasFrameIds,
  deleteAssignmentDependencies,
  detachAssignmentWork,
  findActivity,
  insertActivity,
  insertAssignment,
  insertAssignmentDependency,
  insertCanvasWork,
  listAssignments,
  lockAssignment,
  lockCanvas,
  participantNames,
  resetAssignment,
  setAssignmentVerifier,
  steerCanvasWork,
  stopCanvasAssignmentState,
  touchCanvas,
  updateAssignmentText,
  updateAssignmentTextReturning,
  type AssignmentRow,
  type CanvasRow,
} from './repository.js'

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type PublishCanvas = (
  companyId: string,
  event: Omit<CanvasEvent, 'type' | 'companyId' | 'timestamp'>,
) => Promise<void>
type LogActivity = (input: {
  companyId: string
  canvasId: string
  actorId: string
  actorKind: CanvasActorKind
  action: CanvasActivityKind
  frameId?: string | null
  detail?: Record<string, unknown>
  idempotencyKey?: string
}) => Promise<CanvasActivity>

export interface CanvasHandoffResult {
  snapshot: CanvasSnapshot
  activity: CanvasActivity
}

function canvasAuthorizationUserId(canvas: CanvasRow): string {
  if (!canvas.authorization_user_id) throw new Error('Canvas has no persisted human authorization principal')
  return canvas.authorization_user_id
}

export function toAssignment(row: AssignmentRow, dependencies: string[] = []): CanvasAgentAssignment {
  return {
    id: row.id,
    canvasId: row.canvas_id,
    agentId: row.agent_id,
    assignment: row.assignment,
    color: row.color,
    status: row.status,
    workArea: {
      x: Number(row.work_x),
      y: Number(row.work_y),
      width: Number(row.work_width),
      height: Number(row.work_height),
    },
    activeFrameId: row.active_frame_id,
    cursor: row.cursor_x === null || row.cursor_y === null
      ? null
      : { x: Number(row.cursor_x), y: Number(row.cursor_y) },
    workId: row.work_id,
    dependsOnAgentIds: dependencies,
    executionRole: row.execution_role,
    verifiesAssignmentId: row.verifies_assignment_id,
    progressFingerprint: row.progress_fingerprint,
    noProgressCount: Number(row.no_progress_count ?? 0),
    result: row.result,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  }
}

async function assertMembersAvailable(
  db: Queryable,
  companyId: string,
  members: CanvasMemberInput[],
): Promise<void> {
  if (members.length === 0) throw new Error('at least one canvas member is required')
  const ids = members.map((member) => member.agentId)
  if (new Set(ids).size !== ids.length) throw new Error('canvas members must be unique')
  const availableIds = await availableCanvasMemberIds(db, companyId, ids)
  if (availableIds.length !== ids.length) {
    throw new Error('every selected agent must be active and have the canvas capability')
  }
  for (const member of members) {
    const role = member.executionRole ?? 'specialist'
    if (role === 'verifier') {
      if (!member.verifiesAgentId) throw new Error('verifier assignments require verifiesAgentId')
      if (member.verifiesAgentId === member.agentId) {
        throw new Error('builder and verifier must be different agents')
      }
      if (!ids.includes(member.verifiesAgentId)) {
        throw new Error('verifier target must be assigned to the same canvas')
      }
    } else if (member.verifiesAgentId) {
      throw new Error('only verifier assignments may set verifiesAgentId')
    }
  }
}

export async function insertCanvasMembers(
  db: Queryable,
  input: { canvas: CanvasRow; members: CanvasMemberInput[]; existing: AssignmentRow[] },
): Promise<AssignmentRow[]> {
  await assertMembersAvailable(db, input.canvas.company_id, input.members)
  const existingIds = new Set(input.existing.map((row) => row.agent_id))
  if (input.members.some((member) => existingIds.has(member.agentId))) {
    throw new Error('agent is already assigned to this canvas')
  }
  assertCanvasDependencyDAG(input.members, existingIds)
  const used = new Set(input.existing.map((row) => row.color))
  const created: AssignmentRow[] = []
  for (const [offset, member] of input.members.entries()) {
    const index = input.existing.length + offset
    const id = `assignment-${createHash('sha256').update(`${input.canvas.id}:${member.agentId}`).digest('hex').slice(0, 28)}`
    const workId = `canvas-work-${createHash('sha256').update(id).digest('hex').slice(0, 28)}`
    const color = canvasAgentColor(member.agentId, used)
    used.add(color)
    const area = canvasWorkArea(index)
    const blocked = (member.dependsOnAgentIds?.length ?? 0) > 0
    created.push(await insertAssignment(db, {
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
    await setAssignmentVerifier(db, child.id, target.id)
    child.verifies_assignment_id = target.id
  }
  for (const member of input.members) {
    const child = all.find((row) => row.agent_id === member.agentId)!
    for (const dependencyAgentId of member.dependsOnAgentIds ?? []) {
      const parent = all.find((row) => row.agent_id === dependencyAgentId)
      if (!parent) throw new Error(`unknown dependency agent: ${dependencyAgentId}`)
      await insertAssignmentDependency(db, child.id, parent.id)
    }
  }
  for (const row of created) {
    await insertCanvasWork(db, {
      id: row.work_id!,
      companyId: input.canvas.company_id,
      authorizationUserId: canvasAuthorizationUserId(input.canvas),
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

export interface CanvasAssignmentsApplicationContext {
  db: Queryable
  transaction: Transaction
  withCanvasFence<T>(canvasId: string, work: (db: Queryable) => Promise<T>): Promise<T>
  getCanvasSnapshot(companyId: string, actorId: string, canvasId: string): Promise<CanvasSnapshot>
  publishCanvas: PublishCanvas
  logActivity: LogActivity
}

export function createCanvasAssignmentsApplication(context: CanvasAssignmentsApplicationContext) {
  const { db, transaction, withCanvasFence, getCanvasSnapshot, publishCanvas, logActivity } = context

  async function publishAssignments(companyId: string, canvasId: string): Promise<void> {
    const rows = await canvasAssignmentPublicationRows(db, companyId, canvasId)
    await Promise.all(rows.assignments.map((row) => publishCanvas(companyId, {
      kind: 'assignment.updated',
      canvasId,
      assignment: toAssignment(
        row,
        rows.dependencies
          .filter((item) => item.agent_id === row.agent_id)
          .map((item) => item.depends_on_agent_id),
      ),
    })))
  }

  async function addCanvasWorkspaceAgents(input: {
    companyId: string
    canvasId: string
    actorId: string
    members: CanvasMemberInput[]
  }): Promise<CanvasSnapshot> {
    await transaction(async (transactionDb) => {
      const canvas = await lockCanvas(transactionDb, input.companyId, input.canvasId)
      if (!canvas || canvas.status !== 'active') throw new Error('only an active canvas can recruit agents')
      const actorAssigned = await assignmentExists(transactionDb, canvas.id, input.actorId)
      if (!actorAssigned && canvas.initiator_agent_id !== input.actorId) {
        throw new Error('only a canvas participant may recruit agents')
      }
      const existing = await listAssignments(transactionDb, canvas.id)
      await insertCanvasMembers(transactionDb, { canvas, members: input.members, existing })
      await touchCanvas(transactionDb, canvas.id)
    })
    const snapshot = await getCanvasSnapshot(input.companyId, input.actorId, input.canvasId)
    await publishCanvas(input.companyId, {
      kind: 'workspace.updated',
      canvasId: input.canvasId,
      conversationId: snapshot.conversationId ?? undefined,
      workspace: snapshot,
    })
    return snapshot
  }

  async function assignCanvasWorkspaceWork(input: {
    companyId: string
    canvasId: string
    actorId: string
    agentId: string
    assignment: string
    actorKind?: CanvasActorKind
  }): Promise<CanvasSnapshot> {
    const assignment = input.assignment.trim().slice(0, 4_000)
    if (!assignment) throw new Error('assignment is required')
    let action: CanvasActivityKind = 'assignment_created'
    await transaction(async (transactionDb) => {
      const canvas = await lockCanvas(transactionDb, input.companyId, input.canvasId)
      if (!canvas || canvas.status !== 'active') throw new Error('only an active canvas accepts new work')
      await assertMembersAvailable(transactionDb, input.companyId, [{ agentId: input.agentId, assignment }])
      const existing = await lockAssignment(transactionDb, canvas.id, input.agentId)
      if (!existing) {
        const all = await listAssignments(transactionDb, canvas.id)
        await insertCanvasMembers(transactionDb, {
          canvas,
          members: [{ agentId: input.agentId, assignment }],
          existing: all,
        })
      } else {
        const terminal = ['completed', 'failed', 'cancelled'].includes(existing.status)
        const steerId = randomUUID()
        const steered = terminal ? null : await appendAssignmentSteer(transactionDb, {
          companyId: input.companyId,
          assignmentId: existing.id,
          actorId: steerId,
          text: assignment,
        })
        action = 'assignment_updated'
        if (steered) {
          await updateAssignmentText(transactionDb, existing.id, assignment)
        } else {
          const workId = `canvas-work-${randomUUID()}`
          await detachAssignmentWork(transactionDb, existing.id)
          await deleteAssignmentDependencies(transactionDb, existing.id)
          await resetAssignment(transactionDb, { assignmentId: existing.id, assignment, workId })
          await insertCanvasWork(transactionDb, {
            id: workId,
            companyId: canvas.company_id,
            authorizationUserId: canvasAuthorizationUserId(canvas),
            agentId: input.agentId,
            channelId: canvas.conversation_id,
            triggerClientMsgNo: canvas.trigger_client_msg_no,
            status: 'queued',
            canvasId: canvas.id,
            assignmentId: existing.id,
            executionRole: existing.execution_role,
            workTriggerClientMsgNo: `canvas-dialog:${canvas.id}:${steerId}`,
          })
        }
      }
      await touchCanvas(transactionDb, canvas.id)
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
    const handoffContext = input.context?.trim().slice(0, 8_000) ?? ''
    const activityId = `activity-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)}`
    const activity = await transaction(async (transactionDb) => {
      const canvas = await lockCanvas(transactionDb, input.companyId, input.canvasId)
      if (!canvas) throw Object.assign(new Error('canvas not found'), { status: 404 })
      const existingActivity = await findActivity(transactionDb, canvas.id, activityId)
      if (existingActivity) return toActivity(existingActivity)
      if (canvas.status !== 'active') throw new Error('only an active canvas accepts handoffs')

      const source = await lockAssignment(transactionDb, canvas.id, input.fromAgentId)
      if (!source) throw new Error('only a current Canvas worker can hand off work')
      const requestedFrameIds = [...new Set((input.frameIds ?? []).map(String).filter(Boolean))]
      if (requestedFrameIds.length > 0) {
        const matchingIds = await canvasFrameIds(transactionDb, canvas.id, requestedFrameIds)
        if (matchingIds.length !== requestedFrameIds.length) {
          throw new Error('handoff frameIds must belong to this Canvas')
        }
      }
      const frameIds = [...new Set(
        [source.active_frame_id, ...requestedFrameIds].filter((id): id is string => Boolean(id)),
      )]
      const handoffSteerText = [
        '[Canvas handoff]',
        `Task: ${task}`,
        ...(handoffContext ? [`Context: ${handoffContext}`] : []),
        ...(frameIds.length > 0 ? [`Canvas frame IDs: ${frameIds.join(', ')}`] : []),
      ].join('\n')
      await assertMembersAvailable(transactionDb, input.companyId, [{ agentId: input.toAgentId, assignment: task }])
      let target = await lockAssignment(transactionDb, canvas.id, input.toAgentId)
      if (!target) {
        const all = await listAssignments(transactionDb, canvas.id)
        target = (await insertCanvasMembers(transactionDb, {
          canvas,
          members: [{ agentId: input.toAgentId, assignment: task }],
          existing: all,
        }))[0]
      } else {
        const terminal = ['completed', 'failed', 'cancelled'].includes(target.status)
        const steerId = `handoff-steer-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
        const steered = terminal ? null : await appendIdempotentAssignmentSteer(transactionDb, {
          assignmentId: target.id,
          canvasId: canvas.id,
          agentId: input.toAgentId,
          steerId,
          text: handoffSteerText,
        })
        if (!steered) {
          const workId = `canvas-handoff-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 28)}`
          await detachAssignmentWork(transactionDb, target.id)
          await deleteAssignmentDependencies(transactionDb, target.id)
          target = await resetAssignment(transactionDb, { assignmentId: target.id, assignment: task, workId })
          await insertCanvasWork(transactionDb, {
            id: workId,
            companyId: canvas.company_id,
            authorizationUserId: canvasAuthorizationUserId(canvas),
            agentId: input.toAgentId,
            channelId: canvas.conversation_id,
            triggerClientMsgNo: canvas.trigger_client_msg_no,
            status: 'queued',
            canvasId: canvas.id,
            assignmentId: target.id,
            executionRole: target.execution_role,
            workTriggerClientMsgNo: `canvas-handoff:${canvas.id}:${activityId}`,
          })
        } else {
          target = await updateAssignmentTextReturning(transactionDb, target.id, task)
        }
      }
      const names = await participantNames(transactionDb, input.companyId, [input.fromAgentId, input.toAgentId])
      const nameById = new Map(names.map((row) => [row.id, row.name]))
      const detail = {
        fromAgentId: input.fromAgentId,
        fromAgentName: nameById.get(input.fromAgentId) ?? input.fromAgentId,
        toAgentId: input.toAgentId,
        toAgentName: nameById.get(input.toAgentId) ?? input.toAgentId,
        sourceAssignmentId: source.id,
        targetAssignmentId: target?.id ?? null,
        task,
        context: handoffContext,
        frameIds,
      }
      const activityRow = await insertActivity(transactionDb, {
        id: activityId,
        canvasId: canvas.id,
        frameId: source.active_frame_id,
        actorId: input.fromAgentId,
        actorKind: 'agent',
        action: 'handoff',
        detail,
      })
      await touchCanvas(transactionDb, canvas.id)
      return toActivity(activityRow)
    })
    const snapshot = await getCanvasSnapshot(input.companyId, input.fromAgentId, input.canvasId)
    await publishAssignments(input.companyId, input.canvasId)
    await publishCanvas(input.companyId, { kind: 'activity.created', canvasId: input.canvasId, activity })
    return {
      snapshot: {
        ...snapshot,
        activity: [activity, ...snapshot.activity.filter((item) => item.id !== activity.id)],
      },
      activity,
    }
  }

  async function steerCanvasAssignment(input: {
    companyId: string
    canvasId: string
    agentId: string
    text: string
  }): Promise<void> {
    const text = input.text.trim().slice(0, 4_000)
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

  async function stopCanvasAssignment(input: {
    companyId: string
    canvasId: string
    agentId: string
  }): Promise<void> {
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
        workspace: {
          id: input.canvasId,
          status: canvas.status,
          title: canvas.title,
          goal: canvas.goal,
        },
      })
    }
  }

  return {
    addCanvasWorkspaceAgents,
    assignCanvasWorkspaceWork,
    handoffCanvasWork,
    publishAssignments,
    steerCanvasAssignment,
    stopCanvasAssignment,
  }
}

function toActivity(row: {
  id: string
  canvas_id: string
  frame_id: string | null
  actor_id: string
  actor_kind: CanvasActorKind
  action: string
  detail: Record<string, unknown>
  created_at: string
}): CanvasActivity {
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
