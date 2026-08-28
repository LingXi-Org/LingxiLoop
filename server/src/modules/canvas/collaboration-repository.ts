import type { Queryable } from '../../db/queryable.js'
import type { CanvasActorKind, CanvasAssignmentStatus } from './contracts.js'
import type { CommentRow, PresenceRow } from './repository-types.js'

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
