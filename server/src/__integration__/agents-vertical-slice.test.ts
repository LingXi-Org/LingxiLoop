import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { ForbiddenError } from '../modules/access/public.js'
import { AgentApplication, AgentApplicationError } from '../modules/agents/application.js'
import { ParticipantPresenceApplication } from '../modules/agents/presence-application.js'
import { ContextThreadsApplication } from '../modules/context-threads/application.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

const contextThreads = new ContextThreadsApplication({
  transaction: (work) => withTransaction(pool, work),
  syncChannel: async () => undefined,
  assertCanManageLearning: async () => undefined,
  assertCanWriteConversation: async () => undefined,
  isActiveProjectStudent: async () => true,
})

const application = new AgentApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  invalidatePersona: () => undefined,
  assertNotManaged: async () => undefined,
  assertVisible: async () => undefined,
  openLearningThreadForAgent: async (scope, agentId) => {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM projects WHERE company_id=$1 AND is_default=TRUE AND status='ACTIVE'`,
      [scope.companyId],
    )
    return contextThreads.createLearningThread({ ...scope, projectId: rows[0]!.id }, agentId)
  },
}, 60_000)

async function fixture() {
  const seeded = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', seeded.companyId, { displayName: 'Owner' })
  return seeded
}

test('[integration] agent creation atomically seeds strict identity, Bloub persistence, and learning ContextThread', async () => {
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

  const { rows: persona } = await pool.query<{ system_prompt: string }>(
    `SELECT system_prompt FROM participants WHERE id=$1 AND company_id=$2`, [created.id, companyId],
  )
  assert.equal(persona[0]?.system_prompt, 'You verify primary evidence before answering.')
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
  const { rows: threads } = await pool.query<{ context_type: string; participant_ids: string[] }>(
    `SELECT thread.context_type,jsonb_agg(member.participant_id ORDER BY member.participant_id) AS participant_ids
       FROM context_threads thread
       JOIN context_thread_participants member ON member.thread_id=thread.id
      WHERE thread.channel_id=$1
      GROUP BY thread.id`,
    [directs[0]?.id],
  )
  assert.equal(threads[0]?.context_type, 'LEARNING')
  assert.deepEqual(threads[0]?.participant_ids, ['test-owner', created.id].sort())

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
    (error: unknown) => (error instanceof AgentApplicationError && error.code === 'not_found') || error instanceof ForbiddenError,
  )
})

test('[integration] human presence never updates the same participant id in another tenant', async () => {
  const first = await seedCompanyWithAgent()
  const second = await seedCompanyWithAgent()
  const userId = 'shared-presence-user'
  await seedUserMembership(userId, first.companyId)
  await pool.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,departed_at)
    VALUES($1,$2,'human','Former member','F','#abcdef','resting',NOW())`,[userId,second.companyId])
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
