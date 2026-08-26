/** Persistence boundary for the canonical six-role learning preset. */
import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { invalidatePersonaCache } from './agents/personas.js'
import { gravatarUrlForEmail } from './auth.js'
import { pool } from './db/pool.js'
import { reconcileLearningChannels } from './im/reconcile.js'
import {
  LEARNING_PRESET_VERSION,
  STARTER_ROOMS,
  STARTER_TEAM,
  type LearningPersonaKey,
} from './learning/preset.js'

export {
  LEARNING_PRESET_VERSION,
  STARTER_ROOMS,
  STARTER_TEAM,
  type LearningPersonaKey,
  type StarterAgent,
  type StarterRoom,
} from './learning/preset.js'

type QueryClient = Pick<PoolClient, 'query'>

async function uniqueId(db: QueryClient, preferredId: string): Promise<string> {
  const { rows } = await db.query('SELECT 1 FROM participants WHERE id = $1 LIMIT 1', [preferredId])
  if (rows.length === 0) return preferredId
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${preferredId}-${randomUUID().slice(0, 4)}`
    const { rows: collision } = await db.query('SELECT 1 FROM participants WHERE id = $1 LIMIT 1', [candidate])
    if (collision.length === 0) return candidate
  }
  return `${preferredId}-${randomUUID().slice(0, 12)}`
}

async function seedLearningPreset(db: QueryClient, companyId: string, ownerId: string): Promise<void> {
  const { rows: workspaces } = await db.query<{ id: string }>(
    'SELECT id FROM projects WHERE company_id=$1 AND is_general=TRUE LIMIT 1',
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
        channelId: dmId, channelType: 2, kind: 'direct', title: agent.name,
        members: [ownerId, id], createdAt: new Date().toISOString(),
      }), id, `dm:${agent.presetKey}`],
    )
  }

  for (const room of STARTER_ROOMS) {
    const memberIds = room.agentKeys.map((key) => agentIds.get(key)!)
    const authorId = agentIds.get(room.welcomeAuthorKey)!
    const roomId = `preset-${room.presetKey}-${randomUUID().slice(0, 8)}`
    const members = [ownerId, ...memberIds]
    const topic = room.presetKey === 'study-room'
      ? '日常学习、概念理解、解题练习与错因诊断'
      : '实验、编程、科研、数据分析、论文复现与项目实践'
    await db.query(
      `INSERT INTO conversations (id, preset_key, kind, title, subtitle, topic, members, leader_id, pinned, tag, company_id, project_id)
       VALUES ($1, $2, 'group', $3, $4, $5, $6::jsonb, $7, TRUE, 'team', $8, $9)`,
      [roomId, `room:${room.presetKey}`, room.title, `team · ${members.length}`, topic, JSON.stringify(members), authorId, companyId, projectId],
    )
    await db.query(
      `INSERT INTO im_channel_bindings (channel_id, company_id, profile, leader_agent_id, preset_key)
       VALUES ($1,$2,$3::jsonb,$4,$5)`,
      [roomId, companyId, JSON.stringify({
        channelId: roomId, channelType: 2, title: room.title, members, topic,
        welcome: room.welcome, welcomeAuthorId: authorId, pinned: true, createdAt: new Date().toISOString(),
      }), authorId, `room:${room.presetKey}`],
    )
  }
}

async function refreshLearningPreset(db: QueryClient, companyId: string): Promise<void> {
  for (const agent of STARTER_TEAM) {
    await db.query(
      `UPDATE participants
          SET name=$3, role=$4, initial=$5, avatar_bg=$6, avatar_url=NULL,
              status=CASE WHEN status='offboarded' THEN status ELSE 'avail' END,
              bio=$7, tools=$8::jsonb, capabilities=$9::jsonb, system_prompt=$10
        WHERE company_id=$1 AND kind='agent' AND preset_key=$2`,
      [
        companyId, agent.presetKey, agent.name, agent.role, agent.initial,
        agent.avatarBg, agent.bio, JSON.stringify(agent.tools), JSON.stringify(agent.capabilities), agent.systemPrompt,
      ],
    )
  }
  for (const room of STARTER_ROOMS) {
    await db.query(
      `UPDATE conversations SET title=$3, updated_at=NOW()
        WHERE company_id=$1 AND preset_key=$2`,
      [companyId, `room:${room.presetKey}`, room.title],
    )
  }
}

/** Install the preset once, or refresh the current preset without replacing identities or learning history. */
export async function onboardStarterAgents(companyId: string): Promise<void> {
  let changed = false
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{
      owner_user_id: string | null
      starter_preset_version: number
    }>(
      'SELECT owner_user_id, starter_preset_version FROM companies WHERE id = $1 FOR UPDATE',
      [companyId],
    )
    const company = rows[0]
    if (!company || company.starter_preset_version >= LEARNING_PRESET_VERSION) {
      await client.query('COMMIT')
      return
    }

    let ownerId = company.owner_user_id
    if (!ownerId) {
      const owner = await client.query<{ user_id: string }>(
        `SELECT user_id FROM company_members
          WHERE company_id = $1 AND role = 'owner'
          ORDER BY joined_at ASC LIMIT 1`,
        [companyId],
      )
      ownerId = owner.rows[0]?.user_id ?? null
    }
    if (!ownerId) {
      await client.query('ROLLBACK')
      return
    }

    await client.query(
      `INSERT INTO projects (id, company_id, name, description, color, created_by, is_general)
       SELECT $2, $1, '通用工作区', '未指定工作区的会话与资料', '#667085', $3, TRUE
        WHERE NOT EXISTS (SELECT 1 FROM projects WHERE company_id=$1 AND is_general=TRUE)`,
      [companyId, `general-${randomUUID().slice(0, 18)}`, ownerId],
    )

    const current = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM participants
        WHERE company_id=$1 AND kind='agent' AND preset_key=ANY($2::text[])`,
      [companyId, STARTER_TEAM.map((agent) => agent.presetKey)],
    )
    if ((current.rows[0]?.count ?? 0) === 0) await seedLearningPreset(client, companyId, ownerId)
    else await refreshLearningPreset(client, companyId)

    await client.query(
      `UPDATE companies
          SET starter_preset_version=$2,
              starter_seeded_at=COALESCE(starter_seeded_at, NOW()),
              starter_dms_seeded_at=COALESCE(starter_dms_seeded_at, NOW())
        WHERE id=$1`,
      [companyId, LEARNING_PRESET_VERSION],
    )
    await client.query('COMMIT')
    changed = true
    invalidatePersonaCache()
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  if (changed) {
    await reconcileLearningChannels().catch((error) => {
      console.warn('[onboard] WuKongIM reconciliation deferred:', error instanceof Error ? error.message : String(error))
    })
  }
}

/** Create discoverable direct conversations between a new member and existing workspace members. */
export async function seedMemberDms(args: { companyId: string; memberId: string }): Promise<void> {
  const { companyId, memberId } = args
  const { rows: workspaces } = await pool.query<{ id: string }>(
    'SELECT id FROM projects WHERE company_id=$1 AND is_general=TRUE LIMIT 1',
    [companyId],
  )
  const projectId = workspaces[0]?.id
  if (!projectId) throw new Error('general workspace must exist before member onboarding')
  const { rows: others } = await pool.query<{ id: string; name: string; kind: 'agent' | 'human' }>(
    `SELECT id, name, kind FROM participants
      WHERE company_id=$1 AND id<>$2 AND departed_at IS NULL`,
    [companyId, memberId],
  )
  for (const other of others) {
    const { rows: existing } = await pool.query(
      `SELECT 1 FROM conversations
        WHERE company_id=$1 AND project_id=$4 AND kind='direct'
          AND members @> to_jsonb(ARRAY[$2::text, $3::text])
          AND jsonb_array_length(members)=2 LIMIT 1`,
      [companyId, memberId, other.id, projectId],
    )
    if (existing[0]) continue
    const dmId = `direct-${other.id}-${randomUUID().slice(0, 6)}`
    await pool.query(
      `INSERT INTO conversations (id, kind, title, subtitle, members, pinned, tag, company_id, project_id)
       VALUES ($1, 'direct', $2, NULL, $3::jsonb, FALSE, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [dmId, other.name, JSON.stringify([memberId, other.id]), other.kind === 'human' ? 'human' : null, companyId, projectId],
    )
    await pool.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 1)
       ON CONFLICT (conversation_id) DO NOTHING`,
      [dmId],
    )
  }
}

export async function backfillHumanGravatars(): Promise<void> {
  const { rows } = await pool.query<{ id: string; company_id: string; email: string | null }>(
    `SELECT p.id, p.company_id, u.email
       FROM participants p JOIN users u ON u.id=p.id
      WHERE p.kind='human' AND p.avatar_url IS NULL AND u.email IS NOT NULL`,
  )
  for (const row of rows) {
    if (!row.email) continue
    await pool.query(
      'UPDATE participants SET avatar_url=$1 WHERE id=$2 AND company_id=$3',
      [gravatarUrlForEmail(row.email), row.id, row.company_id],
    )
  }
  if (rows.length > 0) console.log(`[onboard] backfilled gravatars for ${rows.length} human participant(s)`)
}

export async function backfillStarterAgents(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id FROM companies c
      WHERE c.starter_preset_version < $1
        AND (c.owner_user_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM company_members cm WHERE cm.company_id=c.id AND cm.role='owner'
        ))`,
    [LEARNING_PRESET_VERSION],
  )
  if (rows.length === 0) return
  console.log(`[onboard] refreshing ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'} to learning preset v${LEARNING_PRESET_VERSION}`)
  for (const { id } of rows) {
    try { await onboardStarterAgents(id) }
    catch (error) { console.warn(`[onboard] learning preset refresh failed for ${id}`, error) }
  }
}
