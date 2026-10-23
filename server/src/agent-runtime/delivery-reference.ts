import type { RunIdentity } from '@lyyzka/lingxios'
import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'
import { nativeMessageSchema } from '../im/message-types.js'
import { validSendEcho } from '../im/messages-repository.js'

/** A run ID is a UI identity, never proof that an IM reference was delivered.
 * Resolve only the exact authorized result's recorded accepted echo. Page
 * admission still checks this alias against the actual scoped IM history. */
export async function readDeliveredReference(identity: RunIdentity, result: {
  resultId: string; requestVersion: number; fence: number
}, database: Queryable = pool): Promise<string | undefined> {
  const records = await database.query<{ client_nonce: string; channel_id: string; channel_type: number; payload: unknown; echo: unknown }>(`
    SELECT sent.client_nonce,sent.channel_id,sent.channel_type,sent.payload,sent.echo
    FROM agent_run_bindings binding JOIN im_send_acceptances sent
      ON sent.company_id=binding.company_id AND sent.user_id=binding.agent_id AND sent.channel_id=binding.conversation_id
    WHERE binding.run_id=$1 AND binding.company_id=$2 AND binding.agent_id=$3 AND binding.principal_id=$4
      AND binding.session_id=$5 AND binding.thread_id IS NOT DISTINCT FROM $6 AND NOT binding.internal AND binding.message_protocol=2
      AND sent.status='accepted' AND sent.payload->'metadata'->'custom'->>'runId'=$1
      AND sent.payload->'metadata'->'custom'->'harness'->>'resultId'=$7
      AND sent.payload->'metadata'->'custom'->'harness'->>'requestVersion'=$8
      AND sent.payload->'metadata'->'custom'->'harness'->>'messageFence'=$9
    LIMIT 2`, [identity.runId, identity.tenantId, identity.agentId, identity.principalId, identity.sessionId,
    identity.threadId ?? null, result.resultId, String(result.requestVersion), String(result.fence)])
  if (records.rows.length !== 1) return
  const row = records.rows[0]!, parsed = nativeMessageSchema.safeParse(row.payload)
  const harness = parsed.success ? parsed.data.metadata.custom.harness : undefined
  if (!parsed.success || parsed.data.role !== 'assistant' || parsed.data.status.type !== 'complete'
    || parsed.data.id !== `run-${identity.runId}` || !harness || typeof harness !== 'object'
    || Reflect.get(harness, 'runId') !== identity.runId || Reflect.get(harness, 'resultId') !== result.resultId
    || Reflect.get(harness, 'requestVersion') !== result.requestVersion || Reflect.get(harness, 'fence') !== result.fence
    || Reflect.get(harness, 'messageFence') !== result.fence
    || parsed.data.metadata.custom.sourceMessageId !== row.client_nonce
    || !validSendEcho(row.echo, { userId: identity.agentId, clientNonce: row.client_nonce,
      channelId: row.channel_id, channelType: row.channel_type, payload: row.payload })) return
  return row.client_nonce
}
