import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasAssignmentExecutionRole } from './contracts.js'
import type { ActivityRow, AssignmentRow, CanvasRow } from './repository-types.js'
import { insertActivity } from './workspace-repository.js'

export async function insertAssignment(db: Queryable, args: {
  id: string; canvasId: string; agentId: string; assignment: string; color: string
  status: 'waiting'; x: number; y: number; workId: string | null; executionRole: CanvasAssignmentExecutionRole
}) {
  const { rows } = await db.query<AssignmentRow>(
    `INSERT INTO canvas_agent_assignments
       (id,canvas_id,agent_id,assignment,color,status,work_x,work_y,work_width,work_height,work_id,cursor_x,cursor_y,execution_role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,680,520,$9,$10,$11,$12)
     ON CONFLICT (canvas_id,agent_id) DO UPDATE SET updated_at=canvas_agent_assignments.updated_at RETURNING *`,
    [args.id, args.canvasId, args.agentId, args.assignment, args.color, args.status, args.x, args.y,
      args.workId, args.x + 40, args.y + 60, args.executionRole],
  )
  return rows[0]
}

export function setAssignmentVerifier(db: Queryable, assignmentId: string, targetId: string) {
  return db.query(`UPDATE canvas_agent_assignments SET verifies_assignment_id=$2 WHERE id=$1`, [assignmentId, targetId])
}


export async function insertAgentWorkspace(db: Queryable, args: {
  id: string; companyId: string; title: string; conversationId: string; triggerClientMsgNo: string
  goal: string; initiatorAgentId: string; authorizationUserId: string | null
}) {
  const { rows } = await db.query<CanvasRow>(
    `INSERT INTO canvases
       (id,company_id,project_id,title,conversation_id,trigger_client_msg_no,goal,initiator_agent_id,status,origin,created_by,authorization_user_id)
     SELECT $1,$2,c.project_id,$3,$4,$5,$6,$7,'active','agent_os',$7,$8
       FROM conversations c WHERE c.id=$4 AND c.company_id=$2
     ON CONFLICT (conversation_id) DO UPDATE SET updated_at=NOW(),status='active',title=EXCLUDED.title,goal=EXCLUDED.goal,
       initiator_agent_id=EXCLUDED.initiator_agent_id,authorization_user_id=EXCLUDED.authorization_user_id,
       trigger_client_msg_no=EXCLUDED.trigger_client_msg_no RETURNING *`,
    [args.id, args.companyId, args.title, args.conversationId, args.triggerClientMsgNo,
      args.goal, args.initiatorAgentId, args.authorizationUserId],
  )
  return rows[0] ?? null
}

export async function listAssignments(db: Queryable, canvasId: string) {
  const { rows } = await db.query<AssignmentRow>(
    `SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 ORDER BY created_at`,
    [canvasId],
  )
  return rows
}

export async function lockCanvas(db: Queryable, companyId: string, canvasId: string) {
  const { rows } = await db.query<CanvasRow>(
    `SELECT * FROM canvases WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [canvasId, companyId],
  )
  return rows[0] ?? null
}


export async function lockAssignment(db: Queryable, canvasId: string, agentId: string) {
  const { rows } = await db.query<AssignmentRow>(
    `SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2 FOR UPDATE`,
    [canvasId, agentId],
  )
  return rows[0] ?? null
}




export async function canvasAssignmentPublicationRows(db: Queryable, companyId: string, canvasId: string) {
  const [assignments, dependencies] = await Promise.all([
    db.query<AssignmentRow>(
      `SELECT assignment.* FROM canvas_agent_assignments assignment
        JOIN canvases canvas ON canvas.id=assignment.canvas_id
       WHERE assignment.canvas_id=$1 AND canvas.company_id=$2`,
      [canvasId, companyId],
    ),
    db.query<{ agent_id: string; depends_on_agent_id: string }>(
      `SELECT child.agent_id,parent.agent_id AS depends_on_agent_id
         FROM canvas_assignment_dependencies d
         JOIN canvas_agent_assignments child ON child.id=d.assignment_id
         JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
         JOIN canvases canvas ON canvas.id=child.canvas_id
        WHERE child.canvas_id=$1 AND canvas.company_id=$2`,
      [canvasId, companyId],
    ),
  ])
  return { assignments: assignments.rows, dependencies: dependencies.rows }
}

export async function findActivity(db: Queryable, canvasId: string, activityId: string) {
  const { rows } = await db.query<ActivityRow>(
    `SELECT * FROM canvas_activity WHERE id=$1 AND canvas_id=$2`,
    [activityId, canvasId],
  )
  return rows[0] ?? null
}

export async function canvasFrameIds(db: Queryable, canvasId: string, ids: string[]) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM canvas_frames WHERE canvas_id=$1 AND id=ANY($2::text[])`,
    [canvasId, ids],
  )
  return rows.map((row) => row.id)
}


export async function participantNames(db: Queryable, companyId: string, ids: string[]) {
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
    [companyId, ids],
  )
  return rows
}

export async function canvasById(db: Queryable, companyId: string, canvasId: string) {
  const { rows } = await db.query<CanvasRow>(`SELECT * FROM canvases WHERE id=$1 AND company_id=$2`, [canvasId, companyId])
  return rows[0] ?? null
}

export function acquireCanvasSharedFence(db: Queryable, canvasId: string) {
  return db.query(`SELECT pg_advisory_lock_shared(hashtextextended($1,0))`, [`canvas-workspace:${canvasId}`])
}

export function releaseCanvasSharedFence(db: Queryable, canvasId: string) {
  return db.query(`SELECT pg_advisory_unlock_shared(hashtextextended($1,0))`, [`canvas-workspace:${canvasId}`])
}

export async function stopCanvasAssignmentState(db: Queryable, args: {
  companyId: string; canvasId: string; agentId: string
}) {
  const { rows } = await db.query<AssignmentRow & { request_client_msg_no: string | null }>(
    `UPDATE canvas_agent_assignments a SET status='cancelled',error='Stopped by request',completed_at=NOW(),updated_at=NOW()
      FROM canvases c WHERE a.canvas_id=c.id AND c.company_id=$1 AND a.canvas_id=$2 AND a.agent_id=$3
      AND a.status NOT IN ('completed','failed','cancelled') RETURNING a.*`,
    [args.companyId,args.canvasId,args.agentId])
  const assignment = rows[0]
  if (!assignment) throw new Error('active canvas assignment not found')
  return insertActivity(db, {
      id: 'activity-' + createHash('sha256').update('canvas-stop:' + assignment.id + ':' + (assignment.request_client_msg_no ?? assignment.work_id ?? 'initial')).digest('hex').slice(0,32),
    canvasId: args.canvasId, frameId: assignment.active_frame_id, actorId: args.agentId, actorKind: 'agent',
    action: 'task_cancelled', detail: { status: 'cancelled', error: 'Stopped by request' },
  })
}

export async function stopCanvasWorkspaceState(db: Queryable, companyId: string, canvasId: string) {
  const canvas = await lockCanvas(db, companyId, canvasId)
  if (!canvas || !['active','summarizing','stopped'].includes(canvas.status)) throw new Error('active canvas not found')
  await db.query(`UPDATE canvases SET status='stopped',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW() WHERE id=$1`, [canvasId])
  await db.query(`UPDATE canvas_agent_assignments SET status='cancelled',error='Workspace stopped by request',
    completed_at=NOW(),updated_at=NOW() WHERE canvas_id=$1 AND status NOT IN ('completed','failed','cancelled')`, [canvasId])
}
