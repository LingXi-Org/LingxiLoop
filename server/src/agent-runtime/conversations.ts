import type { ConversationPolicy, createLingxiOS } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { createPermissionService } from '../modules/access/public.js'
import { wukongClient } from '../im/wukong.js'
import type { ImChannelProfile } from '../im/types.js'

type Control = Pick<Awaited<ReturnType<typeof createLingxiOS>>, 'conversations'>

export async function syncProductChannel(profile: ImChannelProfile, signal?: AbortSignal): Promise<void> {
  const bindings = (await pool.query<{ company_id: string }>('SELECT company_id FROM im_channel_bindings WHERE channel_id=$1', [profile.channelId])).rows
  if (bindings.length !== 1) throw new Error('channel binding is unavailable or ambiguous')
  const { lingxiOSControl } = await import('./runtime.js')
  await syncConversationPolicy(await lingxiOSControl(),bindings[0].company_id,profile.channelId)
  await wukongClient(signal).upsertChannel(profile)
}

/** Resolve the native policy from current product membership and ACLs, never message text. */
export async function syncConversationPolicy(control: Control, companyId: string, conversationId: string): Promise<ConversationPolicy> {
  const policy = await withTransaction(pool, async db => {
    const binding = (await db.query<{ leader_agent_id: string | null; kind: 'direct' | 'group'; runtime_policy_version: number }>(
      `SELECT b.leader_agent_id,c.kind,b.runtime_policy_version FROM im_channel_bindings b
       JOIN conversations c ON c.id=b.channel_id AND c.company_id=b.company_id
       WHERE b.company_id=$1 AND b.channel_id=$2 FOR UPDATE OF b`, [companyId,conversationId])).rows[0]
    if (!binding) throw new Error('conversation is unavailable')
    const members = (await db.query<{ id: string; kind: 'human' | 'agent'; preset_key: string | null }>(
      `SELECT p.id,p.kind,p.preset_key FROM participants p
       JOIN im_channel_bindings b ON b.company_id=p.company_id AND b.profile->'members' ? p.id
       JOIN conversations c ON c.id=b.channel_id AND c.company_id=b.company_id AND c.members ? p.id
       WHERE b.company_id=$1 AND b.channel_id=$2 AND p.departed_at IS NULL ORDER BY p.id`, [companyId,conversationId])).rows
    const permissions = createPermissionService(db)
    const participants: ConversationPolicy['participants'] = []
    for (const member of members) {
      // Agents are product participants; the original human authorizes each execution.
      if (member.kind === 'agent') {
        participants.push({ id: member.id, kind: 'agent', capabilities: ['read','execute','speak'] })
        continue
      }
      const scope = { companyId, actorUserId: member.id, resource: { type: 'conversation' as const, id: conversationId } }
      const read = await permissions.can({ ...scope, action: 'conversation:read' })
      if (!read.allowed) continue
      const execute = await permissions.can({ ...scope, action: 'conversation:write' })
      const control = (await permissions.can({ ...scope, action: 'agent_run:control' })).allowed
      participants.push({ id: member.id, kind: member.kind, capabilities: ['read',
        ...execute.allowed ? ['execute' as const] : [],
        ...control ? ['control' as const] : []] })
    }
    const agents = participants.filter(member => member.kind === 'agent' && member.capabilities.includes('speak'))
    const defaultAgentId = agents.find(agent => agent.id === binding.leader_agent_id)?.id
      ?? agents.find(agent => members.find(member => member.id === agent.id)?.preset_key === 'nova')?.id
      ?? agents.find(agent => members.find(member => member.id === agent.id)?.preset_key === 'forge')?.id ?? agents[0]?.id
    const value = { tenantId: companyId, conversationId, kind: binding.kind,
      owner: { kind: 'organization' as const, id: companyId }, participants, ...defaultAgentId ? { defaultAgentId } : {} }
    const updated = await db.query<{ runtime_policy_version: number }>(`UPDATE im_channel_bindings SET
      runtime_policy_version=runtime_policy_version+CASE WHEN runtime_policy IS DISTINCT FROM $3::jsonb THEN 1 ELSE 0 END,
      runtime_policy=$3::jsonb WHERE company_id=$1 AND channel_id=$2 RETURNING runtime_policy_version`,
    [companyId,conversationId,JSON.stringify(value)])
    return { ...value, version: updated.rows[0].runtime_policy_version }
  })
  await control.conversations.sync(policy)
  return policy
}
