import { createHash, randomUUID } from 'node:crypto'
import { publishArtifactProgress } from './progress.js'
import { persistNativeEvents } from '../../agents/native-events.js'
import { createNativeMessage } from '../../im/message-types.js'
import { artifactAgentColor } from './orchestration.js'
import type { Queryable } from '../../db/queryable.js'
import type { ArtifactEvent } from '../../redis.js'
import type { ArtifactExecution } from './execution.js'
import { parseArtifactActivityKind, type ArtifactActivityKind } from './contracts.js'
import type {
  ArtifactActivity,
  ArtifactActorKind,
  ArtifactAgentAssignment,
  ArtifactMemberInput,
  ArtifactSnapshot,
} from './contracts.js'
import {
  availableArtifactMemberIds,
  artifactAssignmentPublicationRows,
  artifactById,
  insertAssignment,
  listAssignments,
  lockAssignment,
  lockArtifact,
  setAssignmentVerifier,
  stopArtifactAssignmentState,
  touchArtifact,
  type AssignmentRow,
  type ArtifactRow,
} from './repository.js'

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
type PublishArtifact = (
  companyId: string,
  event: Omit<ArtifactEvent, 'type' | 'companyId' | 'timestamp'>,
) => Promise<void>
type LogActivity = (input: {
  companyId: string
  artifactId: string
  actorId: string
  actorKind: ArtifactActorKind
  action: ArtifactActivityKind
  path?: string | null
  detail?: Record<string, unknown>
  idempotencyKey?: string
}) => Promise<ArtifactActivity>

export function toAssignment(row: AssignmentRow, dependencies: string[] = []): ArtifactAgentAssignment {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    agentId: row.agent_id,
    assignment: row.assignment,
    color: row.color,
    status: row.status,
    activePath: row.active_path,
    workId: row.work_id,
    dependsOnAgentIds: dependencies,
    executionRole: row.execution_role,
    verifiesAssignmentId: row.verifies_assignment_id,
    result: row.result,
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  }
}

async function assertMembersAvailable(
  db: Queryable,
  artifact: Pick<ArtifactRow, 'company_id' | 'kind'>,
  members: ArtifactMemberInput[],
): Promise<void> {
  if (members.length === 0) throw new Error('at least one artifact member is required')
  const ids = members.map((member) => member.agentId)
  if (new Set(ids).size !== ids.length) throw new Error('artifact members must be unique')
  const availableIds = await availableArtifactMemberIds(db, artifact.company_id, ids, artifact.kind)
  if (availableIds.length !== ids.length) {
    throw new Error(`every selected agent must be active and have the ${artifact.kind} capability`)
  }
  for (const member of members) {
    const role = member.executionRole ?? 'specialist'
    if (role === 'verifier') {
      if (!member.verifiesAgentId) throw new Error('verifier assignments require verifiesAgentId')
      if (member.verifiesAgentId === member.agentId) {
        throw new Error('builder and verifier must be different agents')
      }
      if (!ids.includes(member.verifiesAgentId)) {
        throw new Error('verifier target must be assigned to the same artifact')
      }
    } else if (member.verifiesAgentId) {
      throw new Error('only verifier assignments may set verifiesAgentId')
    }
  }
}

export async function insertArtifactMembers(
  db: Queryable,
  input: { artifact: ArtifactRow; members: ArtifactMemberInput[]; existing: AssignmentRow[] },
): Promise<AssignmentRow[]> {
  if (input.members.length + input.existing.length > 32) throw new Error('Artifact supports at most 32 assignments')
  await assertMembersAvailable(db, input.artifact, input.members)
  const existingIds = new Set(input.existing.map((row) => row.agent_id))
  if (input.members.some((member) => existingIds.has(member.agentId))) {
    throw new Error('agent is already assigned to this artifact')
  }
  const used = new Set(input.existing.map((row) => row.color))
  const created: AssignmentRow[] = []
  for (const member of input.members) {
    const id = `assignment-${createHash('sha256').update(`${input.artifact.id}:${member.agentId}`).digest('hex').slice(0, 28)}`
    const color = artifactAgentColor(member.agentId, used)
    used.add(color)
    created.push(await insertAssignment(db, {
      id,
      artifactId: input.artifact.id,
      agentId: member.agentId,
      assignment: member.assignment.trim(),
      color,
      status: 'waiting',
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

export interface ArtifactAssignmentsApplicationContext {
  db: Queryable
  execution: ArtifactExecution
  transaction: Transaction
  withArtifactFence<T>(artifactId: string, work: (db: Queryable) => Promise<T>): Promise<T>
  getArtifactSnapshot(companyId: string, artifactId: string): Promise<ArtifactSnapshot>
  publishArtifact: PublishArtifact
  logActivity: LogActivity
}

export function createArtifactAssignmentsApplication(context: ArtifactAssignmentsApplicationContext) {
  const { db, transaction, execution, withArtifactFence, getArtifactSnapshot, publishArtifact, logActivity } = context

  async function publishAssignments(companyId: string, artifactId: string): Promise<void> {
    const rows = await artifactAssignmentPublicationRows(db, companyId, artifactId)
    await Promise.all(rows.assignments.map((row) => publishArtifact(companyId, {
      kind: 'assignment.updated',
      artifactId,
      assignment: toAssignment(
        row,
        rows.dependencies
          .filter((item) => item.agent_id === row.agent_id)
          .map((item) => item.depends_on_agent_id),
      ),
    })))
  }

  async function assignArtifactWorkspaceWork(input: {
    companyId: string
    artifactId: string
    actorId: string
    agentId: string
    assignment: string
    actorKind?: ArtifactActorKind
  }): Promise<ArtifactSnapshot> {
    const assignment = input.assignment.trim().slice(0, 4_000)
    if (!assignment) throw new Error('assignment is required')
    let action: ArtifactActivityKind = 'assignment_created'
    await transaction(async (transactionDb) => {
      const artifact = await lockArtifact(transactionDb, input.companyId, input.artifactId)
      if (!artifact || artifact.status !== 'active') throw new Error('only an active artifact accepts new work')
      await assertMembersAvailable(transactionDb, artifact, [{ agentId: input.agentId, assignment }])
      const existing = await lockAssignment(transactionDb, artifact.id, input.agentId)
      if (input.actorKind !== 'user') throw new Error('Agent assignments must be ordinary group mentions')
      if (!artifact.conversation_id) throw new Error('Artifact assignment requires a conversation')
      if (!existing) {
        const all = await listAssignments(transactionDb, artifact.id)
        await insertArtifactMembers(transactionDb, { artifact, members: [{ agentId: input.agentId, assignment }], existing: all })
      } else {
        await execution.cancel(transactionDb, artifact, existing.work_id)
        action = 'assignment_updated'
        await transactionDb.query("UPDATE artifact_agent_assignments SET assignment=$2,status='waiting',work_id=NULL,result=NULL,error=NULL,completed_at=NULL,updated_at=NOW() WHERE id=$1", [existing.id, assignment])
      }
      const id = 'artifact-assignment-' + randomUUID()
      const { rows: authorizations } = await transactionDb.query<{ authorization: string }>(`SELECT COALESCE(access_revoked_at::text,'') AS authorization
        FROM users WHERE id=$1 AND departed_at IS NULL AND suspended_at IS NULL AND deleted_at IS NULL FOR SHARE`, [input.actorId])
      if (!authorizations[0]) throw new Error('Artifact assignment author is no longer active')
      const { rows: requests } = await transactionDb.query<{ id: string }>(`UPDATE artifact_agent_assignments SET request_client_msg_no=$3
        WHERE artifact_id=$1 AND agent_id=$2 RETURNING id`, [artifact.id, input.agentId, id])
      await persistNativeEvents(transactionDb, { key: id, companyId: input.companyId, workId: id }, [{ type: 'im.user',
        companyId: input.companyId, userId: input.actorId, channelId: artifact.conversation_id, clientNonce: id,
        artifactId: artifact.id, assignmentId: requests[0].id, authorization: authorizations[0].authorization,
        payload: createNativeMessage({ id, role: 'user', content: [{ type: 'text', text: '@' + input.agentId + ' 请在' + (artifact.kind === 'slides' ? '演示文稿' : '设计') + '「' + artifact.title + '」中完成：' + assignment }],
          custom: { mentionedIds: [input.agentId] } }) }])
      await touchArtifact(transactionDb, artifact.id)
      await publishArtifactProgress(transactionDb,input.companyId,artifact.id)
    })
    const snapshot = await getArtifactSnapshot(input.companyId, input.artifactId)
    await publishAssignments(input.companyId, input.artifactId)
    await logActivity({
      companyId: input.companyId,
      artifactId: input.artifactId,
      actorId: input.actorId,
      actorKind: input.actorKind ?? 'user',
      action,
      detail: { agentId: input.agentId, assignment },
    })
    return snapshot
  }

  async function stopArtifactAssignment(input: {
    companyId: string
    artifactId: string
    agentId: string
  }): Promise<void> {
    const activity = toActivity(await withArtifactFence(
      input.artifactId,
      async transactionDb => {
        const artifact = await lockArtifact(transactionDb, input.companyId, input.artifactId)
        const assignment = await lockAssignment(transactionDb, input.artifactId, input.agentId)
        if (!artifact || !assignment) throw new Error('active artifact assignment not found')
        await execution.cancel(transactionDb, artifact, assignment.work_id)
        const activity = await stopArtifactAssignmentState(transactionDb, input)
        await publishArtifactProgress(transactionDb,input.companyId,input.artifactId)
        return activity
      },
    ))
    await publishAssignments(input.companyId, input.artifactId)
    await publishArtifact(input.companyId, { kind: 'activity.created', artifactId: input.artifactId, activity })
    const artifact = await artifactById(db, input.companyId, input.artifactId)
    if (artifact) {
      await publishArtifact(input.companyId, {
        kind: 'workspace.updated',
        artifactId: input.artifactId,
        conversationId: artifact.conversation_id ?? undefined,
        workspace: {
          id: input.artifactId,
          status: artifact.status,
          title: artifact.title,
          goal: artifact.goal,
        },
      })
    }
  }

  return {
    assignArtifactWorkspaceWork,
    publishAssignments,
    stopArtifactAssignment,
  }
}

function toActivity(row: {
  id: string
  artifact_id: string
  path: string | null
  actor_id: string
  actor_kind: ArtifactActorKind
  action: string
  detail: Record<string, unknown>
  created_at: string
}): ArtifactActivity {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    path: row.path,
    actorId: row.actor_id,
    actorKind: row.actor_kind,
    action: parseArtifactActivityKind(row.action),
    detail: row.detail ?? {},
    createdAt: row.created_at,
  }
}
