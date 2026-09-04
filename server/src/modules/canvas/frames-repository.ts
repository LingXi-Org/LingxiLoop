import type { Queryable } from '../../db/queryable.js'
import type { CanvasFrameType } from './contracts.js'
import type { FrameRow } from './repository-types.js'

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

