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
import type { Queryable } from '../../db/queryable.js'
import {
  STARTER_ROOMS as CANONICAL_STARTER_ROOMS,
  STARTER_TEAM as CANONICAL_STARTER_TEAM,
  type LearningPersonaKey,
} from '../learning/contracts.js'


export const STARTER_TEAM = CANONICAL_STARTER_TEAM
export const STARTER_ROOMS = CANONICAL_STARTER_ROOMS

async function uniqueId(db: Queryable, preferredId: string): Promise<string> {
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
  db: Queryable,
  companyId: string,
  ownerId: string,
): Promise<void> {
  const { rows: workspaces } = await db.query<{ id: string }>(
    `SELECT project.id FROM projects project
       JOIN companies company ON company.id=project.company_id
      WHERE project.company_id=$1 AND project.is_default=TRUE
        AND project.kind='PERSONAL_LEARNING' AND company.type='PERSONAL'
      LIMIT 1`,
    [companyId],
  )
  const projectId = workspaces[0]?.id
  if (!projectId) throw new Error('Personal Learning default Project must exist before starter onboarding')
  const agentIds = new Map<LearningPersonaKey, string>()
  for (const agent of STARTER_TEAM) {
    const id = await uniqueId(db, agent.id)
    agentIds.set(agent.presetKey, id)
    await db.query(
      `INSERT INTO participants (
         id, preset_key, kind, name, role, initial, avatar_bg, avatar_url, status,
         bio, tools, capabilities, system_prompt, company_id
       ) VALUES ($1, $2, 'agent', $3, $4, $5, 'transparent', NULL, 'avail', $6, $7::jsonb, $8::jsonb, $9, $10)`,
      [
        id, agent.presetKey, agent.name, agent.role, agent.initial,
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
export async function installStarterAgents(db: Queryable, companyId: string): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM companies WHERE id = $1 FOR UPDATE`,
      [companyId],
  )
  const company = rows[0]
  if (!company) throw new Error(`company not found: ${companyId}`)

  const owner = await db.query<{ user_id: string }>(
    `SELECT user_id FROM company_memberships
      WHERE company_id = $1 AND role = 'OWNER' AND status='ACTIVE'
      ORDER BY created_at ASC LIMIT 1`,
    [companyId],
  )
  const ownerId = owner.rows[0]?.user_id ?? null
  if (!ownerId) throw new Error(`company ${companyId} has no owner`)

  const ownerAccount = await db.query<{
    display_name: string
    avatar_url: string | null
  }>(
    `SELECT display_name,avatar_url FROM users WHERE id=$1 AND deleted_at IS NULL`,
    [ownerId],
  )
  const ownerProfile = ownerAccount.rows[0]
  if (!ownerProfile) throw new Error(`company ${companyId} owner is missing or deleted`)
  await db.query(
    `INSERT INTO participants (id,kind,name,role,initial,avatar_bg,avatar_url,status,company_id)
     VALUES ($1,'human',$2,NULL,$3,'#FF8870',$4,'avail',$5)
     ON CONFLICT (id,company_id) DO UPDATE SET
       name=EXCLUDED.name,initial=EXCLUDED.initial,avatar_url=EXCLUDED.avatar_url,
       status='avail',departed_at=NULL`,
    [ownerId, ownerProfile.display_name, ownerProfile.display_name.charAt(0).toUpperCase(), ownerProfile.avatar_url, companyId],
  )

  await db.query(
    `INSERT INTO project_memberships (project_id,company_id,user_id,role)
     SELECT project.id,project.company_id,$2,'OWNER' FROM projects project
      JOIN companies company ON company.id=project.company_id
      WHERE project.company_id=$1 AND project.is_default=TRUE
        AND project.kind='PERSONAL_LEARNING' AND company.type='PERSONAL'
     ON CONFLICT (user_id,project_id) DO NOTHING`,
    [companyId, ownerId],
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
