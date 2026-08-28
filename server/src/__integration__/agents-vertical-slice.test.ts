import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { AgentApplication, AgentApplicationError } from '../modules/agents/application.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

const application = new AgentApplication(pool, {
  transaction: (work) => withTransaction(pool, work),
  computeAddress: (id, slug) => `${id}.${slug}@agents.test`,
  invalidatePersona: () => undefined,
  assertNotManaged: async () => undefined,
  assertVisible: async () => undefined,
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
  const { rows: directs } = await pool.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE company_id=$1 AND kind='direct' AND members@>to_jsonb(ARRAY[$2::text])`,
    [companyId, created.id],
  )
  assert.deepEqual(directs[0]?.members.sort(), ['test-owner', created.id].sort())

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
