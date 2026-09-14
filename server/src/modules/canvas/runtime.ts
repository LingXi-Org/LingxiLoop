import { isDeepStrictEqual } from 'node:util'
import { readRunReference, type RunVerificationContext, type VerificationRecord, type SharedStateUpdate } from '@lyyzka/lingxios'
import { syncConversationPolicy } from '../../agent-runtime/conversations.js'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { canvasRunIdentity, type CanvasRunRow, type createCanvasExecution } from './execution.js'
import { observeCanvasEvidence } from './evidence.js'
import { canvasById } from './repository.js'
import type { CanvasEvidenceRef } from './contracts.js'
import { NoEffectError, type WorkItem } from '@lyyzka/lingxios'

export async function loadCanvasRunContext(db: Queryable, work: Omit<WorkItem, 'leaseToken'>) {
  const { rows } = await db.query<CanvasRunRow & { assignment: string | null }>(`SELECT run.*,assignment.assignment
    FROM canvas_agent_runs run JOIN canvases canvas ON canvas.id=run.canvas_id AND canvas.company_id=run.company_id
    LEFT JOIN canvas_agent_assignments assignment ON assignment.id=run.assignment_id AND assignment.work_id=run.work_id
    WHERE run.work_id=$1 AND run.company_id=$2 AND run.agent_id=$3 AND run.principal_id=$4
      AND run.session_id=$5 AND run.thread_id IS NOT DISTINCT FROM $6 AND canvas.status IN ('active','summarizing')
      AND (run.execution_role='reporter' OR assignment.status NOT IN ('completed','failed','cancelled'))`,
    [work.id,work.tenantId,work.agentId,work.principalId,work.sessionId,work.threadId ?? null])
  if (['canvas_worker','canvas_summary'].includes(work.kind) && rows.length !== 1) throw new NoEffectError('Canvas execution was replaced or stopped', 'forbidden')
  return rows[0] ?? null
}

type Control = Parameters<typeof createCanvasExecution>[0]
export function createCanvasRuntime(control: Control) {
  async function collaborationScope(db: Queryable, companyId: string, userId: string, canvasId: string, write = false) {
    await createPermissionService(db).assertCan({ companyId,actorUserId: userId,action: write ? 'canvas:write' : 'canvas:read',resource: { type: 'canvas',id: canvasId } })
    const canvas = await canvasById(db,companyId,canvasId)
    if (!canvas?.conversation_id) throw new NoEffectError('canvas not found','not_found')
    const runtime = await control()
    await syncConversationPolicy(runtime,companyId,canvas.conversation_id)
    return { runtime,scope: { tenantId: companyId,conversationId: canvas.conversation_id,principalId: userId,stateId: canvas.id,
      ...(canvas.shared_state_thread_key ? { threadId: canvas.shared_state_thread_key } : {}) } }
  }
  async function readCollaboration(db: Queryable, companyId: string, userId: string, canvasId: string, afterSeq = 0) {
    const { runtime,scope } = await collaborationScope(db,companyId,userId,canvasId)
    const bindings = await db.query<{ graph_id: string; parent_work_id: string }>(`SELECT DISTINCT graph_id,parent_work_id FROM canvas_agent_runs
      WHERE company_id=$1 AND canvas_id=$2 AND principal_id=$3 AND graph_id IS NOT NULL LIMIT 32`, [companyId,canvasId,userId])
    const graphs = []
    for (const binding of bindings.rows) {
      const parent = await readRunReference(db,companyId,binding.parent_work_id)
      if (parent?.principalId === userId) graphs.push(await runtime.graphs.read(parent,binding.graph_id))
    }
    const state = await runtime.sharedState.read(scope)
    return { graphs: graphs.filter(Boolean),state,history: state ? await runtime.sharedState.history(scope,afterSeq) : { items: [],nextSeq: 0 } }
  }
  async function updateSharedState(db: Queryable, companyId: string, userId: string, canvasId: string, update: SharedStateUpdate) {
    const { runtime,scope } = await collaborationScope(db,companyId,userId,canvasId,true)
    if (!await runtime.sharedState.read(scope)) await runtime.sharedState.create(scope)
    return runtime.sharedState.apply(scope,update)
  }
  async function verify(context: RunVerificationContext): Promise<VerificationRecord[]> {
    const db = context.database as Queryable, { work } = context
    const { rows } = await db.query<CanvasRunRow>('SELECT * FROM canvas_agent_runs WHERE work_id=$1 AND company_id=$2 AND agent_id=$3 AND principal_id=$4',
      [work.id,work.tenantId,work.agentId,work.principalId])
    const records: VerificationRecord[] = []
    for (const binding of rows) {
      const canvas = await canvasById(db, work.tenantId, binding.canvas_id)
      if (!canvas?.project_id || !canvas.conversation_id) throw new Error('Canvas scope no longer exists')
      await createPermissionService(db).assertCan({ companyId: work.tenantId, actorUserId: work.principalId!,
        action: 'conversation:read', resource: { type: 'conversation', id: canvas.conversation_id } })
      const gaps: string[] = []
      const report = (await db.query<{ id: string; source_evidence_ids: string[]; consumed_report_ids: string[] }>(
        'SELECT id,source_evidence_ids,consumed_report_ids FROM canvas_assignment_reports WHERE work_id=$1 AND request_version=$2 AND canvas_id=$3 ORDER BY created_at DESC,id DESC LIMIT 1',
        [work.id,context.requestVersion,canvas.id])).rows[0]
      if (canvas.status !== 'stopped' && !report) gaps.push('Current request requires a persisted Canvas report')
      if (report) {
        const sources = await db.query<{ id: string; data: { sourceKind: CanvasEvidenceRef['kind']; sourceId: string; observation: string } }>(
          'SELECT id,data FROM evidence_records WHERE company_id=$1 AND project_id=$2 AND id=ANY($3::text[])',
          [work.tenantId,canvas.project_id,report.source_evidence_ids])
        if (sources.rows.length !== new Set(report.source_evidence_ids).size) gaps.push('Report source evidence is missing')
        for (const source of sources.rows) {
          const observed = await observeCanvasEvidence(db, { companyId: work.tenantId, projectId: canvas.project_id, canvasId: canvas.id,
            conversationId: canvas.conversation_id, principalId: work.principalId!, signal: context.signal }, { kind: source.data.sourceKind, id: source.data.sourceId })
          if (!isDeepStrictEqual(observed, JSON.parse(source.data.observation) as unknown)) gaps.push(`Evidence changed: ${source.data.sourceKind}:${source.data.sourceId}`)
        }
      }
      if (binding.execution_role === 'reporter' && canvas.status !== 'stopped') {
        const assignments = await db.query<CanvasRunRow & { report_id: string | null; verdict: string | null }>(`SELECT run.*,report.id AS report_id,report.verdict
          FROM canvas_agent_assignments assignment JOIN canvas_agent_runs run ON run.work_id=assignment.work_id AND run.canvas_id=assignment.canvas_id
          LEFT JOIN canvas_assignment_reports report ON report.assignment_id=assignment.id AND report.work_id=run.work_id AND report.request_version=run.request_version
          WHERE assignment.canvas_id=$1`, [canvas.id])
        for (const assignment of assignments.rows) {
          const run = await (await control()).readRun(canvasRunIdentity(assignment), db)
          if (run?.status !== 'succeeded') gaps.push(`Assignment ${assignment.agent_id}: ${run?.status ?? 'missing'}`)
          if (!assignment.report_id || !report?.consumed_report_ids.includes(assignment.report_id)) gaps.push(`Current report not consumed: ${assignment.agent_id}`)
          if (assignment.verdict && assignment.verdict !== 'supported') gaps.push(`Verifier ${assignment.agent_id}: ${assignment.verdict}`)
        }
      }
      records.push({ checker: `product:canvas:${canvas.id}`, status: gaps.length ? 'failed' : 'passed', evidence: {
        resource: `canvas:${canvas.id}`, reportId: report?.id ?? null, requestVersion: context.requestVersion, gaps } })
    }
    return records
  }

  /** Bounded projection from public run snapshots; runtime tables are never a product repository. */
  async function reconcile(db: Queryable, complete: (input: {
    workId: string; companyId: string; status: 'completed' | 'failed' | 'cancelled'; resultText?: string; error?: string
  }) => Promise<void>, signal: AbortSignal) {
    const { rows } = await db.query<CanvasRunRow>(`SELECT run.* FROM canvas_agent_runs run JOIN canvases canvas ON canvas.id=run.canvas_id
      LEFT JOIN canvas_agent_assignments assignment ON assignment.id=run.assignment_id
      WHERE canvas.status IN ('active','summarizing') AND (run.execution_role='reporter' OR
        (assignment.work_id=run.work_id AND assignment.status NOT IN ('completed','failed','cancelled')))
      ORDER BY canvas.updated_at,run.work_id LIMIT 64`)
    for (const binding of rows) {
      signal.throwIfAborted()
      const api = await control(), identity = canvasRunIdentity(binding), run = await api.readRun(identity)
      if (!run) continue
      if (['queued','leased','waiting'].includes(run.status)) {
        if (binding.assignment_id) await db.query(`UPDATE canvas_agent_assignments SET status=$3,started_at=CASE WHEN $3='working' THEN COALESCE(started_at,NOW()) ELSE started_at END,
          updated_at=NOW() WHERE id=$1 AND work_id=$2 AND status<>$3`,
          [binding.assignment_id,binding.work_id,run.status === 'leased' ? 'working' : run.status === 'waiting' ? 'waiting' : 'queued'])
        continue
      }
      const message = await api.readMessage(identity)
      await complete({ companyId: binding.company_id, workId: binding.work_id,
        status: run.status === 'succeeded' ? 'completed' : run.status === 'cancelled' ? 'cancelled' : 'failed',
        ...(message ? { resultText: message.body } : {}), ...(run.error ? { error: run.error } : {}) })
    }
  }
  return { verify, reconcile, readCollaboration, updateSharedState }
}
