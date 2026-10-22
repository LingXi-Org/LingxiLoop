import { NoEffectError, readRunReference, type RunIdentity, type WorkItem } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'
import { CH_AGENT_RUN_AVAILABLE, publish, redis } from '../redis.js'

export function notifyRunAvailable(identity: RunIdentity, conversationId: string): void {
  // Notifications are repairable hints; never queue them while Redis is disconnected or block a model turn.
  if (!identity.principalId || redis.status !== 'ready') return
  void publish(CH_AGENT_RUN_AVAILABLE, { type: 'agent.run.available', companyId: identity.tenantId,
    principalId: identity.principalId, conversationId, agentId: identity.agentId, runId: identity.runId,
    ...(identity.threadId ? { threadId: identity.threadId } : {}) })
    .catch(() => console.warn('[lingxios] run notification unavailable; discovery will recover', { runId: identity.runId }))
}

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

/** Only proven new admission or trusted marked lineage supplies a version.
 * Conflicts deliberately never upgrade NULL: first binding may predate this host. */
export async function bindProductRun(db: Queryable, identity: RunIdentity, conversationId: string, internal = false, sourceClientMsgNo?: string, presentationVersion?: 1) {
  const result = await db.query(`INSERT INTO agent_run_bindings
    (run_id,company_id,conversation_id,session_id,agent_id,principal_id,thread_id,internal,message_protocol,source_client_msg_no,presentation_version)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,2,$9,$10) ON CONFLICT(run_id) DO UPDATE SET run_id=EXCLUDED.run_id,
      source_client_msg_no=COALESCE(agent_run_bindings.source_client_msg_no,EXCLUDED.source_client_msg_no)
    WHERE agent_run_bindings.company_id=EXCLUDED.company_id AND agent_run_bindings.conversation_id=EXCLUDED.conversation_id
      AND agent_run_bindings.session_id=EXCLUDED.session_id AND agent_run_bindings.agent_id=EXCLUDED.agent_id
      AND agent_run_bindings.principal_id=EXCLUDED.principal_id AND agent_run_bindings.thread_id IS NOT DISTINCT FROM EXCLUDED.thread_id
      AND agent_run_bindings.internal=EXCLUDED.internal RETURNING run_id,(xmax=0) AS inserted`,
  [identity.runId,identity.tenantId,conversationId,identity.sessionId,identity.agentId,identity.principalId,identity.threadId ?? null,internal,sourceClientMsgNo ?? null,presentationVersion ?? null])
  if (result.rows.length !== 1) throw new Error('runtime product binding changed')
  if (result.rows[0].inserted && !internal) notifyRunAvailable(identity, conversationId)
}

/** The authenticated route supplies a product channel; the stored runtime identity is authoritative. */
export async function productRunIdentity(input: { companyId: string; conversationId: string; agentId: string; runId: string; principalId: string; threadId?: string; historical?: true }, db: Queryable = pool): Promise<RunIdentity> {
  const result = await db.query(`SELECT 1 FROM agent_run_bindings WHERE run_id=$1 AND company_id=$2
    AND conversation_id=$3 AND agent_id=$4 AND principal_id=$5 AND thread_id IS NOT DISTINCT FROM $6 AND NOT internal
    AND (message_protocol=2 OR $7)`,
  [input.runId,input.companyId,input.conversationId,input.agentId,input.principalId,input.threadId ?? null,input.historical === true])
  if (!result.rows.length) throw Object.assign(new Error('run not found'), { status: 404 })
  const identity = await readRunReference(db,input.companyId,input.runId)
  if (!identity || identity.principalId !== input.principalId || identity.agentId !== input.agentId) throw Object.assign(new Error('run not found'), { status: 404 })
  return identity
}

/** Read only the already-authorized native identity's product provenance. */
export async function readRunPresentationVersion(identity: RunIdentity, db: Queryable = pool): Promise<1 | undefined> {
  const result = await db.query<{ presentation_version: number | null }>(`SELECT presentation_version FROM agent_run_bindings
    WHERE run_id=$1 AND company_id=$2 AND agent_id=$3 AND principal_id=$4 AND session_id=$5
      AND thread_id IS NOT DISTINCT FROM $6 AND message_protocol=2`,
  [identity.runId,identity.tenantId,identity.agentId,identity.principalId,identity.sessionId,identity.threadId ?? null])
  return result.rows[0]?.presentation_version === 1 ? 1 : undefined
}

/** Runtime-owned lineage can prove descendants of an already-marked generation.
 * No user payload, clock, ID pattern or missing-binding inference establishes it. */
export async function inheritedRunPresentationVersion(db: Queryable, work: Pick<WorkItem,'id' | 'tenantId' | 'principalId' | 'meta'>,
  conversationId: string): Promise<1 | undefined> {
  const parents = [...new Set([work.meta?.parentWorkId,work.meta?.rootWorkId,work.meta?.mentionParentWorkId])]
    .filter((id): id is string => typeof id === 'string' && !!id && id !== work.id)
  if (!parents.length || !work.principalId) return undefined
  const result = await db.query(`SELECT 1 FROM agent_run_bindings WHERE run_id=ANY($1::text[])
    AND company_id=$2 AND principal_id=$3 AND conversation_id=$4 AND presentation_version=1 AND message_protocol=2 LIMIT 1`,
  [parents,work.tenantId,work.principalId,conversationId])
  return result.rows.length ? 1 : undefined
}
