import { NoEffectError, readRunReference, type RunIdentity, type WorkItem } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'

/** Product jobs explicitly bind their room; native IM and delegates carry WorkConversation. */
export function productConversationId(work: Pick<WorkItem, 'conversation' | 'meta'>): string {
  const id = work.conversation?.conversationId ?? work.meta?.conversationId
  if (typeof id !== 'string' || !id) throw new NoEffectError('product conversation is missing', 'forbidden')
  return id
}

export async function assertFrozenAudience(db: Queryable, work: Pick<WorkItem, 'tenantId' | 'conversation'>) {
  if (!work.conversation) return
  const row = (await db.query<{ members: string[] }>(`SELECT profile->'members' AS members FROM im_channel_bindings
    WHERE company_id=$1 AND channel_id=$2 FOR SHARE`, [work.tenantId,work.conversation.conversationId])).rows[0]
  if (!Array.isArray(row?.members) || JSON.stringify([...row.members].sort()) !== JSON.stringify([...work.conversation.audience.participantIds].sort())) {
    throw new NoEffectError('frozen audience differs from the current channel recipients','forbidden')
  }
}

export async function bindProductRun(db: Queryable, identity: RunIdentity, conversationId: string, internal = false) {
  const result = await db.query(`INSERT INTO agent_run_bindings
    (run_id,company_id,conversation_id,session_id,agent_id,principal_id,thread_id,internal)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(run_id) DO UPDATE SET run_id=EXCLUDED.run_id
    WHERE agent_run_bindings.company_id=EXCLUDED.company_id AND agent_run_bindings.conversation_id=EXCLUDED.conversation_id
      AND agent_run_bindings.session_id=EXCLUDED.session_id AND agent_run_bindings.agent_id=EXCLUDED.agent_id
      AND agent_run_bindings.principal_id=EXCLUDED.principal_id AND agent_run_bindings.thread_id IS NOT DISTINCT FROM EXCLUDED.thread_id
      AND agent_run_bindings.internal=EXCLUDED.internal RETURNING run_id`,
  [identity.runId,identity.tenantId,conversationId,identity.sessionId,identity.agentId,identity.principalId,identity.threadId ?? null,internal])
  if (result.rows.length !== 1) throw new Error('runtime product binding changed')
}

/** The authenticated route supplies a product channel; the stored runtime identity is authoritative. */
export async function productRunIdentity(input: { companyId: string; conversationId: string; agentId: string; runId: string; principalId: string; threadId?: string }, db: Queryable = pool): Promise<RunIdentity> {
  const result = await db.query(`SELECT 1 FROM agent_run_bindings WHERE run_id=$1 AND company_id=$2
    AND conversation_id=$3 AND agent_id=$4 AND principal_id=$5 AND thread_id IS NOT DISTINCT FROM $6 AND NOT internal`,
  [input.runId,input.companyId,input.conversationId,input.agentId,input.principalId,input.threadId ?? null])
  if (!result.rows.length) throw Object.assign(new Error('run not found'), { status: 404 })
  const identity = await readRunReference(db,input.companyId,input.runId)
  if (!identity || identity.principalId !== input.principalId || identity.agentId !== input.agentId) throw Object.assign(new Error('run not found'), { status: 404 })
  return identity
}
