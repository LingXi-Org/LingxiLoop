import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { ArtifactAssignmentExecutionRole } from './contracts.js'
import type { AssignmentRow, ArtifactRow } from './repository-types.js'
import { insertActivity } from './workspace-repository.js'

export async function insertAssignment(db: Queryable, args: {
  id: string; artifactId: string; agentId: string; assignment: string; color: string
  status: 'waiting'; workId: string | null; executionRole: ArtifactAssignmentExecutionRole
}) {
  const { rows } = await db.query<AssignmentRow>(
    `INSERT INTO artifact_agent_assignments (id,artifact_id,agent_id,assignment,color,status,work_id,execution_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (artifact_id,agent_id) DO UPDATE SET updated_at=artifact_agent_assignments.updated_at RETURNING *`,
    [args.id, args.artifactId, args.agentId, args.assignment, args.color, args.status, args.workId, args.executionRole],
  )
  return rows[0]
}

export function setAssignmentVerifier(db: Queryable, assignmentId: string, targetId: string) {
  return db.query(`UPDATE artifact_agent_assignments SET verifies_assignment_id=$2 WHERE id=$1`, [assignmentId, targetId])
}

/** Starts (or restarts) the shared workspace of an existing artifact in its conversation. */
export async function startAgentWorkspace(db: Queryable, args: {
  artifactId: string; companyId: string; title: string; conversationId: string; triggerClientMsgNo: string
  goal: string; initiatorAgentId: string; authorizationUserId: string | null
}) {
  const { rows } = await db.query<ArtifactRow>(
    `UPDATE artifacts SET updated_at=NOW(),status='active',origin='agent_os',title=$3,goal=$5,initiator_agent_id=$6,
       authorization_user_id=$7,trigger_client_msg_no=$8,completed_at=NULL
      WHERE id=$1 AND company_id=$2 AND conversation_id=$4 RETURNING *`,
    [args.artifactId, args.companyId, args.title, args.conversationId, args.goal, args.initiatorAgentId,
      args.authorizationUserId, args.triggerClientMsgNo],
  )
  return rows[0] ?? null
}

export async function listAssignments(db: Queryable, artifactId: string) {
  const { rows } = await db.query<AssignmentRow>(
    `SELECT * FROM artifact_agent_assignments WHERE artifact_id=$1 ORDER BY created_at`,
    [artifactId],
  )
  return rows
}

export async function lockArtifact(db: Queryable, companyId: string, artifactId: string) {
  const { rows } = await db.query<ArtifactRow>(
    `SELECT * FROM artifacts WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [artifactId, companyId],
  )
  return rows[0] ?? null
}

export async function lockAssignment(db: Queryable, artifactId: string, agentId: string) {
  const { rows } = await db.query<AssignmentRow>(
    `SELECT * FROM artifact_agent_assignments WHERE artifact_id=$1 AND agent_id=$2 FOR UPDATE`,
    [artifactId, agentId],
  )
  return rows[0] ?? null
}

export function touchArtifact(db: Queryable, artifactId: string) {
  return db.query('UPDATE artifacts SET updated_at=NOW() WHERE id=$1', [artifactId])
}

export async function artifactAssignmentPublicationRows(db: Queryable, companyId: string, artifactId: string) {
  const [assignments, dependencies] = await Promise.all([
    db.query<AssignmentRow>(
      `SELECT assignment.* FROM artifact_agent_assignments assignment
        JOIN artifacts artifact ON artifact.id=assignment.artifact_id
       WHERE assignment.artifact_id=$1 AND artifact.company_id=$2`,
      [artifactId, companyId],
    ),
    db.query<{ agent_id: string; depends_on_agent_id: string }>(
      `SELECT child.agent_id,parent.agent_id AS depends_on_agent_id
         FROM artifact_assignment_dependencies d
         JOIN artifact_agent_assignments child ON child.id=d.assignment_id
         JOIN artifact_agent_assignments parent ON parent.id=d.depends_on_assignment_id
         JOIN artifacts artifact ON artifact.id=child.artifact_id
        WHERE child.artifact_id=$1 AND artifact.company_id=$2`,
      [artifactId, companyId],
    ),
  ])
  return { assignments: assignments.rows, dependencies: dependencies.rows }
}

export async function artifactById(db: Queryable, companyId: string, artifactId: string) {
  const { rows } = await db.query<ArtifactRow>(`SELECT * FROM artifacts WHERE id=$1 AND company_id=$2`, [artifactId, companyId])
  return rows[0] ?? null
}

export function acquireArtifactSharedFence(db: Queryable, artifactId: string) {
  return db.query(`SELECT pg_advisory_lock_shared(hashtextextended($1,0))`, [`artifact-workspace:${artifactId}`])
}

export function releaseArtifactSharedFence(db: Queryable, artifactId: string) {
  return db.query(`SELECT pg_advisory_unlock_shared(hashtextextended($1,0))`, [`artifact-workspace:${artifactId}`])
}

export async function stopArtifactAssignmentState(db: Queryable, args: {
  companyId: string; artifactId: string; agentId: string
}) {
  const { rows } = await db.query<AssignmentRow & { request_client_msg_no: string | null }>(
    `UPDATE artifact_agent_assignments a SET status='cancelled',error='Stopped by request',completed_at=NOW(),updated_at=NOW()
      FROM artifacts c WHERE a.artifact_id=c.id AND c.company_id=$1 AND a.artifact_id=$2 AND a.agent_id=$3
      AND a.status NOT IN ('completed','failed','cancelled') RETURNING a.*`,
    [args.companyId,args.artifactId,args.agentId])
  const assignment = rows[0]
  if (!assignment) throw new Error('active artifact assignment not found')
  return insertActivity(db, {
    id: 'activity-' + createHash('sha256').update('artifact-stop:' + assignment.id + ':' + (assignment.request_client_msg_no ?? assignment.work_id ?? 'initial')).digest('hex').slice(0,32),
    artifactId: args.artifactId, path: assignment.active_path, actorId: args.agentId, actorKind: 'agent',
    action: 'task_cancelled', detail: { status: 'cancelled', error: 'Stopped by request' },
  })
}

export async function stopArtifactWorkspaceState(db: Queryable, companyId: string, artifactId: string) {
  const artifact = await lockArtifact(db, companyId, artifactId)
  if (!artifact || !['active','summarizing','stopped'].includes(artifact.status)) throw new Error('active artifact workspace not found')
  await db.query(`UPDATE artifacts SET status='stopped',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW() WHERE id=$1`, [artifactId])
  await db.query(`UPDATE artifact_agent_assignments SET status='cancelled',error='Workspace stopped by request',
    completed_at=NOW(),updated_at=NOW() WHERE artifact_id=$1 AND status NOT IN ('completed','failed','cancelled')`, [artifactId])
}

