import type { RunIdentity } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import { auditInTransaction } from '../modules/identity/public.js'
import { contextFailureDiagnosticSchema, type ContextFailureDiagnostic } from './context-diagnostics.js'

const kind = 'agent_runtime.context_failed'

/** The control-plane logger supplies only its validated metadata projection.
 * Resolve tenancy from the product binding, never from exception fields. A
 * failure before that binding exists remains platform-only and unscoped. */
export async function recordContextFailure(db: Queryable, input: ContextFailureDiagnostic): Promise<void> {
  const diagnostic = contextFailureDiagnosticSchema.parse(input)
  const binding = (await db.query<{ company_id: string; principal_id: string }>(
    'SELECT company_id,principal_id FROM agent_run_bindings WHERE run_id=$1 LIMIT 1', [diagnostic.runId],
  )).rows[0]
  await auditInTransaction(db, { kind, companyId: binding?.company_id ?? null, userId: binding?.principal_id ?? null,
    detail: diagnostic })
}

/** Platform-admin callers must obtain identity from the formal runtime first.
 * No student/company-admin surface exposes these records. */
export async function readContextFailures(db: Queryable, identity: RunIdentity) {
  const { rows } = await db.query<{ id: string; created_at: Date | string; detail: unknown }>(
    `SELECT event.id::text,event.created_at,event.detail FROM audit_events event
      WHERE event.kind=$1 AND event.detail->>'runId'=$2
        AND (event.company_id IS NULL OR event.company_id=$3)
        AND (event.user_id IS NULL OR event.user_id=$4)
        AND NOT EXISTS (SELECT 1 FROM agent_run_bindings binding WHERE binding.run_id=$2
          AND (binding.company_id<>$3 OR binding.principal_id<>$4 OR binding.agent_id<>$5
            OR binding.session_id<>$6 OR binding.thread_id IS DISTINCT FROM $7::text))
      ORDER BY event.created_at DESC,event.id DESC LIMIT 20`,
    [kind, identity.runId, identity.tenantId, identity.principalId, identity.agentId, identity.sessionId, identity.threadId ?? null],
  )
  return rows.flatMap(row => {
    const diagnostic = contextFailureDiagnosticSchema.safeParse(row.detail)
    return diagnostic.success ? [{ id: row.id, createdAt: new Date(row.created_at).toISOString(), ...diagnostic.data }] : []
  })
}
