import type { RunIdentity } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import type { PublicLlmTrace } from './run-trace.js'
import { readModelOperation } from '../../../src/lib/runTrace.js'

/** No native private tables, prompts, errors, arguments, reasoning or raw extras.
 * The caller authorizes current conversation access; the join rechecks ownership. */
export async function readPublicLlmTrace(identity: RunIdentity,db: Queryable): Promise<PublicLlmTrace[]> {
  const { rows } = await db.query<{ id: string; call_id: string|null; purpose: string; operation: string|null; api_kind: string|null; model: string; status: string; latency_ms: number; measured: boolean;
    started_at: string|null; completed_at: string|null; input_tokens: number; output_tokens: number; cost_usd: string; cost_estimated: boolean; priced: boolean }>(`SELECT l.id,l.model,l.purpose,l.status,l.latency_ms,l.measured,l.input_tokens,l.output_tokens,l.cost_usd,l.cost_estimated,
      l.extras->>'callId' AS call_id,l.extras->>'apiKind' AS api_kind,l.extras->>'operation' AS operation,
      l.extras->>'startedAt' AS started_at,l.extras->>'completedAt' AS completed_at,
      ((l.extras->>'providerPricing' IS NOT NULL AND l.extras->'providerPricing'->>'currency'='CNY'
        AND l.extras ? 'costUsd' AND l.extras->>'costUsd' ~ '^[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$'
        AND l.extras->'providerPricing'->>'usdCny' ~ '^[0-9]+(\\.[0-9]+)?$'
        AND (l.extras->'providerPricing'->>'usdCny')::numeric > 0)
      OR (l.purpose <> 'lingxios.embedding' AND l.extras->>'costMeasurement'='measured' AND (
        COALESCE(l.extras->'pricing'->>'inputMicrosPerMillion','0') ~ '^[0-9]+$' AND
        COALESCE(l.extras->'pricing'->>'outputMicrosPerMillion','0') ~ '^[0-9]+$' AND
        (COALESCE(l.extras->'pricing'->>'inputMicrosPerMillion','0') <> '0' OR
         COALESCE(l.extras->'pricing'->>'outputMicrosPerMillion','0') <> '0')))) AS priced
    FROM llm_calls l JOIN agent_run_bindings b ON b.company_id=l.company_id AND b.run_id=l.run_id
    WHERE l.company_id=$1 AND l.run_id=$2 AND b.agent_id=$3 AND b.principal_id=$4 AND b.session_id=$5 AND NOT b.internal
      AND l.agent_id=b.agent_id AND l.source='agent-os'
    ORDER BY l.created_at DESC,l.id DESC LIMIT 101`,[identity.tenantId,identity.runId,identity.agentId,identity.principalId,identity.sessionId])
  const metric = (value: unknown) => { const result = Number(value); return value !== null && value !== undefined && Number.isFinite(result) && result >= 0 ? result : null }
  return rows.reverse().map(row => {
    const startedAt = metric(row.started_at),finished = metric(row.completed_at),operation = readModelOperation(row.operation)
    return { id: row.id,model: row.model,...(row.call_id ? { callId: row.call_id } : {}),
      ...(operation ? { operation } : {}),
      apiKind: row.api_kind === 'embedding' || row.purpose === 'lingxios.embedding' || row.purpose === 'knowledge-embedding' ? 'embedding' as const : 'chat' as const,
      status: row.status === 'succeeded' ? 'complete' as const : 'error' as const,
      startedAt,completedAt: finished !== null && (startedAt === null || finished >= startedAt) ? finished : null,
      durationMs: metric(row.latency_ms),tokensIn: row.measured ? metric(row.input_tokens) : null,tokensOut: row.measured ? metric(row.output_tokens) : null,
      cost: row.measured && row.priced ? metric(row.cost_usd) : null,costEstimated: !!(row.measured && row.priced && row.cost_estimated) }
  })
}
