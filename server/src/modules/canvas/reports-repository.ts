import { createHash } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { CanvasAssignmentStatus, CanvasEvidenceRef, CanvasReportVerdict, CanvasWorkspaceStatus } from './contracts.js'
import type { CanvasRow, ReportRow } from './repository-types.js'

export async function missingEvidenceRefs(db: Queryable, args: {
  companyId: string; canvasId: string; refs: CanvasEvidenceRef[]
}): Promise<CanvasEvidenceRef[]> {
  if (args.refs.length === 0) return []
  const { rows } = await db.query<{ kind: CanvasEvidenceRef['kind']; id: string }>(
    `WITH requested(kind,id) AS (
       SELECT kind::text,id::text FROM jsonb_to_recordset($3::jsonb) AS ref(kind text,id text)
     ), available(kind,id) AS (
       SELECT 'frame',frame.id FROM canvas_frames frame WHERE frame.canvas_id=$1
       UNION ALL SELECT 'report',report.id FROM canvas_assignment_reports report
         WHERE report.canvas_id=$1 AND report.company_id=$2
       UNION ALL SELECT 'document',document.id FROM documents document
         JOIN canvases canvas ON canvas.company_id=document.company_id
         WHERE canvas.id=$1 AND canvas.company_id=$2
           AND (document.conversation_id IS NULL OR document.conversation_id=canvas.conversation_id)
       UNION ALL SELECT 'source',source.id FROM knowledge_sources source
         JOIN canvases canvas ON canvas.project_id=source.project_id
         WHERE canvas.id=$1 AND source.company_id=$2 AND source.deleted_at IS NULL
       UNION ALL SELECT 'attempt',attempt.id FROM learning_attempts attempt
         JOIN courses course ON course.id=attempt.course_id AND course.company_id=attempt.company_id
         JOIN canvases canvas ON canvas.project_id=course.project_id AND canvas.company_id=course.company_id
         WHERE canvas.id=$1 AND course.company_id=$2
     )
     SELECT requested.kind,requested.id FROM requested
     LEFT JOIN available USING(kind,id)
     WHERE requested.kind <> 'message' AND available.id IS NULL`,
    [args.canvasId, args.companyId, JSON.stringify(args.refs)],
  )
  return rows
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
