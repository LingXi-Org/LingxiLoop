import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import type { AgentWorkReason } from './types.js'

export async function enqueueAgentWork(args: {
  companyId: string
  agentId: string
  reason: AgentWorkReason
  triggerClientMsgNo?: string
  channelId?: string
  priority?: number
}): Promise<boolean> {
  let channelId = args.channelId
  if (!channelId) {
    const { rows } = await pool.query<{ channel_id: string }>(
      `SELECT channel_id FROM im_channel_bindings
        WHERE company_id=$1 AND preset_key LIKE 'dm:%' AND profile->'members' ? $2
        ORDER BY created_at LIMIT 1`, [args.companyId, args.agentId],
    )
    channelId = rows[0]?.channel_id
  }
  if (!channelId) return false
  const trigger = args.triggerClientMsgNo ?? `domain:${randomUUID()}`
  const { rowCount } = await pool.query(
    `INSERT INTO agent_work_items
       (id, company_id, agent_id, channel_id, trigger_client_msg_no, reason, priority)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
    [randomUUID(), args.companyId, args.agentId, channelId, trigger, args.reason, args.priority ?? 100],
  )
  return rowCount === 1
}
