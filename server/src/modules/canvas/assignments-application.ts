import { createHash, randomUUID } from 'node:crypto'
import { publishCanvasProgress } from './progress.js'
import { persistNativeEvents } from '../../agents/native-events.js'
import { createNativeMessage } from '../../im/message-types.js'
import type { CanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import { parseCanvasActivityKind } from '../../../../src/lib/canvasEventKinds.js'
import { canvasAgentColor, canvasWorkArea } from '../../canvas/orchestration.js'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasEvent } from '../../redis.js'
import type { CanvasExecution } from './execution.js'
import type {
  CanvasActivity,
  CanvasActorKind,
  CanvasAgentAssignment,
  CanvasMemberInput,
  CanvasSnapshot,
} from './contracts.js'
import {
  availableCanvasMemberIds,
  canvasAssignmentPublicationRows,
  canvasById,
  insertAssignment,
  listAssignments,
  lockAssignment,
  lockCanvas,
  setAssignmentVerifier,
  stopCanvasAssignmentState,
  touchCanvas,
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
    progressFingerprint: null,
    noProgressCount: 0,
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
  if (input.members.length + input.existing.length > 32) throw new Error('Canvas supports at most 32 assignments')
  await assertMembersAvailable(db, input.canvas.company_id, input.members)
  const existingIds = new Set(input.existing.map((row) => row.agent_id))
  if (input.members.some((member) => existingIds.has(member.agentId))) {
    throw new Error('agent is already assigned to this canvas')
  }
  const used = new Set(input.existing.map((row) => row.color))
  const created: AssignmentRow[] = []
  for (const [offset, member] of input.members.entries()) {
    const index = input.existing.length + offset
    const id = `assignment-${createHash('sha256').update(`${input.canvas.id}:${member.agentId}`).digest('hex').slice(0, 28)}`
    const color = canvasAgentColor(member.agentId, used)
    used.add(color)
    const area = canvasWorkArea(index)
    created.push(await insertAssignment(db, {
      id,
      canvasId: input.canvas.id,
      agentId: member.agentId,
      assignment: member.assignment.trim(),
      color,
      status: 'waiting',
      x: area.x,
      y: area.y,
      workId: null,
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
  return created
}

export interface CanvasAssignmentsApplicationContext {
  db: Queryable
  execution: CanvasExecution
  transaction: Transaction
  withCanvasFence<T>(canvasId: string, work: (db: Queryable) => Promise<T>): Promise<T>
  getCanvasSnapshot(companyId: string, actorId: string, canvasId: string): Promise<CanvasSnapshot>
  publishCanvas: PublishCanvas
  logActivity: LogActivity
}

export function createCanvasAssignmentsApplication(context: CanvasAssignmentsApplicationContext) {
  const { db, transaction, execution, withCanvasFence, getCanvasSnapshot, publishCanvas, logActivity } = context

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
      if (input.actorKind !== 'user') throw new Error('Agent assignments must be ordinary group mentions')
      if (!canvas.conversation_id) throw new Error('Canvas assignment requires a conversation')
      if (!existing) {
        const all = await listAssignments(transactionDb, canvas.id)
        await insertCanvasMembers(transactionDb, { canvas, members: [{ agentId: input.agentId, assignment }], existing: all })
      } else {
        await execution.cancel(transactionDb, canvas, existing.work_id)
        action = 'assignment_updated'
        await transactionDb.query("UPDATE canvas_agent_assignments SET assignment=$2,status='waiting',work_id=NULL,result=NULL,error=NULL,completed_at=NULL,updated_at=NOW() WHERE id=$1", [existing.id, assignment])
      }
      const id = 'canvas-assignment-' + randomUUID()
      const { rows: authorizations } = await transactionDb.query<{ authorization: string }>(`SELECT COALESCE(access_revoked_at::text,'') AS authorization
        FROM users WHERE id=$1 AND departed_at IS NULL AND suspended_at IS NULL AND deleted_at IS NULL FOR SHARE`, [input.actorId])
      if (!authorizations[0]) throw new Error('Canvas assignment author is no longer active')
      const { rows: requests } = await transactionDb.query<{ id: string }>(`UPDATE canvas_agent_assignments SET request_client_msg_no=$3
        WHERE canvas_id=$1 AND agent_id=$2 RETURNING id`, [canvas.id, input.agentId, id])
      await persistNativeEvents(transactionDb, { key: id, companyId: input.companyId, workId: id }, [{ type: 'im.user',
        companyId: input.companyId, userId: input.actorId, channelId: canvas.conversation_id, clientNonce: id,
        canvasId: canvas.id, assignmentId: requests[0].id, authorization: authorizations[0].authorization,
        payload: createNativeMessage({ id, role: 'user', content: [{ type: 'text', text: '@' + input.agentId + ' 请在画布「' + canvas.title + '」中完成：' + assignment }],
          custom: { mentionedIds: [input.agentId] } }) }])
      await touchCanvas(transactionDb, canvas.id)
      await publishCanvasProgress(transactionDb,input.companyId,canvas.id)
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

  async function stopCanvasAssignment(input: {
    companyId: string
    canvasId: string
    agentId: string
  }): Promise<void> {
    const activity = toActivity(await withCanvasFence(
      input.canvasId,
      async transactionDb => {
        const canvas = await lockCanvas(transactionDb, input.companyId, input.canvasId)
        const assignment = await lockAssignment(transactionDb, input.canvasId, input.agentId)
        if (!canvas || !assignment) throw new Error('active canvas assignment not found')
        await execution.cancel(transactionDb, canvas, assignment.work_id)
        const activity = await stopCanvasAssignmentState(transactionDb, input)
        await publishCanvasProgress(transactionDb,input.companyId,input.canvasId)
        return activity
      },
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
    assignCanvasWorkspaceWork,
    publishAssignments,
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
