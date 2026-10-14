import type { Queryable } from '../../db/queryable.js'
import type { CanvasAssignmentStatus, CanvasEvidenceRef, CanvasReportVerdict, CanvasWorkspaceStatus } from './contracts.js'
import type { ReportRow } from './repository-types.js'

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
         WHERE canvas.id=$1 AND canvas.company_id=$2 AND document.project_id=canvas.project_id
           AND (document.conversation_id IS NULL OR document.conversation_id=canvas.conversation_id)
       UNION ALL SELECT 'source',source.id FROM knowledge_sources source
         JOIN canvases canvas ON canvas.project_id=source.project_id
         WHERE canvas.id=$1 AND source.company_id=$2 AND source.deleted_at IS NULL
       UNION ALL SELECT 'attempt',attempt.id FROM course_forum_submissions attempt
         JOIN canvases canvas
           ON canvas.id=$1 AND canvas.company_id=$2 AND canvas.project_id=attempt.project_id
         WHERE attempt.company_id=$2
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
  const { rows } = await db.query<{
    canvas_assignment_id: string | null
    execution_role: 'specialist' | 'verifier' | 'reporter'
    project_id: string | null
    principal_id: string; session_id: string; conversation_id: string; request_version: number
  }>(
    `SELECT work.assignment_id AS canvas_assignment_id,work.execution_role,canvas.project_id,
       work.principal_id,work.session_id,canvas.conversation_id,work.request_version
       FROM canvas_agent_runs work JOIN canvases canvas ON canvas.id=work.canvas_id AND canvas.company_id=work.company_id
       LEFT JOIN canvas_agent_assignments assignment ON assignment.id=work.assignment_id
      WHERE work.work_id=$1 AND work.company_id=$2 AND work.agent_id=$3 AND work.canvas_id=$4
        AND assignment.work_id=work.work_id FOR UPDATE OF work,canvas`,
    [args.workId, args.companyId, args.agentId, args.canvasId],
  )
  return rows[0] ?? null
}

export async function reportIdentity(db: Queryable, companyId: string, canvasId: string, reportId: string) {
  const { rows } = await db.query<{ author_agent_id: string; assignment_id: string | null; execution_role: string }>(
    `SELECT report.author_agent_id,report.assignment_id,report.execution_role FROM canvas_assignment_reports report
      JOIN canvas_agent_assignments assignment ON assignment.id=report.assignment_id AND assignment.work_id=report.work_id
      JOIN canvas_agent_runs run ON run.work_id=report.work_id AND run.canvas_id=report.canvas_id AND run.request_version=report.request_version
      WHERE report.id=$1 AND report.canvas_id=$2 AND report.company_id=$3`,
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


export async function insertReport(db: Queryable, args: {
  id: string; companyId: string; canvasId: string; assignmentId: string | null; agentId: string
  executionRole: 'specialist' | 'verifier' | 'reporter'; finding: string; evidenceId: string
  sourceEvidenceIds: string[]
  confidence: number; unresolved: string[]; nextStep: string | null; verifiesReportId: string | null
  disconfirmingChecks: string[]; verdict: CanvasReportVerdict | null; consumedReportIds: string[]; conflictResolution: unknown[]
  workId: string; requestVersion: number
}) {
  if (args.assignmentId) await db.query('UPDATE canvas_assignment_reports SET assignment_id=NULL WHERE assignment_id=$1 AND id<>$2', [args.assignmentId,args.id])
  const { rows } = await db.query<ReportRow>(
    `INSERT INTO canvas_assignment_reports(id,company_id,canvas_id,assignment_id,author_agent_id,execution_role,
       finding,evidence_id,source_evidence_ids,confidence,unresolved,next_step,verifies_report_id,disconfirming_checks,verdict,consumed_report_ids,conflict_resolution,work_id,request_version)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13,$14::jsonb,$15,$16::jsonb,$17::jsonb,$18,$19)
     ON CONFLICT(id) DO UPDATE SET id=canvas_assignment_reports.id RETURNING *`,
    [args.id, args.companyId, args.canvasId, args.assignmentId, args.agentId, args.executionRole, args.finding,
      args.evidenceId, JSON.stringify(args.sourceEvidenceIds), args.confidence, JSON.stringify(args.unresolved), args.nextStep,
      args.verifiesReportId, JSON.stringify(args.disconfirmingChecks), args.verdict,
      JSON.stringify(args.consumedReportIds), JSON.stringify(args.conflictResolution), args.workId, args.requestVersion],
  )
  return rows[0]
}



export async function completeCanvasWorkState(db: Queryable, input: {
  workId: string; companyId: string; status: 'completed' | 'failed' | 'cancelled'; resultText?: string; error?: string
}): Promise<{ canvasId: string | null; completion: { agentId: string; frameId: string | null; status: CanvasAssignmentStatus } | null;
  workspace: { status: CanvasWorkspaceStatus; conversation_id: string | null; title: string; goal: string } | null }> {
  const { rows } = await db.query<{ canvas_id: string; assignment_id: string | null; agent_id: string; execution_role: string }>(
    `SELECT run.* FROM canvas_agent_runs run LEFT JOIN canvas_agent_assignments assignment ON assignment.id=run.assignment_id
      WHERE run.work_id=$1 AND run.company_id=$2 AND assignment.work_id=run.work_id`,
    [input.workId,input.companyId])
  const run = rows[0]
  if (!run) return { canvasId: null, completion: null, workspace: null }
  const { rows: completed } = await db.query<{ active_frame_id: string | null }>(
    `UPDATE canvas_agent_assignments SET status=$2,result=$3,error=$4,completed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND work_id=$5 AND status NOT IN ('completed','failed','cancelled') RETURNING active_frame_id`,
    [run.assignment_id,input.status,input.resultText ?? null,input.error ?? null,input.workId])
  // Completion follows current specialist evidence and independent verification; it never schedules a summary.
  const { rows: workspace } = await db.query<{ status: CanvasWorkspaceStatus; conversation_id: string | null; title: string; goal: string }>(
    `UPDATE canvases canvas SET status='completed',completed_at=NOW(),updated_at=NOW()
      WHERE canvas.id=$1 AND canvas.status='active'
        AND EXISTS(SELECT 1 FROM canvas_agent_assignments WHERE canvas_id=canvas.id)
        AND NOT EXISTS(SELECT 1 FROM canvas_agent_assignments WHERE canvas_id=canvas.id AND status<>'completed')
        AND NOT EXISTS(SELECT 1 FROM canvas_agent_assignments builder WHERE builder.canvas_id=canvas.id AND builder.execution_role='specialist'
          AND NOT EXISTS(SELECT 1 FROM canvas_assignment_reports source
            JOIN canvas_assignment_reports review ON review.verifies_report_id=source.id AND review.verdict='supported'
            JOIN canvas_agent_assignments verifier ON verifier.id=review.assignment_id AND verifier.work_id=review.work_id
            JOIN canvas_agent_runs verified_run ON verified_run.work_id=review.work_id AND verified_run.canvas_id=canvas.id AND verified_run.request_version=review.request_version
            JOIN canvas_agent_runs source_run ON source_run.work_id=source.work_id AND source_run.canvas_id=canvas.id AND source_run.request_version=source.request_version
            WHERE source.assignment_id=builder.id AND source.work_id=builder.work_id
              AND verifier.verifies_assignment_id=builder.id AND review.author_agent_id<>source.author_agent_id))
      RETURNING status,conversation_id,title,goal`, [run.canvas_id])
  return { canvasId: run.canvas_id, workspace: workspace[0] ?? null, completion: completed[0]
    ? { agentId: run.agent_id, frameId: completed[0].active_frame_id, status: input.status as CanvasAssignmentStatus } : null }
}
