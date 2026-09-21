import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import { after, before, test } from 'node:test'
import { WebSocket } from 'ws'
import { pool } from '../db/pool.js'
import { attachWebSocket } from '../ws.js'
import { createWsTicket } from '../modules/identity/public.js'
import { bindProductRun, notifyRunAvailable } from '../agent-runtime/identity.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce(); await resetAllTables() })
after(async () => { await teardownAll() })

test('run binding notifies only its authorized principal, deduplicates and rechecks project access', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await seedUserMembership('peer', companyId, { role: 'STUDENT' })
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role)
    VALUES($1,$2,'peer','STUDENT') ON CONFLICT DO NOTHING`, [companyId, projectId])
  const conversationId = 'notice-room', members = ['test-owner', 'peer', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'group','Notice',$4::jsonb)`, [conversationId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
  const server = createServer(await buildApiTestApp('test-owner'))
  const sockets = attachWebSocket(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const opened: WebSocket[] = [], received = new Map<string, Record<string, unknown>[]>()
  try {
    for (const user of ['test-owner', 'peer']) {
      const { ticket } = await createWsTicket(user)
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws?t=${encodeURIComponent(ticket)}`)
      opened.push(socket)
      const events: Record<string, unknown>[] = []
      received.set(user, events)
      socket.on('message', raw => events.push(JSON.parse(raw.toString())))
      await once(socket, 'open')
      const deadline = Date.now() + 5000
      while (!events.some(event => event.type === 'hello') && Date.now() < deadline) await delay(10)
      assert.ok(events.some(event => event.type === 'hello'))
    }
    const identity = { tenantId: companyId, sessionId: 'notice-session', runId: 'notice-run', agentId, principalId: 'peer' }
    await bindProductRun(pool, identity, conversationId)
    const recipient = received.get('peer')!
    const deadline = Date.now() + 5000
    while (!recipient.some(event => event.type === 'agent.run.available') && Date.now() < deadline) await delay(10)
    assert.deepEqual(recipient.filter(event => event.type === 'agent.run.available'), [{ type: 'agent.run.available', companyId,
      conversationId, agentId, runId: identity.runId }])
    await bindProductRun(pool, identity, conversationId)
    await bindProductRun(pool, { ...identity, runId: 'internal' }, conversationId, true)
    await delay(100)
    assert.equal(recipient.filter(event => event.type === 'agent.run.available').length, 1)
    assert.equal(received.get('test-owner')!.filter(event => event.type === 'agent.run.available').length, 0)
    await notifyRunAvailable(identity, conversationId)
    const resumed = Date.now() + 5000
    while (recipient.filter(event => event.type === 'agent.run.available').length < 2 && Date.now() < resumed) await delay(10)
    assert.equal(recipient.filter(event => event.type === 'agent.run.available').length, 2)
    await pool.query('DELETE FROM project_memberships WHERE project_id=$1 AND user_id=$2', [projectId, 'peer'])
    await pool.query('UPDATE conversations SET members=$2::jsonb WHERE id=$1', [conversationId, JSON.stringify(['test-owner', agentId])])
    await notifyRunAvailable(identity, conversationId)
    await delay(200)
    assert.equal(recipient.filter(event => event.type === 'agent.run.available').length, 2)
  } finally {
    for (const socket of opened) socket.terminate()
    await new Promise<void>(resolve => sockets.close(() => resolve()))
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
