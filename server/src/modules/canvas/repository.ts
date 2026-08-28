import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type {
  CanvasActorKind,
  CanvasAssignmentExecutionRole,
  CanvasAssignmentStatus,
  CanvasEvidenceRef,
  CanvasFrameType,
  CanvasReportVerdict,
  CanvasWorkspaceStatus,
} from './contracts.js'

export interface FrameRow {
  id: string; canvas_id: string; type: CanvasFrameType; title: string
  x: number | string; y: number | string; width: number | string; height: number | string
  content: string; data: Record<string, unknown> | null; revision: number | string
  created_by: string; updated_by: string; created_at: string; updated_at: string
}

export interface CanvasRow {
  id: string; company_id: string; project_id: string | null; title: string; conversation_id: string | null
  trigger_client_msg_no: string | null; goal: string; initiator_agent_id: string | null
  status: CanvasWorkspaceStatus; origin: string; summary: string | null
  created_by: string; created_at: string; updated_at: string
}

export interface AssignmentRow {
  id: string; canvas_id: string; agent_id: string; assignment: string; color: string
  status: CanvasAssignmentStatus; work_x: number | string; work_y: number | string
  work_width: number | string; work_height: number | string; active_frame_id: string | null
  cursor_x: number | string | null; cursor_y: number | string | null; work_id: string | null
  result: string | null; error: string | null; started_at: string | null; completed_at: string | null
  updated_at: string; execution_role: CanvasAssignmentExecutionRole; verifies_assignment_id: string | null
  progress_fingerprint: string | null; no_progress_count: number | string | null
}

export interface ReportRow {
  id: string; canvas_id: string; assignment_id: string | null; author_agent_id: string
  execution_role: 'specialist' | 'verifier' | 'reporter'; schema_version: 'learning_report_v1'
  finding: string; evidence_refs: CanvasEvidenceRef[]; confidence: number | string; unresolved: string[]
  next_step: string | null; verifies_report_id: string | null; disconfirming_checks: string[]
  verdict: CanvasReportVerdict | null; consumed_report_ids: string[]; conflict_resolution: unknown[]; created_at: string
}

export interface ActivityRow {
  id: string; canvas_id: string; frame_id: string | null; actor_id: string
  actor_kind: CanvasActorKind; action: string; detail: Record<string, unknown>; created_at: string
}

export interface PresenceRow {
  participant_id: string; participant_kind: CanvasActorKind; status: string
  frame_id: string | null; color: string | null; cursor_x: number | string | null
  cursor_y: number | string | null; last_seen_at: string
}

export interface CommentRow {
  id: string; canvas_id: string; frame_id: string | null; author_id: string
  author_kind: CanvasActorKind; body: string; created_at: string
}

export async function canvasEventScope(db: Queryable, companyId: string, canvasId: string) {
  const { rows } = await db.query<{ conversation_id: string | null; project_id: string | null }>(
    `SELECT conversation_id,project_id FROM canvases WHERE id=$1 AND company_id=$2`,
    [canvasId, companyId],
  )
  return rows[0] ?? null
}

export async function findCanvas(db: Queryable, companyId: string, canvasId: string, projectId?: string) {
  const { rows } = await db.query<CanvasRow>(
    `SELECT * FROM canvases WHERE id=$1 AND company_id=$2 AND ($3::text IS NULL OR project_id=$3) LIMIT 1`,
    [canvasId, companyId, projectId ?? null],
  )
  return rows[0] ?? null
}

export async function findFrame(db: Queryable, companyId: string, frameId: string) {
  const { rows } = await db.query<FrameRow>(
    `SELECT f.* FROM canvas_frames f
       JOIN canvases c ON c.id=f.canvas_id
      WHERE f.id=$1 AND c.company_id=$2 LIMIT 1`,
    [frameId, companyId],
  )
  return rows[0] ?? null
}

export async function insertActivity(db: Queryable, args: {
  id: string; canvasId: string; frameId: string | null; actorId: string
  actorKind: CanvasActorKind; action: string; detail: Record<string, unknown>
}) {
  const { rows } = await db.query<ActivityRow>(
    `INSERT INTO canvas_activity (id,canvas_id,frame_id,actor_id,actor_kind,action,detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     ON CONFLICT (id) DO UPDATE SET id=canvas_activity.id RETURNING *`,
    [args.id, args.canvasId, args.frameId, args.actorId, args.actorKind, args.action, JSON.stringify(args.detail)],
  )
  return rows[0]
}

export async function listWorkspaceRows(db: Queryable, companyId: string, conversationId?: string, projectId?: string) {
  const values: unknown[] = [companyId]
  const conversation = conversationId ? `AND c.conversation_id=$${values.push(conversationId)}` : ''
  const project = projectId ? `AND c.project_id=$${values.push(projectId)}` : ''
  const { rows } = await db.query<{
    id: string; title: string; goal: string; conversation_id: string | null; initiator_agent_id: string | null
    status: CanvasWorkspaceStatus; origin: string; frame_count: string | number; assignment_count: string | number
    updated_at: string; created_at: string
  }>(
    `SELECT c.id,c.title,c.goal,c.conversation_id,c.initiator_agent_id,c.status,c.origin,c.updated_at,c.created_at,
            COUNT(DISTINCT f.id)::int AS frame_count,COUNT(DISTINCT a.id)::int AS assignment_count
       FROM canvases c LEFT JOIN canvas_frames f ON f.canvas_id=c.id
       LEFT JOIN canvas_agent_assignments a ON a.canvas_id=c.id
      WHERE c.company_id=$1 ${conversation} ${project}
      GROUP BY c.id ORDER BY c.updated_at DESC`,
    values,
  )
  return rows
}

export async function ensureConversationCanvasId(db: Queryable, args: {
  id: string; companyId: string; conversationId: string; actorId: string
}) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO canvases (id,company_id,conversation_id,title,goal,created_by,origin)
     SELECT $1,c.company_id,c.id,c.title || ' Canvas',COALESCE(c.topic,''),$4,'conversation'
       FROM conversations c WHERE c.id=$2 AND c.company_id=$3 AND c.kind='group'
     ON CONFLICT (conversation_id) DO UPDATE SET conversation_id=EXCLUDED.conversation_id RETURNING id`,
    [args.id, args.conversationId, args.companyId, args.actorId],
  )
  return rows[0]?.id ?? null
}

export async function conversationCanvasId(db: Queryable, companyId: string, conversationId: string) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM canvases WHERE company_id=$1 AND conversation_id=$2 LIMIT 1`,
    [companyId, conversationId],
  )
  return rows[0]?.id ?? null
}

export async function snapshotRows(db: Queryable, canvasId: string) {
  const [frames, presence, assignments, dependencies, comments, activity, reports] = await Promise.all([
    db.query<FrameRow>(`SELECT * FROM canvas_frames WHERE canvas_id=$1 ORDER BY created_at ASC`, [canvasId]),
    db.query<PresenceRow>(
      `SELECT participant_id,participant_kind,status,frame_id,color,cursor_x,cursor_y,last_seen_at
         FROM canvas_presence WHERE canvas_id=$1 AND last_seen_at > NOW() - INTERVAL '2 minutes'
        ORDER BY last_seen_at DESC`,
      [canvasId],
    ),
    db.query<AssignmentRow>(
      `SELECT a.*,w.progress_fingerprint,w.no_progress_count
         FROM canvas_agent_assignments a LEFT JOIN agent_work_items w ON w.id=a.work_id
        WHERE a.canvas_id=$1 ORDER BY a.created_at ASC`,
      [canvasId],
    ),
    db.query<{ agent_id: string; depends_on_agent_id: string }>(
      `SELECT child.agent_id,parent.agent_id AS depends_on_agent_id
         FROM canvas_assignment_dependencies d
         JOIN canvas_agent_assignments child ON child.id=d.assignment_id
         JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
        WHERE child.canvas_id=$1`,
      [canvasId],
    ),
    db.query<CommentRow>(`SELECT * FROM canvas_comments WHERE canvas_id=$1 ORDER BY created_at DESC LIMIT 100`, [canvasId]),
    db.query<ActivityRow>(`SELECT * FROM canvas_activity WHERE canvas_id=$1 ORDER BY created_at DESC LIMIT 100`, [canvasId]),
    db.query<ReportRow>(`SELECT * FROM canvas_assignment_reports WHERE canvas_id=$1 ORDER BY created_at ASC`, [canvasId]),
  ])
  return {
    frames: frames.rows,
    presence: presence.rows,
    assignments: assignments.rows,
    dependencies: dependencies.rows,
    comments: comments.rows,
    activity: activity.rows,
    reports: reports.rows,
  }
}

export function lockCanvasLayout(db: Queryable, canvasId: string) {
  return db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`canvas-layout:${canvasId}`])
}

export async function assignmentOrigin(db: Queryable, canvasId: string, agentId: string) {
  const { rows } = await db.query<{ work_x: number | string; work_y: number | string }>(
    `SELECT work_x,work_y FROM canvas_agent_assignments WHERE canvas_id=$1 AND agent_id=$2`,
    [canvasId, agentId],
  )
  return rows[0] ?? null
}

export async function occupiedFrames(db: Queryable, canvasId: string) {
  const { rows } = await db.query<Pick<FrameRow, 'x' | 'y' | 'width' | 'height'>>(
    `SELECT x,y,width,height FROM canvas_frames WHERE canvas_id=$1 ORDER BY created_at ASC`,
    [canvasId],
  )
  return rows
}

export async function insertFrame(db: Queryable, args: {
  id: string; canvasId: string; type: CanvasFrameType; title: string; x: number; y: number
  width: number; height: number; content: string; data: Record<string, unknown>; actorId: string
}) {
  const { rows } = await db.query<FrameRow>(
    `INSERT INTO canvas_frames
       (id,canvas_id,type,title,x,y,width,height,content,data,created_by,updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$11)
     ON CONFLICT (id) DO UPDATE SET id=canvas_frames.id RETURNING *`,
    [args.id, args.canvasId, args.type, args.title, args.x, args.y, args.width, args.height,
      args.content, JSON.stringify(args.data), args.actorId],
  )
  return rows[0]
}

export function markAssignmentFrame(db: Queryable, canvasId: string, agentId: string, frame: {
  id: string; x: number; y: number; width: number
}, working: boolean) {
  return db.query(
    `UPDATE canvas_agent_assignments SET active_frame_id=$3,cursor_x=$4,cursor_y=$5,
       ${working ? "status='working',started_at=COALESCE(started_at,NOW())," : ''}updated_at=NOW()
      WHERE canvas_id=$1 AND agent_id=$2`,
    [canvasId, agentId, frame.id, frame.x + frame.width / 2, frame.y + 28],
  )
}

export function touchCanvas(db: Queryable, canvasId: string) {
  return db.query(`UPDATE canvases SET updated_at=NOW() WHERE id=$1`, [canvasId])
}

export type FrameUpdateField = 'type' | 'title' | 'x' | 'y' | 'width' | 'height' | 'content' | 'data' | 'updated_by'

export async function updateFrame(db: Queryable, args: {
  companyId: string; frameId: string; baseRevision: number | null
  changes: Array<{ field: FrameUpdateField; value: unknown; json?: boolean }>
}) {
  const values: unknown[] = []
  const sets = args.changes.map((change) => {
    values.push(change.value)
    return `${change.field}=$${values.length}${change.json ? '::jsonb' : ''}`
  })
  values.push(args.frameId, args.companyId, args.baseRevision)
  const { rows } = await db.query<FrameRow>(
    `UPDATE canvas_frames f SET ${sets.join(', ')},revision=revision+1,updated_at=NOW()
       FROM canvases c
      WHERE f.id=$${values.length - 2} AND f.canvas_id=c.id AND c.company_id=$${values.length - 1}
        AND ($${values.length}::bigint IS NULL OR f.revision=$${values.length}::bigint)
      RETURNING f.*`,
    values,
  )
  return rows[0] ?? null
}

export async function appendFrame(db: Queryable, args: {
  companyId: string; frameId: string; actorId: string; content: string; maxBytes: number
}) {
  const { rows } = await db.query<FrameRow>(
    `UPDATE canvas_frames f SET content=f.content || $1,updated_by=$2,revision=revision+1,updated_at=NOW()
       FROM canvases c
      WHERE f.id=$3 AND f.canvas_id=c.id AND c.company_id=$4 AND octet_length(f.content || $1) <= $5
      RETURNING f.*`,
    [args.content, args.actorId, args.frameId, args.companyId, args.maxBytes],
  )
  return rows[0] ?? null
}

export function deleteFrame(db: Queryable, frameId: string) {
  return db.query(`DELETE FROM canvas_frames WHERE id=$1`, [frameId])
}

export async function currentPresence(db: Queryable, canvasId: string, participantId: string) {
  const { rows } = await db.query<{ status: string; frame_id: string | null }>(
    `SELECT status,frame_id FROM canvas_presence WHERE canvas_id=$1 AND participant_id=$2 LIMIT 1`,
    [canvasId, participantId],
  )
  return rows[0] ?? null
}

export function deletePresence(db: Queryable, canvasId: string, participantId: string) {
  return db.query(`DELETE FROM canvas_presence WHERE canvas_id=$1 AND participant_id=$2`, [canvasId, participantId])
}

export async function upsertPresence(db: Queryable, args: {
  canvasId: string; participantId: string; participantKind: CanvasActorKind; status: string
  frameId: string | null; cursorX: number | null; cursorY: number | null
}) {
  const { rows } = await db.query<PresenceRow>(
    `INSERT INTO canvas_presence (canvas_id,participant_id,participant_kind,status,frame_id,color,cursor_x,cursor_y,last_seen_at)
     VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,NOW())
     ON CONFLICT (canvas_id,participant_id) DO UPDATE SET
       participant_kind=EXCLUDED.participant_kind,status=EXCLUDED.status,frame_id=EXCLUDED.frame_id,
       color=COALESCE(EXCLUDED.color,canvas_presence.color),cursor_x=COALESCE(EXCLUDED.cursor_x,canvas_presence.cursor_x),
       cursor_y=COALESCE(EXCLUDED.cursor_y,canvas_presence.cursor_y),last_seen_at=NOW()
     RETURNING participant_id,participant_kind,status,frame_id,color,cursor_x,cursor_y,last_seen_at`,
    [args.canvasId, args.participantId, args.participantKind, args.status, args.frameId, args.cursorX, args.cursorY],
  )
  return rows[0]
}

export function updateAssignmentPresence(db: Queryable, args: {
  canvasId: string; agentId: string; status: CanvasAssignmentStatus; frameId: string | null
  cursorX: number | null; cursorY: number | null
}) {
  return db.query(
    `UPDATE canvas_agent_assignments SET status=$3,active_frame_id=$4,
       cursor_x=COALESCE($5,cursor_x),cursor_y=COALESCE($6,cursor_y),updated_at=NOW()
      WHERE canvas_id=$1 AND agent_id=$2`,
    [args.canvasId, args.agentId, args.status, args.frameId, args.cursorX, args.cursorY],
  )
}

export async function insertComment(db: Queryable, args: {
  id: string; canvasId: string; frameId: string | null; authorId: string; authorKind: CanvasActorKind; body: string
}) {
  const { rows } = await db.query<CommentRow>(
    `INSERT INTO canvas_comments (id,canvas_id,frame_id,author_id,author_kind,body)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [args.id, args.canvasId, args.frameId, args.authorId, args.authorKind, args.body],
  )
  return rows[0]
}

export async function availableAgents(db: Queryable, companyId: string) {
  const { rows } = await db.query<{ id: string; name: string; role: string | null; status: string | null }>(
    `SELECT id,name,role,status FROM participants
      WHERE company_id=$1 AND kind='agent' AND departed_at IS NULL AND capabilities @> '["canvas"]'::jsonb
      ORDER BY name`,
    [companyId],
  )
  return rows
}

export async function availableCanvasMemberIds(db: Queryable, companyId: string, ids: string[]) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM participants WHERE company_id=$1 AND id=ANY($2::text[]) AND kind='agent'
       AND departed_at IS NULL AND capabilities @> '["canvas"]'::jsonb`,
    [companyId, ids],
  )
  return rows.map((row) => row.id)
}

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

export async function evidenceRefExists(db: Queryable, args: {
  companyId: string; canvasId: string; kind: CanvasEvidenceRef['kind']; id: string
}) {
  const queries: Record<CanvasEvidenceRef['kind'], string> = {
    frame: `SELECT 1 FROM canvas_frames WHERE id=$1 AND canvas_id=$2`,
    report: `SELECT 1 FROM canvas_assignment_reports WHERE id=$1 AND canvas_id=$2 AND company_id=$3`,
    message: `SELECT 1 FROM messages m JOIN canvases c ON c.conversation_id=m.conversation_id
      WHERE m.id=$1 AND c.id=$2 AND c.company_id=$3`,
    document: `SELECT 1 FROM documents d JOIN canvases c ON c.company_id=d.company_id
      WHERE d.id=$1 AND c.id=$2 AND c.company_id=$3 AND (d.conversation_id IS NULL OR d.conversation_id=c.conversation_id)`,
    source: `SELECT 1 FROM knowledge_sources s JOIN canvases c ON c.project_id=s.project_id
      WHERE s.id=$1 AND c.id=$2 AND s.company_id=$3 AND s.deleted_at IS NULL`,
    attempt: `SELECT 1 FROM learning_attempts attempt
      JOIN courses course ON course.id=attempt.course_id AND course.company_id=attempt.company_id
      JOIN canvases canvas ON canvas.project_id=course.project_id AND canvas.company_id=course.company_id
      WHERE attempt.id=$1 AND canvas.id=$2 AND course.company_id=$3`,
  }
  const { rows } = await db.query(queries[args.kind], [args.id, args.canvasId, args.companyId])
  return Boolean(rows[0])
}

export async function lockReportWork(db: Queryable, args: {
  workId: string; companyId: string; agentId: string; canvasId: string
}) {
  const { rows } = await db.query<{ canvas_assignment_id: string | null; execution_role: 'specialist' | 'verifier' | 'reporter' }>(
    `SELECT canvas_assignment_id,execution_role FROM agent_work_items
      WHERE id=$1 AND company_id=$2 AND agent_id=$3 AND canvas_id=$4 FOR UPDATE`,
    [args.workId, args.companyId, args.agentId, args.canvasId],
  )
  return rows[0] ?? null
}

export async function reportIdentity(db: Queryable, companyId: string, canvasId: string, reportId: string) {
  const { rows } = await db.query<{ author_agent_id: string; assignment_id: string | null }>(
    `SELECT author_agent_id,assignment_id FROM canvas_assignment_reports
      WHERE id=$1 AND canvas_id=$2 AND company_id=$3`,
    [reportId, canvasId, companyId],
  )
  return rows[0] ?? null
}

export async function assignmentVerifierId(db: Queryable, canvasId: string, assignmentId: string, agentId: string) {
  const { rows } = await db.query<{ verifies_assignment_id: string | null }>(
    `SELECT verifies_assignment_id FROM canvas_agent_assignments
      WHERE id=$1 AND canvas_id=$2 AND agent_id=$3`,
    [assignmentId, canvasId, agentId],
  )
  return rows[0]?.verifies_assignment_id ?? null
}

export async function existingReportIds(db: Queryable, companyId: string, canvasId: string, ids: string[]) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM canvas_assignment_reports WHERE canvas_id=$1 AND company_id=$2 AND id=ANY($3::text[])`,
    [canvasId, companyId, ids],
  )
  return rows.map((row) => row.id)
}

export async function insertReport(db: Queryable, args: {
  id: string; companyId: string; canvasId: string; assignmentId: string | null; agentId: string
  executionRole: 'specialist' | 'verifier' | 'reporter'; finding: string; evidenceRefs: CanvasEvidenceRef[]
  confidence: number; unresolved: string[]; nextStep: string | null; verifiesReportId: string | null
  disconfirmingChecks: string[]; verdict: CanvasReportVerdict | null; consumedReportIds: string[]; conflictResolution: unknown[]
}) {
  const { rows } = await db.query<ReportRow>(
    `INSERT INTO canvas_assignment_reports(id,company_id,canvas_id,assignment_id,author_agent_id,execution_role,
       finding,evidence_refs,confidence,unresolved,next_step,verifies_report_id,disconfirming_checks,verdict,consumed_report_ids,conflict_resolution)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11,$12,$13::jsonb,$14,$15::jsonb,$16::jsonb)
     ON CONFLICT(id) DO UPDATE SET id=canvas_assignment_reports.id RETURNING *`,
    [args.id, args.companyId, args.canvasId, args.assignmentId, args.agentId, args.executionRole, args.finding,
      JSON.stringify(args.evidenceRefs), args.confidence, JSON.stringify(args.unresolved), args.nextStep,
      args.verifiesReportId, JSON.stringify(args.disconfirmingChecks), args.verdict,
      JSON.stringify(args.consumedReportIds), JSON.stringify(args.conflictResolution)],
  )
  return rows[0]
}

export async function workReportContext(db: Queryable, workId: string, companyId: string) {
  const { rows } = await db.query<{
    reason: string; canvas_id: string | null; canvas_assignment_id: string | null
    execution_role: 'specialist' | 'verifier' | 'reporter'
  }>(
    `SELECT reason,canvas_id,canvas_assignment_id,execution_role FROM agent_work_items WHERE id=$1 AND company_id=$2`,
    [workId, companyId],
  )
  return rows[0] ?? null
}

export async function reportExists(db: Queryable, args: { canvasId?: string; assignmentId?: string; reporter?: boolean }) {
  const result = args.canvasId
    ? await db.query(`SELECT 1 FROM canvas_assignment_reports WHERE canvas_id=$1${args.reporter ? " AND execution_role='reporter'" : ''} LIMIT 1`, [args.canvasId])
    : await db.query(`SELECT 1 FROM canvas_assignment_reports WHERE assignment_id=$1 LIMIT 1`, [args.assignmentId])
  return Boolean(result.rows[0])
}

export async function completeCanvasWorkState(db: Queryable, input: {
  workId: string; companyId: string; status: 'completed' | 'failed' | 'cancelled'; resultText?: string; error?: string
}) {
  const { rows: works } = await db.query<{
    canvas_id: string | null; canvas_assignment_id: string | null; reason: string; agent_id: string
  }>(
    `SELECT canvas_id,canvas_assignment_id,reason,agent_id FROM agent_work_items
      WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [input.workId, input.companyId],
  )
  const work = works[0]
  if (!work?.canvas_id) return { canvasId: null, completion: null, workspace: null }
  if (work.reason === 'canvas_summary') {
    if (input.status === 'completed' && !await reportExists(db, { canvasId: work.canvas_id, reporter: true })) {
      throw new Error('reporter work requires a learning_report_v1 submission before completion')
    }
    const { rows } = await db.query<{ status: CanvasWorkspaceStatus; conversation_id: string | null; title: string; goal: string }>(
      `UPDATE canvases SET status=$2,summary=$3,completed_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND status='summarizing' RETURNING status,conversation_id,title,goal`,
      [work.canvas_id, input.status === 'completed' ? 'completed' : 'failed', input.resultText ?? input.error ?? null],
    )
    return { canvasId: work.canvas_id, completion: null, workspace: rows[0] ?? null }
  }
  if (!work.canvas_assignment_id) return { canvasId: work.canvas_id, completion: null, workspace: null }
  if (input.status === 'completed' && !await reportExists(db, { assignmentId: work.canvas_assignment_id })) {
    throw new Error('canvas worker requires a learning_report_v1 submission before completion')
  }
  const assignmentStatus: CanvasAssignmentStatus = input.status === 'completed'
    ? 'completed' : input.status === 'failed' ? 'failed' : 'cancelled'
  const { rows: completed } = await db.query<{ active_frame_id: string | null }>(
    `UPDATE canvas_agent_assignments SET status=$2,result=$3,error=$4,completed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status NOT IN ('completed','failed','cancelled') RETURNING active_frame_id`,
    [work.canvas_assignment_id, assignmentStatus, input.resultText ?? null, input.error ?? null],
  )
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
    [work.canvas_id],
  )
  await db.query(
    `UPDATE agent_work_items work SET status='cancelled',cancel_requested_at=COALESCE(cancel_requested_at,NOW()),updated_at=NOW()
       FROM canvas_agent_assignments assignment
      WHERE work.canvas_assignment_id=assignment.id AND assignment.canvas_id=$1
        AND assignment.status='blocked' AND assignment.error IS NOT NULL AND work.status='blocked'`,
    [work.canvas_id],
  )
  await db.query(
    `WITH ready AS (
       SELECT child.id,child.work_id FROM canvas_agent_assignments child
        WHERE child.canvas_id=$1 AND child.status='blocked' AND child.error IS NULL
          AND NOT EXISTS (SELECT 1 FROM canvas_assignment_dependencies d
            JOIN canvas_agent_assignments parent ON parent.id=d.depends_on_assignment_id
            WHERE d.assignment_id=child.id AND parent.status <> 'completed')
     ) UPDATE canvas_agent_assignments a SET status='queued',updated_at=NOW() FROM ready WHERE a.id=ready.id`,
    [work.canvas_id],
  )
  await db.query(
    `UPDATE agent_work_items w SET status='queued',available_at=NOW(),updated_at=NOW()
      FROM canvas_agent_assignments a
      WHERE w.canvas_assignment_id=a.id AND a.canvas_id=$1 AND a.status='queued' AND w.status='blocked'`,
    [work.canvas_id],
  )
  const { rows: unfinished } = await db.query(
    `SELECT 1 FROM canvas_agent_assignments WHERE canvas_id=$1 AND
      (status IN ('queued','working','waiting') OR (status='blocked' AND error IS NULL)) LIMIT 1`,
    [work.canvas_id],
  )
  if (!unfinished[0]) {
    const { rows } = await db.query<CanvasRow>(
      `UPDATE canvases SET status='summarizing',updated_at=NOW() WHERE id=$1 AND status='active' RETURNING *`,
      [work.canvas_id],
    )
    const canvas = rows[0]
    if (canvas?.initiator_agent_id && canvas.conversation_id) {
      const summaryWorkId = `canvas-summary-${createHash('sha256').update(canvas.id).digest('hex').slice(0, 24)}`
      await db.query(
        `INSERT INTO agent_work_items
           (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,canvas_id,execution_role)
         VALUES ($1,$2,$3,$4,$5,$6,'canvas_summary','queued',200,$7,'reporter') ON CONFLICT (id) DO NOTHING`,
        [summaryWorkId, canvas.company_id, canvas.initiator_agent_id, canvas.conversation_id,
          canvas.trigger_client_msg_no, `canvas-summary:${canvas.id}`, canvas.id],
      )
    }
  }
  return {
    canvasId: work.canvas_id,
    completion: completed[0]
      ? { agentId: work.agent_id, frameId: completed[0].active_frame_id, status: assignmentStatus }
      : null,
    workspace: null,
  }
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
