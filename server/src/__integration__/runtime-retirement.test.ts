import assert from 'node:assert/strict'
import { releaseVersions } from '@lyyzka/lingxios'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { WukongWebhookApplication } from '../im/webhook-application.js'
import {
  buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables,
  seedCompanyWithAgent, seedUserMembership, teardownAll,
} from './_helpers.js'

let server: Server
let baseUrl: string
before(async () => {
  await ensureSchemaOnce()
  server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})
beforeEach(async () => { installFakeWukong(); await resetAllTables() })
after(async () => { await teardownAll(server) })

test('committed messages remain idempotent and attachments ingest without old Agent work', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query(
    `INSERT INTO conversations(id,company_id,project_id,kind,title,members)
     VALUES('retirement-room',$1,$2,'group','Room',$3::jsonb)`,
    [companyId, projectId, JSON.stringify(['test-owner', agentId])],
  )
  await pool.query(
    `INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id)
     VALUES('retirement-room',$1,$2::jsonb,$3)`,
    [companyId, JSON.stringify({ members: ['test-owner', agentId], channelType: 2 }), agentId],
  )
  const ingestions: unknown[] = []
  const wakes: unknown[] = []
  const flushes: string[] = []
  let failFlush = true
  const application = new WukongWebhookApplication({
    transaction: (work) => withTransaction(pool, work),
    verify: () => true,
    isKnowledgeAttachment: () => true,
    createKnowledgeJob: async (_db, input) => {
      ingestions.push(input)
      return { sourceId: 'attachment-source', deferAgentWake: true }
    },
    enqueueAgentWakes: async (_db, input) => { wakes.push(input); return 1 },
    flushAgentWakes: async (eventId) => {
      flushes.push(eventId)
      if (failFlush) { failFlush = false; throw new Error('injected post-commit runtime outage') }
      return 0
    },
  })
  const event = {
    raw: Buffer.from('committed attachment'), eventId: 'retirement-event', eventType: 'msg.notify',
    channelId: 'retirement-room', clientMsgNo: 'retirement-message', fromUid: 'test-owner',
    payload: {
      version: 1 as const, kind: 'attachment' as const, clientMsgNo: 'retirement-message',
      data: { key: `attachments/${companyId}/notes.pdf`, mime: 'application/pdf', size: 128, name: 'notes.pdf' },
    },
  }
  await assert.rejects(application.process(event), /injected post-commit runtime outage/)
  assert.deepEqual(await application.process(event), { ok: true, duplicate: true })
  assert.deepEqual(ingestions, [{
    companyId, projectId, conversationId: 'retirement-room', clientMsgNo: 'retirement-message',
    createdBy: 'test-owner', title: 'notes.pdf', mime: 'application/pdf', size: 128,
    storageKey: `attachments/${companyId}/notes.pdf`, recipients: [{ agentId, reason: 'knowledge_ready' }],
  }])
  assert.deepEqual(wakes, [{ eventId: 'retirement-event', companyId, channelId: 'retirement-room',
    clientMsgNo: 'retirement-message', payload: event.payload, recipients: [agentId], knowledgeSourceId: 'attachment-source' }])
  assert.deepEqual(flushes, ['retirement-event', 'retirement-event'])
  assert.deepEqual((await pool.query(`SELECT to_regclass('public.agent_work_items') AS retired_queue`)).rows, [{ retired_queue: null }])
  await assert.rejects(application.process({ ...event, raw: Buffer.from('different') }), /different payload/)
  await assert.rejects(application.process({ ...event, eventId: 'outsider', fromUid: 'outsider' }), /not a bound channel member/)

  const headers = { 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId }
  const canvas = await fetch(`${baseUrl}/api/conversations/retirement-room/canvas`, { method: 'POST', headers })
  assert.equal(canvas.status, 201)
  const { id } = await canvas.json() as { id: string }
  const assignment = await fetch(`${baseUrl}/api/canvases/${id}/assignments`, {
    method: 'POST', headers, body: JSON.stringify({ agentId, assignment: 'Use the native published runtime queue' }),
  })
  assert.equal(assignment.status, 200)
  assert.deepEqual((await pool.query(`SELECT to_regclass('public.agent_work_items') AS retired_queue`)).rows, [{ retired_queue: null }])
  const binding = (await pool.query<{ run_id: string; session_id: string }>('SELECT run_id,session_id FROM agent_run_bindings WHERE company_id=$1 AND conversation_id=$2', [companyId,'retirement-room'])).rows[0]
  assert.ok(binding)
  assert.notEqual(binding.session_id,'retirement-room')
  const runs = await (await lingxiOSControl()).listRuns({ tenantId: companyId,id: binding.run_id,agentId,principalId: 'test-owner' })
  assert.equal(runs.items[0]?.kind,'canvas_worker')
  assert.equal(runs.items[0]?.status,'queued')
  const meta = await fetch(`${baseUrl}/api/meta`)
  assert.deepEqual((await meta.json() as { reasoningRuntime: unknown }).reasoningRuntime, { name: '@lyyzka/lingxios',...releaseVersions })
})
