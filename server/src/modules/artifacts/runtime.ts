import { isDeepStrictEqual } from 'node:util'
import type { RunVerificationContext, VerificationRecord, SharedStateUpdate } from '@lyyzka/lingxios'
import { productConversationId } from '../../agent-runtime/identity.js'
import { syncConversationPolicy } from '../../agent-runtime/conversations.js'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import { bindArtifactRun, artifactRunIdentity, artifactExecutionConversation, type ArtifactRunRow, type createArtifactExecution } from './execution.js'
import { observeArtifactEvidence } from './evidence.js'
import { artifactById } from './repository.js'
import type { ArtifactEvidenceRef } from './contracts.js'
import type { ArtifactKind } from './kinds.js'
import { NoEffectError, type WorkItem } from '@lyyzka/lingxios'
import { publishArtifactProgress } from './progress.js'
import { slideWorkspaceConversation } from './slides-workspace.js'

export async function assertArtifactRequestCurrent(db: Queryable, work: Pick<WorkItem, 'id' | 'tenantId'>) {
  const { rows } = await db.query<{ current: boolean }>(`SELECT
      assignment.request_client_msg_no=binding.source_client_msg_no AND assignment.status<>'cancelled'
      AND artifact.status IN ('active','summarizing','completed') AS current
    FROM agent_run_bindings binding JOIN agent_native_event_outbox event
      ON event.company_id=binding.company_id AND event.work_id=binding.source_client_msg_no AND event.event->>'type'='im.user'
        AND event.event ? 'assignmentId'
    LEFT JOIN artifact_agent_assignments assignment ON assignment.id=event.event->>'assignmentId'
    LEFT JOIN artifacts artifact ON artifact.id=assignment.artifact_id AND artifact.company_id=binding.company_id
    WHERE binding.run_id=$1 AND binding.company_id=$2`, [work.id,work.tenantId])
  if (rows.some(row => !row.current)) throw new NoEffectError('Artifact assignment was cancelled or replaced', 'forbidden')
}

export async function loadArtifactRunContext(db: Queryable, work: Omit<WorkItem, 'leaseToken'>) {
  await assertArtifactRequestCurrent(db, work)
  const pending = work.kind === 'turn' && !work.conversation?.internal && (await db.query(`SELECT 1 FROM artifact_agent_assignments assignment
    JOIN artifacts artifact ON artifact.id=assignment.artifact_id WHERE artifact.company_id=$1 AND COALESCE(artifact.execution_conversation_id,artifact.conversation_id)=$2
      AND artifact.status='active' AND assignment.agent_id=$3 AND assignment.status<>'cancelled' LIMIT 1`, [work.tenantId,productConversationId(work),work.agentId])).rows.length
  if (pending) {
    await createPermissionService(db).assertCan({ companyId: work.tenantId, actorUserId: work.principalId!,
      action: 'artifact:write', resource: { type: 'conversation', id: productConversationId(work) } })
    const assigned = await db.query<{ id: string; artifact_id: string; execution_role: 'specialist' | 'verifier' }>(`UPDATE artifact_agent_assignments assignment
      SET work_id=$1,status='working',completed_at=NULL,updated_at=NOW()
      FROM artifacts artifact WHERE artifact.id=assignment.artifact_id AND artifact.company_id=$2 AND COALESCE(artifact.execution_conversation_id,artifact.conversation_id)=$3
        AND artifact.status='active' AND assignment.agent_id=$4 AND assignment.status<>'cancelled'
        AND (assignment.work_id IS NULL OR assignment.work_id=$1 OR assignment.status IN ('completed','failed','cancelled'))
      RETURNING assignment.id,assignment.artifact_id,assignment.execution_role`, [work.id,work.tenantId,productConversationId(work),work.agentId])
    for (const assignment of assigned.rows) await bindArtifactRun(db, { work_id: work.id,company_id: work.tenantId,
      artifact_id: assignment.artifact_id,assignment_id: assignment.id,agent_id: work.agentId,principal_id: work.principalId!,
      session_id: work.sessionId,thread_id: work.threadId ?? null,request_version: 1,execution_role: assignment.execution_role })
  }
  const { rows } = await db.query<ArtifactRunRow & { assignment: string | null; kind: ArtifactKind }>(`SELECT run.*,assignment.assignment,artifact.kind
    FROM artifact_agent_runs run JOIN artifacts artifact ON artifact.id=run.artifact_id AND artifact.company_id=run.company_id
    LEFT JOIN artifact_agent_assignments assignment ON assignment.id=run.assignment_id AND assignment.work_id=run.work_id
    WHERE run.work_id=$1 AND run.company_id=$2 AND run.agent_id=$3 AND run.principal_id=$4
      AND run.session_id=$5 AND run.thread_id IS NOT DISTINCT FROM $6 AND artifact.status IN ('active','summarizing')
      AND assignment.work_id=run.work_id AND assignment.status NOT IN ('completed','failed','cancelled')`,
    [work.id,work.tenantId,work.agentId,work.principalId,work.sessionId,work.threadId ?? null])
  return rows[0] ?? null
}

type Control = Parameters<typeof createArtifactExecution>[0]
export function createArtifactRuntime(control: Control) {
  async function collaborationScope(db: Queryable, companyId: string, userId: string, artifactId: string, write = false) {
    await createPermissionService(db).assertCan({ companyId,actorUserId: userId,action: write ? 'artifact:write' : 'artifact:read',resource: { type: 'artifact',id: artifactId } })
    const artifact = await artifactById(db,companyId,artifactId)
    if (!artifact) throw new NoEffectError('artifact not found','not_found')
    const conversationId = artifactExecutionConversation(artifact) ?? (artifact.kind === 'slides' ? await slideWorkspaceConversation(db, artifact.id, null) : null)
    if (!conversationId) throw new NoEffectError('artifact has no execution conversation','not_found')
    const runtime = await control()
    await syncConversationPolicy(runtime,companyId,conversationId)
    return { runtime,scope: { tenantId: companyId,conversationId,principalId: userId,stateId: artifact.id,
      ...(artifact.shared_state_thread_key ? { threadId: artifact.shared_state_thread_key } : {}) } }
  }
  async function readCollaboration(db: Queryable, companyId: string, userId: string, artifactId: string, afterSeq = 0) {
    const { runtime,scope } = await collaborationScope(db,companyId,userId,artifactId)
    const state = await runtime.sharedState.read(scope)
    return { state,history: state ? await runtime.sharedState.history(scope,afterSeq) : { items: [],nextSeq: 0 } }
  }
  async function updateSharedState(db: Queryable, companyId: string, userId: string, artifactId: string, update: SharedStateUpdate) {
    const { runtime,scope } = await collaborationScope(db,companyId,userId,artifactId,true)
    if (!await runtime.sharedState.read(scope)) await runtime.sharedState.create(scope)
    return runtime.sharedState.apply(scope,update)
  }
  async function verify(context: RunVerificationContext): Promise<VerificationRecord[]> {
    const db = context.database as Queryable, { work } = context
    const { rows } = await db.query<ArtifactRunRow>('SELECT * FROM artifact_agent_runs WHERE work_id=$1 AND company_id=$2 AND agent_id=$3 AND principal_id=$4',
      [work.id,work.tenantId,work.agentId,work.principalId])
    const records: VerificationRecord[] = []
    for (const binding of rows) {
      const artifact = await artifactById(db, work.tenantId, binding.artifact_id)
      const conversationId = artifact && artifactExecutionConversation(artifact)
      if (!artifact?.project_id || !conversationId) throw new Error('Artifact scope no longer exists')
      await createPermissionService(db).assertCan({ companyId: work.tenantId, actorUserId: work.principalId!,
        action: 'conversation:read', resource: { type: 'conversation', id: conversationId } })
      const gaps: string[] = []
      const report = (await db.query<{ id: string; source_evidence_ids: string[]; consumed_report_ids: string[] }>(
        'SELECT id,source_evidence_ids,consumed_report_ids FROM artifact_assignment_reports WHERE work_id=$1 AND request_version=$2 AND artifact_id=$3 ORDER BY created_at DESC,id DESC LIMIT 1',
        [work.id,context.requestVersion,artifact.id])).rows[0]
      if (artifact.status !== 'stopped' && !report) gaps.push('Current request requires a persisted Artifact report')
      if (report) {
        const sources = await db.query<{ id: string; data: { sourceKind: ArtifactEvidenceRef['kind']; sourceId: string; observation: string } }>(
          'SELECT id,data FROM evidence_records WHERE company_id=$1 AND project_id=$2 AND id=ANY($3::text[])',
          [work.tenantId,artifact.project_id,report.source_evidence_ids])
        if (sources.rows.length !== new Set(report.source_evidence_ids).size) gaps.push('Report source evidence is missing')
        for (const source of sources.rows) {
          const observed = await observeArtifactEvidence(db, { companyId: work.tenantId, projectId: artifact.project_id, artifactId: artifact.id,
            conversationId, principalId: work.principalId!, signal: context.signal }, { kind: source.data.sourceKind, id: source.data.sourceId })
          if (!isDeepStrictEqual(observed, JSON.parse(source.data.observation) as unknown)) gaps.push(`Evidence changed: ${source.data.sourceKind}:${source.data.sourceId}`)
        }
      }
      records.push({ checker: `product:artifact:${artifact.id}`, status: gaps.length ? 'failed' : 'passed', evidence: {
        resource: `artifact:${artifact.id}`, reportId: report?.id ?? null, requestVersion: context.requestVersion, gaps } })
    }
    return records
  }

  /** Bounded projection from public run snapshots; runtime tables are never a product repository. */
  async function reconcile(db: Queryable, complete: (input: {
    workId: string; companyId: string; status: 'completed' | 'failed' | 'cancelled'; resultText?: string; error?: string
  }) => Promise<void>, signal: AbortSignal) {
    const { rows } = await db.query<ArtifactRunRow>(`SELECT run.* FROM artifact_agent_runs run JOIN artifacts artifact ON artifact.id=run.artifact_id
      LEFT JOIN artifact_agent_assignments assignment ON assignment.id=run.assignment_id
      WHERE artifact.status IN ('active','summarizing') AND assignment.work_id=run.work_id AND assignment.status NOT IN ('completed','failed','cancelled')
      ORDER BY artifact.updated_at,run.work_id LIMIT 64`)
    for (const binding of rows) {
      signal.throwIfAborted()
      const api = await control(), identity = artifactRunIdentity(binding), run = await api.readRun(identity)
      if (!run) continue
      if (['queued','leased','waiting'].includes(run.status)) {
        if (binding.assignment_id) await db.query(`UPDATE artifact_agent_assignments SET status=$3,started_at=CASE WHEN $3='working' THEN COALESCE(started_at,NOW()) ELSE started_at END,
          updated_at=NOW() WHERE id=$1 AND work_id=$2 AND status<>$3`,
          [binding.assignment_id,binding.work_id,run.status === 'leased' ? 'working' : run.status === 'waiting' ? 'waiting' : 'queued'])
        await publishArtifactProgress(db,binding.company_id,binding.artifact_id)
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
