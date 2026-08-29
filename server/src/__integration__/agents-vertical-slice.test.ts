import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { AgentApplication, AgentApplicationError } from '../modules/agents/application.js'
import { ParticipantPresenceApplication } from '../modules/agents/presence-application.js'
import { ConversationsApplication } from '../modules/conversations/application.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

const conversations = new ConversationsApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  syncChannel: async () => undefined,
  publishUpdated: async () => undefined,
  publishTyping: async () => undefined,
  isTeacherRoom: async () => false,
  postMembershipMessage: async () => undefined,
  clearReplyHold: async () => undefined,
})

const application = new AgentApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  computeAddress: (id, slug) => `${id}.${slug}@agents.test`,
  invalidatePersona: () => undefined,
  assertNotManaged: async () => undefined,
  assertVisible: async () => undefined,
  openDirectForAgent: (scope, agentId) => conversations.openDirectForNewAgent(scope, agentId),
}, 60_000)

async function fixture() {
  const seeded = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', seeded.companyId, { displayName: 'Owner' })
  return seeded
}

test('[integration] agent creation atomically seeds strict identity, Bloub persistence, and direct chat', async () => {
  const { companyId, projectId } = await fixture()
  const created = await application.create({ companyId, userId: 'test-owner' }, {
    name: 'Research Guide', role: 'researcher', bio: 'Evidence first',
    systemPrompt: 'You verify primary evidence before answering.',
    capabilities: ['web', 'knowledge'],
  })
  const { rows: agents } = await pool.query<{
    avatar_url: string | null; avatar_bg: string; tools: string[]; capabilities: string[]
  }>(`SELECT avatar_url,avatar_bg,tools,capabilities FROM participants WHERE id=$1 AND company_id=$2`, [created.id, companyId])
  assert.equal(agents[0]?.avatar_url, null)
  assert.equal(agents[0]?.avatar_bg, 'transparent')
  assert.deepEqual(agents[0]?.tools, ['ipython'])
  assert.deepEqual(agents[0]?.capabilities, ['web', 'knowledge'])

  const { rows: workspace } = await pool.query<{ path: string }>(
    `SELECT path FROM agent_workspace WHERE agent_id=$1 AND company_id=$2 ORDER BY path`, [created.id, companyId],
  )
  assert.deepEqual(workspace.map((row) => row.path), ['IDENTITY.md', 'SOUL.md'])
  const { rows: directs } = await pool.query<{ id: string; members: string[]; project_id: string }>(
    `SELECT id,members,project_id FROM conversations
      WHERE company_id=$1 AND kind='direct' AND members@>to_jsonb(ARRAY[$2::text])`,
    [companyId, created.id],
  )
  assert.deepEqual(directs[0]?.members.sort(), ['test-owner', created.id].sort())
  assert.equal(directs[0]?.project_id, projectId)
  const { rows: bindings } = await pool.query(
    `SELECT 1 FROM im_channel_bindings WHERE company_id=$1 AND channel_id=$2`,
    [companyId, directs[0]?.id],
  )
  assert.equal(bindings.length, 1)

  const participants = await application.participants({ companyId, projectId, userId: 'test-owner' })
  const agent = participants.find((participant) => participant.id === created.id)
  assert.equal(agent?.avatarUrl, null)
  assert.equal(agent?.avatarBg, 'transparent')
})

test('[integration] lifecycle is tenant scoped and refuses to offboard a group leader', async () => {
  const { companyId } = await fixture()
  const created = await application.create({ companyId, userId: 'test-owner' }, {
    name: 'Team Lead', role: '', bio: '', systemPrompt: 'You coordinate a small evidence-backed team.',
    capabilities: ['canvas'],
  })
  await pool.query(
    `INSERT INTO conversations (id,kind,title,members,leader_id,company_id)
     VALUES ('led-room','group','Led room',$1::jsonb,$2,$3)`,
    [JSON.stringify(['test-owner', created.id]), created.id, companyId],
  )
  await assert.rejects(
    application.offboard({ companyId, userId: 'test-owner' }, created.id),
    (error: unknown) => error instanceof AgentApplicationError && error.code === 'conflict',
  )
  await pool.query(`UPDATE conversations SET leader_id=NULL WHERE id='led-room' AND company_id=$1`, [companyId])
  await application.offboard({ companyId, userId: 'test-owner' }, created.id)
  await application.rehire({ companyId, userId: 'test-owner' }, created.id)

  const other = await seedCompanyWithAgent()
  await assert.rejects(
    application.update({ companyId: other.companyId, userId: 'test-owner' }, created.id, { name: 'Cross tenant' }),
    (error: unknown) => error instanceof AgentApplicationError && error.code === 'not_found',
  )
})

test('[integration] human presence never updates the same participant id in another tenant', async () => {
  const first = await seedCompanyWithAgent()
  const second = await seedCompanyWithAgent()
  const userId = 'shared-presence-user'
  await seedUserMembership(userId, first.companyId)
  await seedUserMembership(userId, second.companyId)
  await pool.query(
    `UPDATE participants SET status='resting' WHERE id=$1 AND company_id=ANY($2::text[])`,
    [userId, [first.companyId, second.companyId]],
  )
  const events: string[] = []
  const presence = new ParticipantPresenceApplication(pool, {
    publish: async (event) => { events.push(event.companyId) },
  })

  await presence.setHumanPresence({
    companyIds: [first.companyId], participantId: userId, status: 'avail',
  })

  const { rows } = await pool.query<{ company_id: string; status: string }>(
    `SELECT company_id,status FROM participants WHERE id=$1 ORDER BY company_id`,
    [userId],
  )
  assert.deepEqual(rows, [
    { company_id: first.companyId, status: 'avail' },
    { company_id: second.companyId, status: 'resting' },
  ].sort((a, b) => a.company_id.localeCompare(b.company_id)))
  assert.deepEqual(events, [first.companyId])
})

test('[integration] Agent CLI directory is tenant scoped through the Agents public facade', async () => {
  const { companyId, agentId } = await fixture()
  const teammateId = 'directory-teammate'
  await pool.query(
    `INSERT INTO participants (id, company_id, kind, name, role, initial, avatar_bg, status)
     VALUES ($1, $2, 'agent', 'Directory Teammate', 'designer', 'D', 'transparent', 'working')`,
    [teammateId, companyId],
  )
  const foreign = await seedCompanyWithAgent({ agentId: 'foreign-directory-agent' })
  await pool.query(
    `INSERT INTO conversations (id, kind, title, members, company_id)
     VALUES ('directory-room', 'group', 'Directory Room', $1::jsonb, $2)`,
    [JSON.stringify([agentId, teammateId]), companyId],
  )
  const { runCli } = await import('../agents/cli.js')

  const participants = await runCli(['participants', '--json', '--as', agentId])
  assert.equal(participants.ok, true, participants.text)
  const participantIds = (JSON.parse(participants.text) as Array<{ id: string }>).map((row) => row.id)
  assert.ok(participantIds.includes(agentId))
  assert.ok(participantIds.includes(teammateId))
  assert.ok(!participantIds.includes(foreign.agentId))

  const statuses = await runCli(['participants-status', '--json', '--as', agentId])
  assert.equal(statuses.ok, true, statuses.text)
  assert.ok(!(JSON.parse(statuses.text) as Array<{ id: string }>).some((row) => row.id === foreign.agentId))

  const identity = await runCli(['whoami', '--json', '--as', agentId])
  assert.equal(identity.ok, true, identity.text)
  assert.equal((JSON.parse(identity.text) as { id: string }).id, agentId)
  assert.equal('companyId' in (JSON.parse(identity.text) as Record<string, unknown>), false)
  const textIdentity = await runCli(['whoami', '--as', agentId])
  assert.match(textIdentity.text, /Directory Room/)
})
