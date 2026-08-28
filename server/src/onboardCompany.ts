/**
 * Auto-onboarding for fresh companies.
 *
 * When a new company is created (signup or POST /companies), we drop in a
 * six-role learning team so the workspace doesn't feel empty. Each
 * agent has a thoughtful persona — different roles, different voices, so a
 * brand-new user has actual teammates to talk to.
 *
 * Constraint: participants.id is globally unique (single-column PK), so the
 * FIRST tenant on a fresh DB gets clean ids ("nova", "sage", …); later
 * tenants get suffixed ids ("nova-2x4f", …). Display names stay clean.
 */

import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { invalidatePersonaCache } from './agents/personas.js'
import { pool } from './db/pool.js'
import { reconcileLearningChannels } from './im/reconcile.js'
import {
  STARTER_ROOMS as CANONICAL_STARTER_ROOMS,
  STARTER_TEAM as CANONICAL_STARTER_TEAM,
  type LearningPersonaKey,
} from './learning/preset.js'


export const STARTER_TEAM = CANONICAL_STARTER_TEAM
export const STARTER_ROOMS = CANONICAL_STARTER_ROOMS

type QueryClient = Pick<PoolClient, 'query'>

async function uniqueId(db: QueryClient, preferredId: string): Promise<string> {
  const { rows } = await db.query(
    `SELECT 1 FROM participants WHERE id = $1 LIMIT 1`,
    [preferredId],
  )
  if (rows.length === 0) return preferredId
  // Suffix with a short random tail. Re-check (super unlikely to collide twice).
  for (let i = 0; i < 5; i++) {
    const candidate = `${preferredId}-${randomUUID().slice(0, 4)}`
    const { rows: r2 } = await db.query(
      `SELECT 1 FROM participants WHERE id = $1 LIMIT 1`,
      [candidate],
    )
    if (r2.length === 0) return candidate
  }
  // Worst case, full uuid suffix.
  return `${preferredId}-${randomUUID().slice(0, 12)}`
}


async function seedLearningPreset(
  db: QueryClient,
  companyId: string,
  ownerId: string,
): Promise<void> {
  const { rows: workspaces } = await db.query<{ id: string }>(
    `SELECT id FROM projects WHERE company_id=$1 AND is_general=TRUE LIMIT 1`,
    [companyId],
  )
  const projectId = workspaces[0]?.id
  if (!projectId) throw new Error('general workspace must exist before starter onboarding')
  const agentIds = new Map<LearningPersonaKey, string>()
  for (const agent of STARTER_TEAM) {
    const id = await uniqueId(db, agent.id)
    agentIds.set(agent.presetKey, id)
    await db.query(
      `INSERT INTO participants (
         id, preset_key, kind, name, role, initial, avatar_bg, avatar_url, status,
         bio, tools, capabilities, system_prompt, company_id
       ) VALUES ($1, $2, 'agent', $3, $4, $5, $6, NULL, 'avail', $7, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        id, agent.presetKey, agent.name, agent.role, agent.initial, agent.avatarBg,
        agent.bio, JSON.stringify(agent.tools), JSON.stringify(agent.capabilities), agent.systemPrompt, companyId,
      ],
    )

    const dmId = `direct-${id}-${randomUUID().slice(0, 6)}`
    await db.query(
      `INSERT INTO conversations (id, preset_key, kind, title, subtitle, members, pinned, tag, company_id, project_id)
       VALUES ($1, $2, 'direct', $3, NULL, $4::jsonb, FALSE, NULL, $5, $6)`,
      [dmId, `dm:${agent.presetKey}`, agent.name, JSON.stringify([ownerId, id]), companyId, projectId],
    )
    await db.query(
      `INSERT INTO im_channel_bindings (channel_id, company_id, profile, leader_agent_id, preset_key)
       VALUES ($1,$2,$3::jsonb,$4,$5)`,
      [dmId, companyId, JSON.stringify({
        channelId: dmId, channelType: 2, kind: 'direct', title: agent.name, members: [ownerId, id], createdAt: new Date().toISOString(),
      }), id, `dm:${agent.presetKey}`],
    )
  }

  for (const room of STARTER_ROOMS) {
    const memberIds = room.agentKeys.map((key) => agentIds.get(key)!)
    const authorId = agentIds.get(room.welcomeAuthorKey)!
    const roomId = `preset-${room.presetKey}-${randomUUID().slice(0, 8)}`
    const members = [ownerId, ...memberIds]
    await db.query(
      `INSERT INTO conversations (id, preset_key, kind, title, subtitle, topic, members, leader_id, pinned, tag, company_id, project_id)
       VALUES ($1, $2, 'group', $3, $4, $5, $6::jsonb, $7, TRUE, 'team', $8, $9)`,
      [
        roomId, `room:${room.presetKey}`, room.title, `team · ${members.length}`,
        room.presetKey === 'study-room'
          ? '日常学习、概念理解、解题练习与错因诊断'
          : '实验、编程、科研、数据分析、论文复现与项目实践',
        JSON.stringify(members), authorId, companyId, projectId,
      ],
    )
    await db.query(
      `INSERT INTO im_channel_bindings (channel_id, company_id, profile, leader_agent_id, preset_key)
       VALUES ($1,$2,$3::jsonb,$4,$5)`,
      [roomId, companyId, JSON.stringify({
        channelId: roomId, channelType: 2, title: room.title, members,
        topic: room.presetKey === 'study-room'
          ? '日常学习、概念理解、解题练习与错因诊断'
          : '实验、编程、科研、数据分析、论文复现与项目实践',
        welcome: room.welcome, welcomeAuthorId: authorId, pinned: true, createdAt: new Date().toISOString(),
      }), authorId, `room:${room.presetKey}`],
    )
  }
}
/** Install the native learning preset inside the caller's transaction. Partial
 * preset state is rejected because silently repairing it would create a second
 * lifecycle. Returns whether a new preset was written. */
export async function installStarterAgents(db: QueryClient, companyId: string): Promise<boolean> {
  const { rows } = await db.query<{ owner_user_id: string | null }>(
      `SELECT owner_user_id FROM companies WHERE id = $1 FOR UPDATE`,
      [companyId],
  )
  const company = rows[0]
  if (!company) throw new Error(`company not found: ${companyId}`)

  let ownerId = company.owner_user_id
  if (!ownerId) {
    const owner = await db.query<{ user_id: string }>(
      `SELECT user_id FROM company_members
        WHERE company_id = $1 AND role = 'owner'
        ORDER BY joined_at ASC LIMIT 1`,
      [companyId],
    )
    ownerId = owner.rows[0]?.user_id ?? null
  }
  if (!ownerId) throw new Error(`company ${companyId} has no owner`)

  await db.query(
    `INSERT INTO projects (id, company_id, name, description, color, created_by, is_general)
     SELECT $2, $1, '通用工作区', '未指定工作区的会话与资料', '#667085', $3, TRUE
      WHERE NOT EXISTS (SELECT 1 FROM projects WHERE company_id=$1 AND is_general=TRUE)`,
    [companyId, `general-${randomUUID().slice(0, 18)}`, ownerId],
  )

  const expectedKeys = STARTER_TEAM.map((agent) => agent.presetKey)
  const existing = await db.query<{ preset_key: string }>(
    `SELECT preset_key FROM participants
      WHERE company_id = $1 AND kind = 'agent' AND preset_key = ANY($2::text[])`,
    [companyId, expectedKeys],
  )
  if (existing.rows.length === expectedKeys.length) return false
  if (existing.rows.length !== 0) {
    throw new Error(`company ${companyId} has a partial native learning preset (${existing.rows.length}/${expectedKeys.length})`)
  }
  await seedLearningPreset(db, companyId, ownerId)
  return true
}

export async function finalizeStarterAgents(installed: boolean): Promise<void> {
  if (installed) invalidatePersonaCache()
  const reconciliation = await reconcileLearningChannels()
  if (reconciliation.failures > 0) {
    throw new Error(`WuKongIM learning channel reconciliation failed (${reconciliation.failures}/${reconciliation.channels})`)
  }
}

/** Transaction-owning facade used by startup and identity onboarding. */
export async function onboardStarterAgents(companyId: string): Promise<void> {
  const client = await pool.connect()
  let installed = false
  try {
    await client.query('BEGIN')
    installed = await installStarterAgents(client, companyId)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  await finalizeStarterAgents(installed)
}

/**
 * Open a 1:1 direct conversation between `memberId` and every other current
 * member of the company (agents + humans, excluding departed). Idempotent
 * per pair: if a direct convo with exactly those two members already exists,
 * we skip it.
 *
 * Why: Study Room and Lab intentionally keep fixed membership. Direct chats
 * remain the discovery path for newly invited people, so every teammate is
 * still reachable without silently changing either built-in room.
 *
 * Pair coverage spans humans too (not just agents): a new joiner should be
 * able to click any of their colleagues by name, same as the owner can.
 * Yes, this is O(N) inserts per join, and an N-person workspace ends up
 * with O(N²) DM rows once everyone's joined — accepted as the cost of
 * a discoverable sidebar.
 */
export async function seedMemberDms(args: {
  companyId: string
  memberId: string
}): Promise<void> {
  const { companyId, memberId } = args
  const { rows: workspaces } = await pool.query<{ id: string }>(
    `SELECT id FROM projects WHERE company_id=$1 AND is_general=TRUE LIMIT 1`,
    [companyId],
  )
  const projectId = workspaces[0]?.id
  if (!projectId) throw new Error('general workspace must exist before member onboarding')
  const { rows: others } = await pool.query<{ id: string; name: string; kind: 'agent' | 'human' }>(
    `SELECT id, name, kind FROM participants
      WHERE company_id = $1
        AND id <> $2
        AND departed_at IS NULL`,
    [companyId, memberId],
  )
  for (const other of others) {
    // Skip if a direct chat between this pair already exists in this
    // company — saves redundant rows on partial reruns or when the same
    // member is somehow re-onboarded.
    const { rows: ex } = await pool.query(
      `SELECT 1 FROM conversations
        WHERE company_id = $1 AND project_id = $4 AND kind = 'direct'
          AND members @> to_jsonb(ARRAY[$2::text, $3::text])
          AND jsonb_array_length(members) = 2 LIMIT 1`,
      [companyId, memberId, other.id, projectId],
    )
    if (ex[0]) continue
    const dmId = `direct-${other.id}-${randomUUID().slice(0, 6)}`
    await pool.query(
      `INSERT INTO conversations (id, kind, title, subtitle, members, pinned, tag, company_id, project_id)
       VALUES ($1, 'direct', $2, NULL, $3::jsonb, FALSE, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [dmId, other.name, JSON.stringify([memberId, other.id]),
       other.kind === 'human' ? 'human' : null, companyId, projectId],
    )
    await pool.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 1)
       ON CONFLICT (conversation_id) DO NOTHING`,
      [dmId],
    )
  }
}
