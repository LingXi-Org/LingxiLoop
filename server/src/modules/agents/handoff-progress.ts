import { readRunReference, type createLingxiOS } from '@lyyzka/lingxios'
import type { Queryable } from '../../db/queryable.js'
import { persistNativeEvents } from '../../agents/native-events.js'

export async function publishHandoffProgress(db: Queryable, companyId: string, handoffId: string) {
  const { rows } = await db.query<{
    id: string; conversation_id: string; from_agent_id: string; to_agent_id: string; title: string; status: string
    parent_work_id: string; child_work_id: string; thread_id: string | null; progress_version: number; visible: boolean; updated_at: Date
  }>('SELECT * FROM agent_handoffs WHERE company_id=$1 AND id=$2', [companyId,handoffId])
  const row = rows[0]
  if (!row?.visible) return
  const clientNonce = `handoff:${row.id}:${row.progress_version}`
  await persistNativeEvents(db, { companyId, workId: row.parent_work_id, key: clientNonce }, [{
    type: 'im.system', companyId, actorId: row.from_agent_id, channelId: row.conversation_id, clientNonce,
    payload: { version: 1, kind: 'handoff', clientMsgNo: clientNonce, body: row.title, refs: { handoffId: row.id },
      ...(row.thread_id ? { replyToClientMsgNo: row.thread_id } : {}), data: {
        id: row.id, fromAgentId: row.from_agent_id, toAgentId: row.to_agent_id, title: row.title, status: row.status,
        parentWorkId: row.parent_work_id, childWorkId: row.child_work_id, progressVersion: row.progress_version, updatedAt: row.updated_at.toISOString(),
        suppressAgentWake: true, activation: 'deliver',
      } },
  }])
}

/** Internal child events are private; only public run outcomes update the original handoff. */
export async function reconcileHandoffs(db: Queryable, transaction: <T>(run: (db: Queryable) => Promise<T>) => Promise<T>,
  control: () => Promise<Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'readRun'>>, signal: AbortSignal) {
  const { rows } = await db.query<{ id: string; company_id: string; child_work_id: string; principal_id: string; to_agent_id: string }>(
    `SELECT id,company_id,child_work_id,principal_id,to_agent_id FROM agent_handoffs
      WHERE child_work_id IS NOT NULL AND NOT run_settled ORDER BY updated_at,id LIMIT 64`)
  const api = await control()
  for (const row of rows) {
    signal.throwIfAborted()
    // Rotate the bounded batch so long-running children cannot starve later handoffs.
    await db.query('UPDATE agent_handoffs SET updated_at=NOW() WHERE id=$1 AND NOT run_settled',[row.id])
    const identity = await readRunReference(db,row.company_id,row.child_work_id)
    if (!identity || identity.principalId !== row.principal_id || identity.agentId !== row.to_agent_id) continue
    await transaction(async client => {
      await client.query('SELECT id FROM agent_handoffs WHERE id=$1 FOR UPDATE', [row.id])
      const run = await api.readRun(identity,client)
      if (!run) return
      const status = run.status === 'succeeded' ? 'completed' : run.status === 'leased' ? 'working' : run.status
      const settled = !['queued','leased','waiting'].includes(run.status)
      const changed = await client.query(`UPDATE agent_handoffs SET status=$2,run_settled=$3,progress_version=progress_version+1,updated_at=NOW()
        WHERE id=$1 AND NOT run_settled AND (status<>$2 OR run_settled<>$3) RETURNING id`, [row.id,status,settled])
      if (changed.rows.length) await publishHandoffProgress(client,row.company_id,row.id)
    })
  }
}
