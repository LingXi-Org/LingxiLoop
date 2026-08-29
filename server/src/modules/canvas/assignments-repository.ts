import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasAssignmentExecutionRole } from './contracts.js'
import type { ActivityRow, AssignmentRow, CanvasRow } from './repository-types.js'
import { insertActivity } from './workspace-repository.js'

export async function insertAssignment(db: Queryable, args: {
  id: string; canvasId: string; agentId: string; assignment: string; color: string
  status: 'queued' | 'blocked'; x: number; y: number; workId: string; executionRole: CanvasAssignmentExecutionRole
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

export function insertAssignmentDependency(db: Queryable, assignmentId: string, dependencyId: string) {
  return db.query(
    `INSERT INTO canvas_assignment_dependencies (assignment_id,depends_on_assignment_id)
     VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [assignmentId, dependencyId],
  )
}

export function insertCanvasWork(db: Queryable, args: {
  id: string; companyId: string; agentId: string; channelId: string | null
  triggerClientMsgNo: string | null; status: 'queued' | 'blocked'; canvasId: string
  assignmentId: string; executionRole: CanvasAssignmentExecutionRole; workTriggerClientMsgNo?: string
}) {
  return db.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,canvas_id,canvas_assignment_id,execution_role)
     VALUES ($1,$2,$3,$4,$5,$6,'canvas_worker',$7,180,$8,$9,$10)
     ON CONFLICT (canvas_assignment_id) WHERE canvas_assignment_id IS NOT NULL DO NOTHING`,
    [args.id, args.companyId, args.agentId, args.channelId, args.triggerClientMsgNo,
      args.workTriggerClientMsgNo ?? `canvas:${args.canvasId}:${args.agentId}`,
      args.status, args.canvasId, args.assignmentId, args.executionRole],
  )
}

export async function insertAgentWorkspace(db: Queryable, args: {
  id: string; companyId: string; title: string; conversationId: string; triggerClientMsgNo: string
  goal: string; initiatorAgentId: string
}) {
  const { rows } = await db.query<CanvasRow>(
    `INSERT INTO canvases
       (id,company_id,project_id,title,conversation_id,trigger_client_msg_no,goal,initiator_agent_id,status,origin,created_by)
     SELECT $1,$2,c.project_id,$3,$4,$5,$6,$7,'active','agent_os',$7
       FROM conversations c WHERE c.id=$4 AND c.company_id=$2 AND c.kind='group'
     ON CONFLICT (conversation_id) DO UPDATE SET updated_at=NOW(),status='active' RETURNING *`,
    [args.id, args.companyId, args.title, args.conversationId, args.triggerClientMsgNo, args.goal, args.initiatorAgentId],
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

export async function assignmentExists(db: Queryable, canvasId: string, agentId: string) {
  const { rows } = await db.query(`SELECT 1 FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2`, [canvasId, agentId])
  return Boolean(rows[0])
}

export async function lockAssignment(db: Queryable, canvasId: string, agentId: string) {
  const { rows } = await db.query<AssignmentRow>(
    `SELECT * FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2 FOR UPDATE`,
    [canvasId, agentId],
  )
  return rows[0] ?? null
}

export async function appendAssignmentSteer(db: Queryable, args: {
  companyId: string; assignmentId: string; actorId: string; text: string
}) {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE agent_work_items w SET steer_inputs=w.steer_inputs || jsonb_build_array(jsonb_build_object(
       'id',$3,'text',$4,'createdAt',NOW())),updated_at=NOW()
      FROM canvas_agent_assignments a,canvases c
     WHERE a.id=$2 AND a.canvas_id=c.id AND c.company_id=$1 AND w.canvas_assignment_id=a.id
       AND w.status IN ('queued','blocked','leased') RETURNING w.id`,
    [args.companyId, args.assignmentId, args.actorId, args.text],
  )
  return rows[0]?.id ?? null
}

export function updateAssignmentText(db: Queryable, assignmentId: string, assignment: string) {
  return db.query(`UPDATE canvas_agent_assignments SET assignment=$2,updated_at=NOW() WHERE id=$1`, [assignmentId, assignment])
}

export function detachAssignmentWork(db: Queryable, assignmentId: string) {
  return db.query(`UPDATE agent_work_items SET canvas_assignment_id=NULL,updated_at=NOW() WHERE canvas_assignment_id=$1`, [assignmentId])
}

export function deleteAssignmentDependencies(db: Queryable, assignmentId: string) {
  return db.query(`DELETE FROM canvas_assignment_dependencies WHERE assignment_id=$1`, [assignmentId])
}

export async function resetAssignment(db: Queryable, args: { assignmentId: string; assignment: string; workId: string }) {
  const { rows } = await db.query<AssignmentRow>(
    `UPDATE canvas_agent_assignments SET assignment=$2,status='queued',active_frame_id=NULL,work_id=$3,
       result=NULL,error=NULL,started_at=NULL,completed_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [args.assignmentId, args.assignment, args.workId],
  )
  return rows[0]
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

export async function appendIdempotentAssignmentSteer(db: Queryable, args: {
  assignmentId: string; canvasId: string; agentId: string; steerId: string; text: string
}) {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE agent_work_items w SET steer_inputs=CASE WHEN EXISTS (
       SELECT 1 FROM jsonb_array_elements(w.steer_inputs) item WHERE item->>'id'=$4
     ) THEN w.steer_inputs ELSE w.steer_inputs || jsonb_build_array(jsonb_build_object(
       'id',$4,'text',$5::text,'createdAt',NOW())) END,updated_at=NOW()
     FROM canvas_agent_assignments a WHERE a.id=$1 AND w.canvas_assignment_id=a.id
       AND a.canvas_id=$2 AND a.agent_id=$3 AND w.status IN ('queued','blocked','leased') RETURNING w.id`,
    [args.assignmentId, args.canvasId, args.agentId, args.steerId, args.text],
  )
  return rows[0]?.id ?? null
}

export async function updateAssignmentTextReturning(db: Queryable, assignmentId: string, assignment: string) {
  const { rows } = await db.query<AssignmentRow>(
    `UPDATE canvas_agent_assignments SET assignment=$2,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [assignmentId, assignment],
  )
  return rows[0]
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

export async function steerCanvasWork(db: Queryable, args: {
  companyId: string; canvasId: string; agentId: string; steerId: string; text: string
}) {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE agent_work_items w SET steer_inputs=w.steer_inputs || jsonb_build_array(jsonb_build_object(
       'id',$4,'text',$5,'createdAt',NOW())),updated_at=NOW()
      FROM canvas_agent_assignments a,canvases c
     WHERE a.canvas_id=$2 AND a.agent_id=$3 AND a.canvas_id=c.id AND c.company_id=$1
       AND w.canvas_assignment_id=a.id AND w.status IN ('queued','blocked','leased') RETURNING w.id`,
    [args.companyId, args.canvasId, args.agentId, args.steerId, args.text],
  )
  return rows[0]?.id ?? null
}

export function acquireCanvasSharedFence(db: Queryable, canvasId: string) {
  return db.query(`SELECT pg_advisory_lock_shared(hashtextextended($1,0))`, [`canvas-workspace:${canvasId}`])
}

export function releaseCanvasSharedFence(db: Queryable, canvasId: string) {
  return db.query(`SELECT pg_advisory_unlock_shared(hashtextextended($1,0))`, [`canvas-workspace:${canvasId}`])
}

async function beginSummaryIfFinished(db: Queryable, canvasId: string): Promise<void> {
  const { rows: unfinished } = await db.query(
    `SELECT 1 FROM canvas_agent_assignments WHERE canvas_id=$1 AND
      (status IN ('queued','working','waiting') OR (status='blocked' AND error IS NULL)) LIMIT 1`,
    [canvasId],
  )
  if (unfinished[0]) return
  const { rows } = await db.query<CanvasRow>(
    `UPDATE canvases SET status='summarizing',updated_at=NOW() WHERE id=$1 AND status='active' RETURNING *`,
    [canvasId],
  )
  const canvas = rows[0]
  if (!canvas?.initiator_agent_id || !canvas.conversation_id) return
  const summaryWorkId = `canvas-summary-${createHash('sha256').update(canvas.id).digest('hex').slice(0,24)}`
  await db.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,canvas_id,execution_role)
     VALUES ($1,$2,$3,$4,$5,$6,'canvas_summary','queued',200,$7,'reporter') ON CONFLICT (id) DO NOTHING`,
    [summaryWorkId, canvas.company_id, canvas.initiator_agent_id, canvas.conversation_id,
      canvas.trigger_client_msg_no, `canvas-summary:${canvas.id}`, canvas.id],
  )
}

export async function stopCanvasAssignmentState(db: Queryable, args: {
  companyId: string; canvasId: string; agentId: string
}) {
  const { rows: candidates } = await db.query<{ id: string }>(
    `SELECT w.id FROM agent_work_items w
      JOIN canvas_agent_assignments a ON w.canvas_assignment_id=a.id
      JOIN canvases c ON a.canvas_id=c.id
     WHERE a.canvas_id=$2 AND a.agent_id=$3 AND c.company_id=$1
       AND w.status IN ('queued','blocked','leased')`,
    [args.companyId, args.canvasId, args.agentId],
  )
  if (!candidates[0]) throw new Error('active canvas assignment not found')
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`agent-work:${candidates[0].id}`])
  const { rows: works } = await db.query<{ id: string; canvas_assignment_id: string }>(
    `UPDATE agent_work_items w SET cancel_requested_at=NOW(),
       status=CASE WHEN w.status IN ('queued','blocked') THEN 'cancelled' ELSE w.status END,updated_at=NOW()
      FROM canvas_agent_assignments a,canvases c
     WHERE a.canvas_id=$2 AND a.agent_id=$3 AND a.canvas_id=c.id AND c.company_id=$1
       AND w.canvas_assignment_id=a.id AND w.status IN ('queued','blocked','leased')
     RETURNING w.id,w.canvas_assignment_id`,
    [args.companyId, args.canvasId, args.agentId],
  )
  const work = works[0]
  if (!work) throw new Error('active canvas assignment not found')
  const { rows: assignments } = await db.query<{ active_frame_id: string | null }>(
    `UPDATE canvas_agent_assignments SET status='cancelled',error='Stopped by learner',completed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status NOT IN ('completed','failed','cancelled') RETURNING active_frame_id`,
    [work.canvas_assignment_id],
  )
  if (!assignments[0]) throw new Error('active canvas assignment not found')
  const activityId = `activity-${createHash('sha256').update(`canvas-stop:${work.id}`).digest('hex').slice(0,32)}`
  const activity = await insertActivity(db, {
    id: activityId, canvasId: args.canvasId, frameId: assignments[0].active_frame_id,
    actorId: args.agentId, actorKind: 'agent', action: 'task_cancelled',
    detail: { status: 'cancelled', error: 'Stopped by learner' },
  })
  await db.query(
    `WITH RECURSIVE blocked_descendants(id) AS (
       SELECT d.assignment_id FROM canvas_assignment_dependencies d
        JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
        WHERE parent.canvas_id=$1 AND parent.status IN ('failed','cancelled')
       UNION SELECT d.assignment_id FROM canvas_assignment_dependencies d
        JOIN blocked_descendants b ON b.id=d.depends_on_assignment_id
     ) UPDATE canvas_agent_assignments child SET status='blocked',error='Blocked by a failed or stopped dependency',
       completed_at=NOW(),updated_at=NOW()
       WHERE child.id IN (SELECT id FROM blocked_descendants) AND child.status='blocked' AND child.error IS NULL`,
    [args.canvasId],
  )
  await db.query(
    `UPDATE agent_work_items work SET status='cancelled',cancel_requested_at=COALESCE(cancel_requested_at,NOW()),updated_at=NOW()
       FROM canvas_agent_assignments assignment
      WHERE work.canvas_assignment_id=assignment.id AND assignment.canvas_id=$1
        AND assignment.status='blocked' AND assignment.error IS NOT NULL AND work.status='blocked'`,
    [args.canvasId],
  )
  await beginSummaryIfFinished(db, args.canvasId)
  return activity
}

export async function stopCanvasWorkspaceState(db: Queryable, companyId: string, canvasId: string) {
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`canvas-workspace:${canvasId}`])
  const canvas = await lockCanvas(db, companyId, canvasId)
  if (!canvas || !['active','summarizing','stopped'].includes(canvas.status)) throw new Error('active canvas not found')
  await db.query(`UPDATE canvases SET status='stopped',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW() WHERE id=$1`, [canvasId])
  await db.query(
    `UPDATE agent_work_items SET cancel_requested_at=COALESCE(cancel_requested_at,NOW()),
       status=CASE WHEN status IN ('queued','blocked') THEN 'cancelled' ELSE status END,updated_at=NOW()
      WHERE canvas_id=$1 AND status IN ('queued','blocked','leased')`,
    [canvasId],
  )
  await db.query(
    `UPDATE canvas_agent_assignments SET status='cancelled',error='Workspace stopped by learner',
       completed_at=NOW(),updated_at=NOW()
      WHERE canvas_id=$1 AND status NOT IN ('completed','failed','cancelled')`,
    [canvasId],
  )
}
