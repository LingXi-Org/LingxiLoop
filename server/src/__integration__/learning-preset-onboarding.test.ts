import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { onboardCompanyStarterWorkspace } from '../modules/companies/public.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { installFakeWukong(); await resetAllTables() })
after(async () => { await teardownAll() })

async function seedEmptyWorkspace(): Promise<{ companyId: string; ownerId: string }> {
  const companyId = `co-learning-${randomUUID().slice(0, 8)}`
  const ownerId = `u-learning-${randomUUID().slice(0, 8)}`
  await pool.query(
    "INSERT INTO users (id, email, display_name) VALUES ($1, $2, 'Student')",
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
  await onboardCompanyStarterWorkspace(companyId)

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

test('[integration] canonical learning preset is idempotent', async () => {
  const { companyId } = await seedEmptyWorkspace()
  await onboardCompanyStarterWorkspace(companyId)
  const before = await pool.query<{ id: string; preset_key: string }>(
    `SELECT id, preset_key FROM participants
      WHERE company_id=$1 AND kind='agent' ORDER BY preset_key`,
    [companyId],
  )
  await onboardCompanyStarterWorkspace(companyId)

  const after = await pool.query<{ id: string; preset_key: string }>(
    `SELECT id, preset_key FROM participants
      WHERE company_id=$1 AND kind='agent' ORDER BY preset_key`,
    [companyId],
  )
  assert.deepEqual(after.rows, before.rows)
  const countsBefore = await pool.query<{ agents: number; conversations: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM participants WHERE company_id=$1 AND kind='agent') AS agents,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id=$1) AS conversations`,
    [companyId],
  )
  await onboardCompanyStarterWorkspace(companyId)
  const countsAfter = await pool.query<{ agents: number; conversations: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM participants WHERE company_id=$1 AND kind='agent') AS agents,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id=$1) AS conversations`,
    [companyId],
  )
  assert.deepEqual(countsAfter.rows[0], countsBefore.rows[0])
})

test('[integration] partial preset is rejected instead of repaired', async () => {
  const { companyId } = await seedEmptyWorkspace()
  await pool.query(
    `INSERT INTO participants
       (id, company_id, kind, name, role, initial, avatar_bg, status, preset_key)
     VALUES ($1, $2, 'agent', 'Nova', '学习规划与协调', 'N', '#334155', 'avail', 'nova')`,
    [`agent-${randomUUID()}`, companyId],
  )

  await assert.rejects(
    onboardCompanyStarterWorkspace(companyId),
    /partial native learning preset/i,
  )

  const agents = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM participants
      WHERE company_id=$1 AND kind='agent' AND preset_key IS NOT NULL`,
    [companyId],
  )
  assert.equal(agents.rows[0]?.count, 1)
})
