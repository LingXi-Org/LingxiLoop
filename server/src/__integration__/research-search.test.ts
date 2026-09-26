import assert from 'node:assert/strict'
import { after, before, mock, test } from 'node:test'
import type { ActionContext } from '@lyyzka/lingxios'

// Exercise the real product authorization and tool with a deterministic upstream.
// Missing capability, foreign tenant and revoked membership must never search.
let requests = 0
mock.module('../modules/research/fetch.js', { namedExports: {
  fetchResearch: async (url: string) => {
    requests++
    assert.equal(new URL(url).host, 'www.so.com')
    return { url, contentType: 'text/html', body: Buffer.from('<title>教育_360搜索</title><ul><li class="res-list"><h3 class="res-title"><a data-mdurl="https://www.gov.cn/education" href="https://www.so.com/link?m=opaque">教育资料</a></h3><p class="res-desc">公开的教育资料摘要</p></li></ul>') }
  },
} })
const { pool } = await import('../db/pool.js')
const { researchTools } = await import('../modules/research/agent-tools.js')
const { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } = await import('./_helpers.js')
before(async () => { await ensureSchemaOnce(); await resetAllTables() })
after(async () => { await teardownAll() })

test('authorized research.search returns domestic-engine cards and denies unauthorized callers', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const room = 'research-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Research',$4::jsonb)`, [room, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)', [room, companyId, JSON.stringify({ channelType: 2, members }), agentId])
  await pool.query(`UPDATE participants SET capabilities='["web"]'::jsonb WHERE id=$1`, [agentId])
  const tool = researchTools.find(item => item.action === 'research.search')!
  const input = tool.parse({ query: '教育', limit: 1 })
  const context = { database: pool, signal: AbortSignal.timeout(5000), requestVersion: 1,
    work: { id: 'research-run', tenantId: companyId, agentId, principalId: 'test-owner', sessionId: 'research-session',
      kind: 'turn', lane: 'interactive', createdAt: new Date().toISOString(), meta: { conversationId: room } },
    action: { runId: 'research-run', cellId: 'search', callIndex: 0, action: 'research.search', args: input, idempotencyKey: 'search' },
  } as unknown as ActionContext
  await tool.authorize(context, input)
  assert.deepEqual(await tool.execute(context, input), { ok: true, value: { provider: '360搜索', query: '教育', results: [
    { title: '教育资料', url: 'https://www.gov.cn/education', snippet: '公开的教育资料摘要', source: '360搜索' },
  ] } })
  await assert.rejects(tool.authorize({ ...context, work: { ...context.work, tenantId: 'foreign' } }, input))
  await pool.query(`UPDATE participants SET capabilities='[]'::jsonb WHERE id=$1`, [agentId])
  await assert.rejects(tool.authorize(context, input))
  await pool.query(`UPDATE participants SET capabilities='["web"]'::jsonb,departed_at=NOW() WHERE id=$1`, [agentId])
  await assert.rejects(tool.authorize(context, input))
  assert.equal(requests, 1)
})
