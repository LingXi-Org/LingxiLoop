import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { LEARNING_PRESET_VERSION, onboardStarterAgents } from '../onboardCompany.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

before(async () => {
  await ensureSchemaOnce()
})

beforeEach(async () => {
  await resetAllTables()
})

after(async () => {
  await teardownAll()
})

async function seedLegacyWorkspace(): Promise<{
  companyId: string
  ownerId: string
  customId: string
  customRoomId: string
  ownerDocumentId: string
  ownerCardId: string
  ownerEventId: string
}> {
  const companyId = `co-learning-${randomUUID().slice(0, 8)}`
  const ownerId = `u-learning-${randomUUID().slice(0, 8)}`
  const customId = `custom-${randomUUID().slice(0, 8)}`
  const allHandsId = `allhands-${randomUUID().slice(0, 8)}`
  const customRoomId = `custom-room-${randomUUID().slice(0, 8)}`
  const ownerDocumentId = `doc-owner-${randomUUID().slice(0, 8)}`
  const agentDocumentId = `doc-agent-${randomUUID().slice(0, 8)}`
  const boardId = `board-${randomUUID().slice(0, 8)}`
  const columnId = `column-${randomUUID().slice(0, 8)}`
  const ownerCardId = `card-owner-${randomUUID().slice(0, 8)}`
  const agentCardId = `card-agent-${randomUUID().slice(0, 8)}`
  const ownerEventId = `event-owner-${randomUUID().slice(0, 8)}`
  const agentEventId = `event-agent-${randomUUID().slice(0, 8)}`

  await pool.query(
    `INSERT INTO users (id, email, display_name, tier) VALUES ($1, $2, 'Student', 'free')`,
    [ownerId, `${ownerId}@test.local`],
  )
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id, all_hands_conversation_id, starter_preset_version)
     VALUES ($1, 'Learning Co', $1, $2, NULL, 0)`,
    [companyId, ownerId],
  )
  await pool.query(`INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`, [companyId, ownerId])
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1, $2, 'human', 'Student', 'student', 'S', '#aaa', 'avail')`,
    [ownerId, companyId],
  )
  for (const { id, name, presetKey } of [
    { id: 'atlas', name: 'Atlas', presetKey: null },
    { id: 'nova', name: 'Nova', presetKey: null },
    { id: 'kiki', name: 'Kiki', presetKey: null },
    { id: 'sage', name: 'Sage', presetKey: 'sage' },
    { id: customId, name: 'Custom', presetKey: null },
  ]) {
    await pool.query(
      `INSERT INTO participants (id, preset_key, company_id, kind, name, role, initial, avatar_bg, status, system_prompt)
       VALUES ($1, $2, $3, 'agent', $4, 'legacy', $5, '#bbb', 'avail', 'legacy prompt')`,
      [id, presetKey, companyId, name, name.slice(0, 1)],
    )
  }
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, pinned, tag, company_id)
     VALUES ($1, 'group', 'Everyone', $2::jsonb, TRUE, 'team', $3)`,
    [allHandsId, JSON.stringify([ownerId, 'atlas', 'nova', 'kiki', customId]), companyId],
  )
  await pool.query(
    `UPDATE companies SET all_hands_conversation_id = $2, all_hands_seeded_at = NOW() WHERE id = $1`,
    [companyId, allHandsId],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, company_id)
     VALUES ($1, 'group', 'Keep me', $2::jsonb, $3)`,
    [customRoomId, JSON.stringify([ownerId, 'atlas', customId]), companyId],
  )
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id)
     VALUES ($1, $2, 'atlas', 'text', 'legacy trace', 1, $3),
            ($4, $2, $5, 'text', 'student note', 2, $3)`,
    [`m-${randomUUID()}`, customRoomId, companyId, `m-${randomUUID()}`, ownerId],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, company_id)
     VALUES ($1, 'direct', 'Atlas', $2::jsonb, $3)`,
    [`direct-atlas-${randomUUID().slice(0, 6)}`, JSON.stringify([ownerId, 'atlas']), companyId],
  )
  await pool.query(
    `INSERT INTO documents (id, company_id, title, created_by)
     VALUES ($1, $3, 'Student notes', $4), ($2, $3, 'Agent notes', 'atlas')`,
    [ownerDocumentId, agentDocumentId, companyId, ownerId],
  )
  await pool.query(
    `INSERT INTO document_updates (document_id, author_id, update_bytes)
     VALUES ($1, 'atlas', $2), ($1, $3, $2)`,
    [ownerDocumentId, Buffer.from([1]), ownerId],
  )
  await pool.query(
    `INSERT INTO boards (id, company_id, title, created_by) VALUES ($1, $2, 'Student board', $3)`,
    [boardId, companyId, ownerId],
  )
  await pool.query(`INSERT INTO board_columns (id, board_id, title) VALUES ($1, $2, 'Todo')`, [columnId, boardId])
  await pool.query(
    `INSERT INTO board_cards (id, board_id, column_id, title, assignee_id, created_by)
     VALUES ($1, $3, $4, 'Student card', 'atlas', $5),
            ($2, $3, $4, 'Agent card', NULL, 'atlas')`,
    [ownerCardId, agentCardId, boardId, columnId, ownerId],
  )
  await pool.query(
    `INSERT INTO calendar_events (id, company_id, created_by, title, assignee_id, start_at)
     VALUES ($1, $3, $4, 'Student event', 'atlas', NOW()),
            ($2, $3, 'atlas', 'Agent event', NULL, NOW())`,
    [ownerEventId, agentEventId, companyId, ownerId],
  )
  await pool.query(
    `INSERT INTO agent_workspace (agent_id, path, body, company_id) VALUES ('atlas', 'memory/legacy.md', 'legacy', $1)`,
    [companyId],
  )
  return { companyId, ownerId, customId, customRoomId, ownerDocumentId, ownerCardId, ownerEventId }
}

async function seedEmptyWorkspace(): Promise<{ companyId: string; ownerId: string }> {
  const companyId = `co-empty-${randomUUID().slice(0, 8)}`
  const ownerId = `u-empty-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO users (id, email, display_name, tier) VALUES ($1, $2, 'Student', 'free')`,
    [ownerId, `${ownerId}@test.local`],
  )
  await pool.query(
    `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, 'Empty Learning Co', $1, $2)`,
    [companyId, ownerId],
  )
  await pool.query(`INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`, [companyId, ownerId])
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1, $2, 'human', 'Student', 'student', 'S', '#aaa', 'avail')`,
    [ownerId, companyId],
  )
  return { companyId, ownerId }
}

test('[integration] learning preset seeds a fresh workspace without an all-hands room', async () => {
  const { companyId } = await seedEmptyWorkspace()
  await onboardStarterAgents(companyId)
  const counts = await pool.query<{ agents: number; dms: number; rooms: number; welcomes: number; all_hands: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM participants WHERE company_id = $1 AND preset_key IS NOT NULL) AS agents,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id = $1 AND preset_key LIKE 'dm:%') AS dms,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id = $1 AND preset_key LIKE 'room:%') AS rooms,
       (SELECT COUNT(*)::int FROM messages WHERE company_id = $1) AS welcomes,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id = $1 AND title = 'Everyone') AS all_hands`,
    [companyId],
  )
  assert.deepEqual(counts.rows[0], { agents: 6, dms: 6, rooms: 2, welcomes: 0, all_hands: 0 })
})

test('[integration] learning preset force-upgrades legacy workspaces and is idempotent', async () => {
  const {
    companyId, ownerId, customId, customRoomId, ownerDocumentId, ownerCardId, ownerEventId,
  } = await seedLegacyWorkspace()
  await onboardStarterAgents(companyId)

  const agents = await pool.query<{
    id: string
    preset_key: string | null
    name: string
    role: string
    status: string
    avatar_url: string | null
    bio: string
    system_prompt: string
    tools: string[]
  }>(
    `SELECT id, preset_key, name, role, status, avatar_url, bio, system_prompt, tools FROM participants
      WHERE company_id = $1 AND kind = 'agent' ORDER BY preset_key NULLS LAST`,
    [companyId],
  )
  assert.deepEqual(
    agents.rows.filter((agent) => agent.preset_key).map((agent) => agent.preset_key).sort(),
    ['forge', 'milo', 'nova', 'sage', 'scout', 'trace'],
  )
  assert.ok(agents.rows.some((agent) => agent.id === customId && agent.preset_key === null))
  const presets = agents.rows.filter((agent) => agent.preset_key)
  assert.deepEqual(presets.map((agent) => agent.name), ['Forge', 'Milo', 'Nova', 'Sage', 'Scout', 'Trace'])
  assert.deepEqual(presets.map((agent) => agent.role), [
    '实践导师 · Practice Mentor',
    '解题陪练 · Problem Coach',
    '团队负责人 · Chief of Staff',
    '概念导师 · Concept Tutor',
    '阅读研究 · Research Guide',
    '错因诊断 · Learning Diagnostician',
  ])
  assert.ok(presets.every((agent) => agent.status === 'avail'))
  assert.ok(presets.every((agent) => agent.avatar_url === null))
  assert.ok(presets.every((agent) => agent.bio.length > 0 && agent.system_prompt.includes('next step')))
  assert.ok(presets.every((agent) => JSON.stringify(agent.tools) === JSON.stringify(['ipython'])))
  const agentIds = new Map(presets.map((agent) => [agent.preset_key, agent.id]))

  const rooms = await pool.query<{ id: string; preset_key: string; title: string; members: string[] }>(
    `SELECT id, preset_key, title, members FROM conversations
      WHERE company_id = $1 AND preset_key LIKE 'room:%' ORDER BY preset_key`,
    [companyId],
  )
  assert.deepEqual(rooms.rows.map((room) => room.title), ['Lab｜实践工坊', 'Study Room｜学习室'])
  assert.deepEqual(rooms.rows[0]?.members, [ownerId, agentIds.get('forge'), agentIds.get('scout'), agentIds.get('sage')])
  assert.deepEqual(rooms.rows[1]?.members, [ownerId, agentIds.get('nova'), agentIds.get('sage'), agentIds.get('milo'), agentIds.get('trace')])

  const dms = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM conversations WHERE company_id = $1 AND preset_key LIKE 'dm:%'`,
    [companyId],
  )
  assert.equal(dms.rows[0]?.n, 6)
  const welcomeProfiles = await pool.query<{
    preset_key: string
    leader_agent_id: string
    welcome: string
  }>(
    `SELECT preset_key, leader_agent_id, profile ->> 'welcome' AS welcome
       FROM im_channel_bindings
      WHERE company_id = $1 AND preset_key LIKE 'room:%'
      ORDER BY preset_key`,
    [companyId],
  )
  assert.deepEqual(welcomeProfiles.rows.map((profile) => [profile.preset_key, profile.leader_agent_id]), [
    ['room:lab', agentIds.get('forge')],
    ['room:study-room', agentIds.get('nova')],
  ])
  assert.match(welcomeProfiles.rows[0]?.welcome ?? '', /论文|代码|实验/)
  assert.match(welcomeProfiles.rows[1]?.welcome ?? '', /复习计划|概念/)

  const custom = await pool.query<{ members: string[] }>(`SELECT members FROM conversations WHERE id = $1`, [customRoomId])
  assert.deepEqual(custom.rows[0]?.members, [ownerId, customId])
  const customMessages = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM messages WHERE conversation_id = $1 ORDER BY sequence`,
    [customRoomId],
  )
  assert.deepEqual(customMessages.rows.map((message) => message.author_id), [ownerId])

  const documents = await pool.query<{ id: string }>(
    `SELECT id FROM documents WHERE company_id = $1 ORDER BY id`,
    [companyId],
  )
  assert.deepEqual(documents.rows.map((document) => document.id), [ownerDocumentId])
  const documentUpdates = await pool.query<{ author_id: string }>(
    `SELECT author_id FROM document_updates WHERE document_id = $1`,
    [ownerDocumentId],
  )
  assert.deepEqual(documentUpdates.rows.map((update) => update.author_id), [ownerId])
  const cards = await pool.query<{ id: string; assignee_id: string | null }>(
    `SELECT id, assignee_id FROM board_cards WHERE board_id IN (SELECT id FROM boards WHERE company_id = $1)`,
    [companyId],
  )
  assert.deepEqual(cards.rows, [{ id: ownerCardId, assignee_id: null }])
  const events = await pool.query<{ id: string; assignee_id: string | null }>(
    `SELECT id, assignee_id FROM calendar_events WHERE company_id = $1`,
    [companyId],
  )
  assert.deepEqual(events.rows, [{ id: ownerEventId, assignee_id: null }])
  const workspaceRows = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM agent_workspace WHERE company_id = $1 AND agent_id = 'atlas'`,
    [companyId],
  )
  assert.equal(workspaceRows.rows[0]?.n, 0)

  const company = await pool.query<{ starter_preset_version: number; all_hands_conversation_id: string | null }>(
    `SELECT starter_preset_version, all_hands_conversation_id FROM companies WHERE id = $1`,
    [companyId],
  )
  assert.equal(company.rows[0]?.starter_preset_version, LEARNING_PRESET_VERSION)
  assert.equal(company.rows[0]?.all_hands_conversation_id, null)

  const before = await pool.query<{ agents: number; conversations: number; messages: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM participants WHERE company_id = $1 AND kind = 'agent') AS agents,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id = $1) AS conversations,
       (SELECT COUNT(*)::int FROM messages WHERE company_id = $1) AS messages`,
    [companyId],
  )
  await onboardStarterAgents(companyId)
  const after = await pool.query<{ agents: number; conversations: number; messages: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM participants WHERE company_id = $1 AND kind = 'agent') AS agents,
       (SELECT COUNT(*)::int FROM conversations WHERE company_id = $1) AS conversations,
       (SELECT COUNT(*)::int FROM messages WHERE company_id = $1) AS messages`,
    [companyId],
  )
  assert.deepEqual(after.rows[0], before.rows[0])
})

test('[integration] v4 refresh preserves learning-agent identity and removes only retired built-ins', async () => {
  const { companyId, ownerId } = await seedEmptyWorkspace()
  await onboardStarterAgents(companyId)

  const before = await pool.query<{ id: string; preset_key: string }>(
    `SELECT id, preset_key FROM participants
      WHERE company_id=$1 AND kind='agent' AND preset_key IS NOT NULL
      ORDER BY preset_key`,
    [companyId],
  )
  const novaId = before.rows.find((agent) => agent.preset_key === 'nova')?.id
  assert.ok(novaId)
  await pool.query(`UPDATE companies SET starter_preset_version=3 WHERE id=$1`, [companyId])
  await pool.query(`UPDATE participants SET system_prompt='v3 prompt' WHERE id=$1`, [novaId])
  await pool.query(
    `INSERT INTO agent_workspace (agent_id, path, body, company_id)
     VALUES ($1, 'memory/keep.md', 'keep this learning history', $2)`,
    [novaId, companyId],
  )

  const retiredId = `atlas-${randomUUID().slice(0, 8)}`
  const customId = `custom-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO participants (id, preset_key, company_id, kind, name, role, initial, avatar_bg, status, system_prompt)
     VALUES ($1, 'atlas-retired', $3, 'agent', 'Atlas', 'retired', 'A', '#bbb', 'avail', 'retired'),
            ($2, NULL, $3, 'agent', 'Custom', 'custom', 'C', '#ccc', 'avail', 'custom')`,
    [retiredId, customId, companyId],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, company_id)
     VALUES ($1, 'direct', 'Atlas', $2::jsonb, $3)`,
    [`direct-${retiredId}`, JSON.stringify([ownerId, retiredId]), companyId],
  )

  await onboardStarterAgents(companyId)

  const after = await pool.query<{ id: string; preset_key: string }>(
    `SELECT id, preset_key FROM participants
      WHERE company_id=$1 AND kind='agent' AND preset_key IS NOT NULL
      ORDER BY preset_key`,
    [companyId],
  )
  assert.deepEqual(after.rows, before.rows)
  const refreshed = await pool.query<{ system_prompt: string; tools: string[] }>(
    `SELECT system_prompt, tools FROM participants WHERE id=$1`,
    [novaId],
  )
  assert.match(refreshed.rows[0]?.system_prompt ?? '', /loop\.canvas\.start_workspace/)
  assert.deepEqual(refreshed.rows[0]?.tools, ['ipython'])
  const survivors = await pool.query<{ id: string }>(
    `SELECT id FROM participants WHERE company_id=$1 AND id=ANY($2::text[]) ORDER BY id`,
    [companyId, [retiredId, customId]],
  )
  assert.deepEqual(survivors.rows.map((row) => row.id), [customId])
  const memory = await pool.query<{ body: string }>(
    `SELECT body FROM agent_workspace WHERE company_id=$1 AND agent_id=$2 AND path='memory/keep.md'`,
    [companyId, novaId],
  )
  assert.equal(memory.rows[0]?.body, 'keep this learning history')
})
