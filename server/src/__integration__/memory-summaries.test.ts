import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, before, test } from 'node:test'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import {
  buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables,
  seedCompanyWithAgent, seedUserMembership, teardownAll,
} from './_helpers.js'

let server: Server, baseUrl: string
before(async () => {
  await ensureSchemaOnce(); await resetAllTables(); installFakeWukong()
  server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}/api/im`
})
after(async () => { await teardownAll(server) })

test('read-only memory summaries paginate native scopes and isolate tenants, projects, principals, threads and revoked audiences', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await seedUserMembership('memory-other', companyId)
  const conversationId = 'memory-summary-room', members = ['test-owner', 'memory-other', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'group','Memory summaries',$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const app = await lingxiOSControl(), memory = app.memory
  assert.ok(memory)
  const policy = await syncConversationPolicy(app, companyId, conversationId)
  const headers = { 'x-company-id': companyId, 'x-project-id': projectId }
  const url = `${baseUrl}/channels/${conversationId}/memories`
  const initial = await fetch(url, { headers })
  assert.equal(initial.status, 200)
  assert.deepEqual(await initial.json(), { items: [], nextCursor: null })

  async function seedRun(principalId: string, messageId: string, threadId?: string) {
    const accepted = await app.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
      messageId, version: 1, author: { id: principalId, kind: 'human' }, text: 'Remember this checked fact', mentions: [agentId],
      ...(threadId ? { threadId } : {}) }, { mode: 'execute', executionClass: 'operation' })
    const run = accepted.runs[0]; assert.ok(run)
    await bindProductRun(pool, run, conversationId)
    return { ...run, workId: run.runId }
  }
  const identity = await seedRun('test-owner', 'summary-owner')
  const scopes = await memory.scopes(identity)
  const content = (description: string) => ({ path: `notes/${description}.md`, title: description,
    description, body: 'PRIVATE BODY MUST NOT LEAK', layer: 'reference' as const })
  for (let offset = 0; offset < 31; offset += 12) {
    await memory.initialize(identity, { scope: scopes[0], documents: Array.from({ length: Math.min(12, 31 - offset) },
      (_, index) => content(`summary-${String(offset + index).padStart(2, '0')}`)),
    idempotencyKey: `summary-seed-${offset}`, sourceRef: 'summary-owner' })
  }
  await memory.initialize(identity, { scope: scopes[1], documents: [content('course-summary')],
    idempotencyKey: 'summary-course', sourceRef: 'summary-owner' })
  const other = await seedRun('memory-other', 'summary-other')
  await memory.initialize(other, { scope: (await memory.scopes(other))[0], documents: [content('other-private-summary')],
    idempotencyKey: 'summary-other', sourceRef: 'summary-other' })

  const first = await fetch(url, { headers })
  assert.equal(first.status, 200)
  assert.equal(first.headers.get('cache-control'), 'no-store')
  type Page = { items: Array<{ id: string; text: string; agentId: string; agentName: string }>; nextCursor: string | null }
  const firstPage = await first.json() as Page
  assert.equal(firstPage.items.length, 30); assert.ok(firstPage.nextCursor)
  const second = await fetch(`${url}?${new URLSearchParams({ cursor: firstPage.nextCursor })}`, { headers })
  assert.equal(second.status, 200)
  const secondPage = await second.json() as Page
  assert.equal(secondPage.nextCursor, null)
  const items = [...firstPage.items, ...secondPage.items]
  assert.equal(items.length, 32)
  assert.equal(new Set(items.map(item => item.id)).size, 32)
  assert.deepEqual(items.map(item => item.text).sort(), [...Array.from({ length: 31 }, (_, index) => `summary-${String(index).padStart(2, '0')}`), 'course-summary'].sort())
  assert.ok(items.every(item => item.agentId === agentId && Object.keys(item).sort().join(',') === 'agentId,agentName,id,text'))
  assert.doesNotMatch(JSON.stringify(items), /PRIVATE|sources|body|other-private/)

  await app.conversations.registerThread({ tenantId: companyId, conversationId, threadId: 'summary-thread', policyVersion: policy.version })
  const threaded = await seedRun('test-owner', 'summary-thread-message', 'summary-thread')
  await memory.initialize(threaded, { scope: (await memory.scopes(threaded))[0], documents: [content('thread-summary')],
    idempotencyKey: 'summary-thread', sourceRef: 'summary-thread-message' })
  const threadPage = await (await fetch(`${url}?threadId=summary-thread`, { headers })).json() as Page
  assert.deepEqual(threadPage.items.map(item => item.text), ['thread-summary'])
  assert.equal((await fetch(`${url}?${new URLSearchParams({ threadId: 'summary-thread', cursor: firstPage.nextCursor })}`, { headers })).status, 400)
  assert.equal((await fetch(`${url}?principalId=memory-other`, { headers })).status, 400)
  assert.equal((await fetch(`${url}?cursor=invalid`, { headers })).status, 400)
  assert.equal((await fetch(url, { headers: { ...headers, 'x-project-id': 'other-project' } })).status, 403)
  assert.equal((await fetch(url, { headers: { ...headers, 'x-company-id': 'other-tenant' } })).status, 404)
  assert.equal((await fetch(url, { headers, method: 'DELETE' })).status, 404)

  const reduced = JSON.stringify(['test-owner', agentId])
  await pool.query('UPDATE conversations SET members=$2::jsonb WHERE id=$1', [conversationId, reduced])
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1", [conversationId, reduced])
  await syncConversationPolicy(app, companyId, conversationId)
  const revokedAudience = await fetch(url, { headers })
  assert.notEqual(revokedAudience.status, 200, 'native frozen audiences are reauthorized before every read')
  assert.doesNotMatch(await revokedAudience.text(), /summary-00|PRIVATE BODY/)
  await pool.query('UPDATE conversations SET members=$2::jsonb WHERE id=$1', [conversationId, JSON.stringify([agentId])])
  assert.equal((await fetch(url, { headers })).status, 403)
})
