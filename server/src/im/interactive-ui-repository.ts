import type { Queryable } from '../db/queryable.js'
import { pool } from '../db/pool.js'
import { HttpError } from '../http/errors.js'

export interface UiScope { companyId: string; channelId: string; uiId: string }
export interface UiRevisionRow {
  company_id: string; channel_id: string; ui_id: string; revision: number; base_revision: number
  native_message_id: string; run_id: string; agent_id: string; result_id: string; fence: string
  client_nonce: string; source_hash: string; message_id: string | null
  status: 'pending' | 'committed' | 'superseded'
}
export interface UiRunBinding { principal_id: string; session_id: string; thread_id: string | null }
export interface UiStateRow { revision: number; state: unknown; version: number }

/** Revision reservation, state CAS and action admission share this transaction-scoped lock. */
export async function withUiLock<T>(input: { companyId: string; channelId: string; uiIds: string[] }, work: (db: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const uiId of [...new Set(input.uiIds)].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [JSON.stringify(['im-ui', input.companyId, input.channelId, uiId])])
    }
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export async function readUiHead(db: Queryable, input: UiScope): Promise<UiRevisionRow | null> {
  return (await db.query<UiRevisionRow>(`SELECT * FROM im_ui_revisions
    WHERE company_id=$1 AND channel_id=$2 AND ui_id=$3 ORDER BY revision DESC LIMIT 1`,
  [input.companyId, input.channelId, input.uiId])).rows[0] ?? null
}

export async function readUiRevision(db: Queryable, input: UiScope & { revision: number }): Promise<UiRevisionRow | null> {
  return (await db.query<UiRevisionRow>(`SELECT * FROM im_ui_revisions
    WHERE company_id=$1 AND channel_id=$2 AND ui_id=$3 AND revision=$4`,
  [input.companyId, input.channelId, input.uiId, input.revision])).rows[0] ?? null
}

export async function readUiRunBinding(db: Queryable, input: { companyId: string; channelId: string; agentId: string; runId: string }): Promise<UiRunBinding> {
  const binding = (await db.query<UiRunBinding>(`SELECT run.principal_id,run.session_id,run.thread_id FROM agent_run_bindings run
    JOIN participants agent ON agent.company_id=run.company_id AND agent.id=run.agent_id AND agent.kind='agent' AND agent.departed_at IS NULL
    JOIN conversations room ON room.company_id=run.company_id AND room.id=run.conversation_id
    WHERE run.run_id=$1 AND run.company_id=$2 AND run.conversation_id=$3 AND run.agent_id=$4
      AND NOT run.internal AND run.message_protocol=2 AND room.members @> to_jsonb(ARRAY[$4::text])`,
  [input.runId, input.companyId, input.channelId, input.agentId])).rows[0]
  if (!binding) throw new HttpError(403, '交互讲解运行不属于当前会话。')
  return binding
}

export async function readUiState(db: Queryable, input: UiScope & { userId: string }): Promise<UiStateRow | null> {
  return (await db.query<UiStateRow>(`SELECT revision,state,version FROM im_ui_user_states
    WHERE company_id=$1 AND channel_id=$2 AND ui_id=$3 AND user_id=$4`,
  [input.companyId, input.channelId, input.uiId, input.userId])).rows[0] ?? null
}
