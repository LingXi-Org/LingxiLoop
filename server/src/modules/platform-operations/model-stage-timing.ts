import { readModelStageTimings, readPublicTextPublicationTiming, type RunIdentity } from '@lingxi-org/lingxios'
import type { AdminModelStageCall, RunStageTiming } from '../../../../shared/model-stage-timing.js'
import type { Queryable } from '../../db/queryable.js'

const positive = (value: unknown) => { const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : undefined }
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Administrative caller must authorize this run first. Read only the product
 * ledger, rechecking its complete bound identity; no SDK-private SQL/events. */
export async function readAdminModelStageCalls(db: Queryable, identity: RunIdentity, requestVersion: number) {
  const { rows } = await db.query<{ call_id: unknown; fence: unknown; request_version: unknown; operation: unknown; status: unknown; stages: unknown; failure_kind: unknown; output_callback: unknown }>(
    `SELECT l.extras->>'callId' AS call_id,l.extras->>'fence' AS fence,l.extras->>'requestVersion' AS request_version,
      l.extras->>'operation' AS operation,l.status,l.extras->'stageTimings' AS stages,
      l.extras->'failure'->>'kind' AS failure_kind,l.extras->'failure'->>'outputCallback' AS output_callback
    FROM llm_calls l JOIN agent_run_bindings b ON b.company_id=l.company_id AND b.run_id=l.run_id
    WHERE l.company_id=$1 AND l.run_id=$2 AND b.agent_id=$3 AND b.principal_id=$4 AND b.session_id=$5
      AND b.thread_id IS NOT DISTINCT FROM $6 AND l.agent_id=b.agent_id AND l.source='agent-os'
      AND l.extras->>'requestVersion'=$7 AND l.extras ? 'stageTimings'
    ORDER BY l.created_at DESC,l.id DESC LIMIT 65`,
    [identity.tenantId, identity.runId, identity.agentId, identity.principalId ?? null, identity.sessionId, identity.threadId ?? null, String(requestVersion)])
  const selected = new Map<string, AdminModelStageCall>()
  for (const row of rows.slice(0, 64)) {
    const stages = readModelStageTimings(row.stages), fence = positive(row.fence), version = positive(row.request_version)
    if (!stages || !fence || version !== requestVersion || typeof row.call_id !== 'string' || !row.call_id || row.call_id.length > 2000
      || !['succeeded', 'failed'].includes(String(row.status))) continue
    const kind = row.failure_kind === 'output' ? 'output' as const : null
    const outputCallback = row.output_callback === 'operation' || row.output_callback === 'delta' ? row.output_callback : null
    const failureAttribution: AdminModelStageCall['failureAttribution'] = row.status === 'failed' && (kind || outputCallback) ? { kind, outputCallback } : undefined
    const key = JSON.stringify([row.call_id, fence, version])
    if (!selected.has(key)) selected.set(key, { callId: row.call_id, fence, requestVersion: version,
      operation: row.operation === 'generation' || row.operation === 'correction' ? row.operation : null,
      status: row.status as 'succeeded' | 'failed', ...(failureAttribution ? { failureAttribution } : {}), stages })
  }
  return { calls: [...selected.values()], truncated: rows.length > 64 }
}

export function runStageTiming(identity: RunIdentity, requestVersion: number,
  model: Awaited<ReturnType<typeof readAdminModelStageCalls>> | null, diagnostics: unknown): RunStageTiming {
  const diagnostic = object(diagnostics), run = object(diagnostic.run)
  const available = run.id === identity.runId && run.requestVersion === requestVersion && Array.isArray(diagnostic.publicationTimings)
  const publication = new Map<string, NonNullable<ReturnType<typeof readPublicTextPublicationTiming>>>()
  for (const raw of available ? (diagnostic.publicationTimings as unknown[]).slice(0, 64) : []) {
    const value = readPublicTextPublicationTiming(raw)
    if (!value || value.requestVersion !== requestVersion) continue
    const key = JSON.stringify([value.callId, value.fence, value.requestVersion]), previous = publication.get(key)
    if (!previous || value.revision > previous.revision) publication.set(key, value)
  }
  return { calls: model?.calls ?? [], modelCallsAvailable: model !== null, callsTruncated: model?.truncated ?? false,
    publicationTimings: [...publication.values()], publicationMeasurementsAvailable: available,
    publicationsTruncated: available && diagnostic.publicationTimingsTruncated === true,
    providerTime: 'unavailable', unattributedRunMs: null }
}
