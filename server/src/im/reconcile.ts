import { pool } from '../db/pool.js'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import { wukongClient } from './wukong.js'
import type { WorkerTaskHandle } from '../runtime/lifecycle.js'

export async function reconcileImChannels(): Promise<{ channels: number; failures: number }> {
  const { rows } = await pool.query<{
    channel_id: string
    profile: { channelType?: number; title?: string; members?: string[]; welcome?: string; welcomeAuthorId?: string }
    leader_agent_id: string | null
    preset_key: string | null
  }>(`SELECT channel_id, profile, leader_agent_id, preset_key FROM im_channel_bindings ORDER BY created_at`)
  let failures = 0
  for (const row of rows) {
    const channelType = row.profile.channelType === 1 ? 1 : 2
    try {
      await wukongClient().upsertChannel({
        channelId: row.channel_id,
        channelType,
        title: row.profile.title ?? row.channel_id,
        members: Array.isArray(row.profile.members) ? row.profile.members : [],
        ...(row.leader_agent_id ? { leaderAgentId: row.leader_agent_id } : {}),
        ...(row.preset_key ? { presetKey: row.preset_key } : {}),
      })
      if (row.profile.welcome && row.profile.welcomeAuthorId) {
        const payload: LingxiMessageV1 = {
          version: 1, kind: 'text', clientMsgNo: `welcome-${row.channel_id}`,
          body: row.profile.welcome,
          refs: { agentId: row.profile.welcomeAuthorId, preset: row.preset_key ?? '' },
        }
        await wukongClient().sendMessage(row.channel_id, channelType, row.profile.welcomeAuthorId, payload)
      }
    } catch (error) {
      failures++
      console.warn(`[im] reconcile ${row.channel_id} failed:`, error instanceof Error ? error.message : String(error))
    }
  }
  return { channels: rows.length, failures }
}

export function startImChannelReconciliation(intervalMs = 30_000): WorkerTaskHandle | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null
  const tick = () => void reconcileImChannels().catch((error) => {
    console.warn('[im] channel reconciliation sweep failed:', error instanceof Error ? error.message : String(error))
  })
  const timer = setInterval(tick, Math.max(5_000, intervalMs))
  timer.unref?.()
  return { stop: () => clearInterval(timer) }
}
