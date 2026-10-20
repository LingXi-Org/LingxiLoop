import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { releaseVersions } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model: docs/evidence/issue-215-public/FAILURE-MODEL.md, cases 1/6.
before(async () => { await ensureSchemaOnce(); await resetAllTables(); installFakeWukong() })
after(async () => { await teardownAll() })

test('loaded IM anchors recover stopped runs beyond recent 20 through scoped stable history pages', { timeout: 30000 }, async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const principalId = 'issue215-history-human', conversationId = 'issue215-history-room'
  await seedUserMembership(principalId, companyId, { role: 'STUDENT', isAdmin: false })
  await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'STUDENT')", [projectId,companyId,principalId])
  const members = [principalId, agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)", [conversationId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [conversationId,companyId,JSON.stringify({ channelType: 2,members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,companyId,conversationId)
  const runs: string[] = [], sources: string[] = []
  for (let index = 0; index < 24; index++) {
    const source = `issue215-history-source-${index}`
    const accepted = await api.conversations.ingest({ tenantId: companyId,conversationId,policyVersion: policy.version,
      messageId: source,version: 1,author: { id: principalId,kind: 'human' },text: 'Synthetic history request.',mentions: [agentId] },
    { mode: 'chat',codeExecution: 'disabled',executionClass: 'conversation' })
    const run = accepted.runs[0]; assert.ok(run)
    await bindProductRun(pool,run,conversationId,false,source)
    await api.cancel(run)
    runs.push(run.runId); sources.push(source)
  }
  const server = createServer(await buildApiTestApp(principalId))
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  try {
    const address = server.address(); assert.ok(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}/api/im/channels/${conversationId}/runs`
    const headers = { 'content-type': 'application/json','x-company-id': companyId,'x-project-id': projectId }
    const recent = await (await fetch(base,{ headers })).json() as { runId: string }[]
    assert.equal(recent.length,20); assert.ok(!recent.some(run => run.runId === runs[0]))
    const history = (body: unknown, override: Record<string,string> = {}) => fetch(base,{ method: 'POST',headers: { ...headers,...override },body: JSON.stringify(body) })
    const first = await history({ sourceClientMsgNos: [sources[0]],runIds: [] })
    assert.equal(first.status,200,'history anchors must discover an old stopped run; recent-20 is insufficient')
    const old = await first.json() as { runs: { runId: string; status: string }[]; nextCursor: string | null }
    assert.deepEqual(old.runs.map(run => [run.runId,run.status]),[[runs[0],'cancelled']]); assert.equal(old.nextCursor,null)
    const ids: string[] = []; let cursor: string | undefined
    do {
      const response = await history({ sourceClientMsgNos: sources,runIds: [],...(cursor ? { cursor } : {}) })
      assert.equal(response.status,200)
      const page = await response.json() as { runs: { runId: string }[]; nextCursor: string | null }
      assert.ok(page.runs.length <= 20); ids.push(...page.runs.map(run => run.runId))
      if (page.nextCursor) {
        assert.notEqual(page.nextCursor,cursor)
        assert.equal((await history({ sourceClientMsgNos: [sources[0]],runIds: [],cursor: page.nextCursor })).status,400,'cursor is bound to this anchor set')
      }
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    assert.deepEqual(ids,[...runs].reverse()); assert.equal(new Set(ids).size,24)
    const reference = await history({ sourceClientMsgNos: [],runIds: [runs[0]] })
    assert.deepEqual(((await reference.json()) as typeof old).runs.map(run => run.runId),[runs[0]])
    assert.equal((await history({ sourceClientMsgNos: [],runIds: [] })).status,400)
    assert.equal((await history({ sourceClientMsgNos: sources,runIds: [],cursor: 'invalid' })).status,400)
    assert.notEqual((await history({ sourceClientMsgNos: sources,runIds: [] },{ 'x-company-id': 'other-company' })).status,200)
    assert.notEqual((await history({ sourceClientMsgNos: sources,runIds: [] },{ 'x-project-id': 'other-project' })).status,200)
    await pool.query('UPDATE agent_run_bindings SET internal=TRUE WHERE run_id=$1',[runs[0]])
    assert.deepEqual(((await (await history({ sourceClientMsgNos: [sources[0]],runIds: [runs[0]] })).json()) as typeof old).runs,[])
    await pool.query('UPDATE agent_run_bindings SET internal=FALSE,principal_id=$2 WHERE run_id=$1',[runs[0],'another-person'])
    assert.deepEqual(((await (await history({ sourceClientMsgNos: [sources[0]],runIds: [runs[0]] })).json()) as typeof old).runs,[])
    await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2',[projectId,principalId])
    assert.notEqual((await history({ sourceClientMsgNos: sources,runIds: [] })).status,200)
    await mkdir('artifacts/issue215-public',{ recursive: true })
    await writeFile('artifacts/issue215-public/history.json',JSON.stringify({ runtime: releaseVersions.runtime,passed: true,
      recent: 20,recovered: ids.length,pageLimit: 20,oldStoppedRecovered: true,scopeDenials: true,realLocalPostgres: true,productionRequests: 0 },null,2))
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
