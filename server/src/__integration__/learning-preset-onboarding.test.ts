import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { LEARNING_PRESET_VERSION, onboardStarterAgents } from '../onboardCompany.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

async function seedEmptyWorkspace(): Promise<{ companyId: string; ownerId: string }> {
  const companyId = `co-learning-${randomUUID().slice(0, 8)}`
  const ownerId = `u-learning-${randomUUID().slice(0, 8)}`
  await pool.query(
    "INSERT INTO users (id, email, display_name, tier) VALUES ($1, $2, 'Student', 'free')",
    [ownerId, `${ownerId}@test.local`],
  )
  await pool.query(
    "INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, 'Learning Co', $1, $2)",
    [companyId, ownerId],
  )
  await pool.query("INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')", [companyId, ownerId])
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1, $2, 'human', 'Student', 'student', 'S', '#aaa', 'avail')`,
    [ownerId, companyId],
  )
  return { companyId, ownerId }
}

test('[integration] canonical learning preset seeds a fresh workspace', async () => {
  const { companyId } = await seedEmptyWorkspace()
  await onboardStarterAgents(companyId)

  const counts = await pool.query<{ agents: number; dms: number; rooms: number; all_hands: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM participants WHERE company_id=$1 AND preset_key IS NOT NULL) AS agents,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id=$1 AND preset_key LIKE 'dm:%') AS dms,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id=$1 AND preset_key LIKE 'room:%') AS rooms,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id=$1 AND title='Everyone') AS all_hands`,
    [companyId],
  )
  assert.deepEqual(counts.rows[0], { agents: 6, dms: 6, rooms: 2, all_hands: 0 })

  const agents = await pool.query<{ preset_key: string; tools: string[]; capabilities: string[] }>(
    `SELECT preset_key, tools, capabilities FROM participants
      WHERE company_id=$1 AND kind='agent' ORDER BY preset_key`,
    [companyId],
  )
  assert.equal(agents.rows.length, 6)
  for (const agent of agents.rows) {
    assert.deepEqual(agent.tools, ['ipython'])
    assert.ok(agent.capabilities.includes('learning'))
  }
})

test('[integration] current-preset refresh preserves identities and learning history', async () => {
  const { companyId } = await seedEmptyWorkspace()
  await onboardStarterAgents(companyId)
  const before = await pool.query<{ id: string; preset_key: string }>(
    `SELECT id, preset_key FROM participants
      WHERE company_id=$1 AND kind='agent' ORDER BY preset_key`,
    [companyId],
  )
  const novaId = before.rows.find((agent) => agent.preset_key === 'nova')?.id
  assert.ok(novaId)
  await pool.query('UPDATE companies SET starter_preset_version=$2 WHERE id=$1', [companyId, LEARNING_PRESET_VERSION - 1])
  await pool.query("UPDATE participants SET system_prompt='stale current prompt' WHERE id=$1", [novaId])
  await pool.query(
    `INSERT INTO agent_workspace (agent_id, path, body, company_id)
     VALUES ($1, 'memory/keep.md', 'keep this learning history', $2)`,
    [novaId, companyId],
  )

  await onboardStarterAgents(companyId)

  const after = await pool.query<{ id: string; preset_key: string }>(
    `SELECT id, preset_key FROM participants
      WHERE company_id=$1 AND kind='agent' ORDER BY preset_key`,
    [companyId],
  )
  assert.deepEqual(after.rows, before.rows)
  const refreshed = await pool.query<{ system_prompt: string; tools: string[] }>(
    'SELECT system_prompt, tools FROM participants WHERE id=$1',
    [novaId],
  )
  assert.match(refreshed.rows[0]?.system_prompt ?? '', /learning coordinator/i)
  assert.deepEqual(refreshed.rows[0]?.tools, ['ipython'])
  const memory = await pool.query<{ body: string }>(
    "SELECT body FROM agent_workspace WHERE company_id=$1 AND agent_id=$2 AND path='memory/keep.md'",
    [companyId, novaId],
  )
  assert.equal(memory.rows[0]?.body, 'keep this learning history')

  const countsBefore = await pool.query<{ agents: number; conversations: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM participants WHERE company_id=$1 AND kind='agent') AS agents,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id=$1) AS conversations`,
    [companyId],
  )
  await onboardStarterAgents(companyId)
  const countsAfter = await pool.query<{ agents: number; conversations: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM participants WHERE company_id=$1 AND kind='agent') AS agents,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id=$1) AS conversations`,
    [companyId],
  )
  assert.deepEqual(countsAfter.rows[0], countsBefore.rows[0])
})
