import type { Queryable } from '../../db/queryable.js'
import type { CanvasActorKind, CanvasWorkspaceStatus } from './contracts.js'
import type { ActivityRow, AssignmentRow, CanvasRow, CommentRow, FrameRow, PresenceRow, ReportRow } from './repository-types.js'

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
    `INSERT INTO canvases (id,company_id,conversation_id,title,goal,created_by,authorization_user_id,origin)
     SELECT $1,c.company_id,c.id,c.title || ' Canvas',COALESCE(c.topic,''),$4,$4,'conversation'
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
