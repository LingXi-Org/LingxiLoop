import type { RunIdentity } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import type { PublicLlmTrace } from './run-trace.js'

/** No native private tables, prompts, errors, arguments, reasoning or raw extras.
 * The caller authorizes current conversation access; the join rechecks ownership. */
export async function readPublicLlmTrace(identity: RunIdentity,db: Queryable): Promise<PublicLlmTrace[]> {
  const { rows } = await db.query<{ id: string; model: string; status: string; latency_ms: number; measured: boolean;
    input_tokens: number; output_tokens: number; cost_usd: string; cost_estimated: boolean; priced: boolean }>(`SELECT l.id,l.model,l.status,l.latency_ms,l.measured,l.input_tokens,l.output_tokens,l.cost_usd,l.cost_estimated,
      (l.extras->>'costMeasurement'='measured' AND (
        COALESCE(l.extras->'pricing'->>'inputMicrosPerMillion','0') ~ '^[0-9]+$' AND
        COALESCE(l.extras->'pricing'->>'outputMicrosPerMillion','0') ~ '^[0-9]+$' AND
        (COALESCE(l.extras->'pricing'->>'inputMicrosPerMillion','0') <> '0' OR
         COALESCE(l.extras->'pricing'->>'outputMicrosPerMillion','0') <> '0'))) AS priced
    FROM llm_calls l JOIN agent_run_bindings b ON b.company_id=l.company_id AND b.run_id=l.run_id
    WHERE l.company_id=$1 AND l.run_id=$2 AND b.agent_id=$3 AND b.principal_id=$4 AND b.session_id=$5 AND NOT b.internal
      AND l.agent_id=b.agent_id AND l.source='agent-os'
    ORDER BY l.created_at DESC,l.id DESC LIMIT 101`,[identity.tenantId,identity.runId,identity.agentId,identity.principalId,identity.sessionId])
  const metric = (value: unknown) => { const result = Number(value); return value !== null && value !== undefined && Number.isFinite(result) && result >= 0 ? result : null }
  return rows.reverse().map(row => ({ id: row.id,model: row.model,status: row.status === 'succeeded' ? 'complete' : 'error',
    durationMs: metric(row.latency_ms),tokensIn: row.measured ? metric(row.input_tokens) : null,tokensOut: row.measured ? metric(row.output_tokens) : null,
    cost: row.measured && row.priced ? metric(row.cost_usd) : null,costEstimated: row.measured && row.priced && row.cost_estimated }))
}
