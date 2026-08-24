import assert from 'node:assert/strict'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import express from 'express'
import { agentOSControlRouter, executeActionWithLedger } from '../agent-os/control-plane.js'
import { executeLearningAction } from '../agent-os/learning-actions.js'
import type { AgentWorkItem, HostAction, LingxiMessageV1 } from '../agent-os/types.js'
import { pool } from '../db/pool.js'
import { wukongWebhookRouter } from '../im/webhook.js'
import { _setWukongClientForTests, WukongClient } from '../im/wukong.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const COMPANY = 'co-agent-os-reliability'
const AGENT = 'agent-agent-os-reliability'
const HUMAN = 'human-agent-os-reliability'
const CHANNEL = 'channel-agent-os-reliability'
const SERVICE_TOKEN = 'agent-os-reliability-service-token'
const WEBHOOK_SECRET = 'agent-os-reliability-webhook-secret'
let server: Server
let baseUrl = ''
const persistedClientMessages = new Set<string>()
let sendAttempts = 0

class IdempotentWukong extends WukongClient {
  override async sendMessage(_channelId: string, _channelType: number, _fromUid: string, payload: LingxiMessageV1) {
    sendAttempts += 1
    persistedClientMessages.add(payload.clientMsgNo)
    return { messageId: `wk-${payload.clientMsgNo}`, messageSeq: [...persistedClientMessages].indexOf(payload.clientMsgNo) + 1 }
  }
}

before(async () => {
  process.env.AGENT_OS_SERVICE_TOKEN = SERVICE_TOKEN
  _setWukongClientForTests(new IdempotentWukong({ apiUrl: 'http://unused', wsUrl: 'ws://unused', apiToken: 'test', webhookSecret: WEBHOOK_SECRET }))
  await ensureSchemaOnce()
  const app = express()
  app.use('/webhooks/wukong', wukongWebhookRouter)
  app.use(express.json())
  app.use('/internal/agent-os', agentOSControlRouter)
  app.use((error: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status ?? 500).json({ error: error.message })
  })
  await new Promise<void>((resolve) => {
    server = createServer(app).listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
})

beforeEach(async () => {
  await resetAllTables()
  persistedClientMessages.clear()
  sendAttempts = 0
  await pool.query(`INSERT INTO companies (id,name,slug) VALUES ($1,'Reliability','agent-os-reliability')`, [COMPANY])
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,status,capabilities)
     VALUES ($1,$3,'agent','Nova','coach','N','#6d5dfc','avail','["web"]'::jsonb),
            ($2,$3,'human','Learner','learner','L','#0078c8','avail','[]'::jsonb)`,
    [AGENT, HUMAN, COMPANY],
  )
  await pool.query(
    `INSERT INTO im_channel_bindings (channel_id,company_id,leader_agent_id,profile)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [CHANNEL, COMPANY, AGENT, JSON.stringify({ channelType: 2, members: [AGENT, HUMAN] })],
  )
})

after(async () => {
  _setWukongClientForTests(null)
  await teardownAll(server)
})

function webhookBody(eventId: string): string {
  return JSON.stringify({
    event_id: eventId,
    event_type: 'message.committed',
    message: {
      channel_id: CHANNEL, channel_type: 2, from_uid: HUMAN, client_msg_no: `msg-${eventId}`,
      payload: { version: 1, kind: 'text', clientMsgNo: `msg-${eventId}`, body: 'Help me study.' },
    },
  })
}

async function postWebhook(body: string): Promise<Response> {
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
  return fetch(`${baseUrl}/webhooks/wukong`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-wukong-signature': `sha256=${signature}` }, body,
  })
}

test('[integration] failed webhook dispatch rolls back its receipt and the same event retries', async () => {
  const eventId = `retry-${randomUUID()}`
  const body = webhookBody(eventId)
  await pool.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$1::jsonb) WHERE channel_id=$2`, [JSON.stringify([AGENT]), CHANNEL])
  const failed = await postWebhook(body)
  assert.equal(failed.status, 500)
  assert.equal((await pool.query(`SELECT 1 FROM wukong_webhook_receipts WHERE event_id=$1`, [eventId])).rowCount, 0)

  await pool.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$1::jsonb) WHERE channel_id=$2`, [JSON.stringify([AGENT, HUMAN]), CHANNEL])
  const retried = await postWebhook(body)
  assert.equal(retried.status, 200)
  assert.equal((await pool.query(`SELECT 1 FROM wukong_webhook_receipts WHERE event_id=$1 AND processed_at IS NOT NULL`, [eventId])).rowCount, 1)
  assert.equal((await pool.query(`SELECT 1 FROM agent_work_items WHERE trigger_client_msg_no=$1`, [`msg-${eventId}`])).rowCount, 1)
})

test('[integration] pending Host Action reuses its sink id after a post-side-effect crash', async () => {
  const work: AgentWorkItem = {
    id: `work-${randomUUID()}`, fence: 1, companyId: COMPANY, agentId: AGENT, channelId: CHANNEL,
    triggerClientMsgNo: 'trigger-host-action', reason: 'message', leaseToken: 'unused-direct-call',
  }
  await pool.query(
    `INSERT INTO agent_work_items (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason) VALUES ($1,$2,$3,$4,$5,$6)`,
    [work.id, COMPANY, AGENT, CHANNEL, work.triggerClientMsgNo, work.reason],
  )
  const action: HostAction = {
    runId: work.id, cellId: 'hop-1-call-1', callIndex: 0, action: 'chat.send', args: { body: 'Exactly once' },
    idempotencyKey: `${work.id}:hop-1-call-1:0`,
  }
  await pool.query(
    `INSERT INTO agent_host_actions (idempotency_key,work_id,run_id,cell_id,call_index,action,args,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'pending')`,
    [action.idempotencyKey, work.id, work.id, action.cellId, action.callIndex, action.action, JSON.stringify(action.args)],
  )
  // The sink committed, then the process crashed before the ledger update.
  await executeLearningAction(work, action)
  await executeActionWithLedger(work, action)
  assert.equal(sendAttempts, 2, 'the pending action is retried after a crash')
  assert.deepEqual([...persistedClientMessages], [`action-${action.idempotencyKey}`], 'sink identity makes both attempts one logical message')
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM agent_host_actions WHERE idempotency_key=$1`, [action.idempotencyKey])
  assert.equal(rows[0]?.status, 'succeeded')
})

test('[integration] work claims serialize one session while allowing the next after completion', async () => {
  const ids = [`work-${randomUUID()}`, `work-${randomUUID()}`]
  for (const [index, id] of ids.entries()) {
    await pool.query(
      `INSERT INTO agent_work_items (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,created_at)
       VALUES ($1,$2,$3,$4,$5,'message',NOW()+($6 * INTERVAL '1 millisecond'))`,
      [id, COMPANY, AGENT, CHANNEL, `trigger-${index}`, index],
    )
  }
  const claim = async () => {
    const response = await fetch(`${baseUrl}/internal/agent-os/work/claim`, {
      method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: 'reliability-test' }),
    })
    assert.equal(response.status, 200)
    return await response.json() as AgentWorkItem | null
  }
  const first = await claim()
  assert.equal(first?.id, ids[0])
  assert.equal(await claim(), null, 'a second work item in the same session must stay queued')
  const completed = await fetch(`${baseUrl}/internal/agent-os/work/${first!.id}/complete`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fence: first!.fence, leaseToken: first!.leaseToken, status: 'completed' }),
  })
  assert.equal(completed.status, 200)
  assert.equal((await claim())?.id, ids[1])
})

test('[integration] a stopped leased worker stays unclaimable after its lease expires', async () => {
  const stoppedWorkId = `stopped-lease-${randomUUID()}`
  await pool.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status,lease_expires_at,cancel_requested_at)
     VALUES ($1,$2,$3,$4,$5,'canvas_worker','leased',NOW()-INTERVAL '1 minute',NOW())`,
    [stoppedWorkId, COMPANY, AGENT, CHANNEL, `stopped-${stoppedWorkId}`],
  )
  const response = await fetch(`${baseUrl}/internal/agent-os/work/claim`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ workerId: 'lease-expiry-recovery' }),
  })
  assert.equal(response.status, 200)
  assert.equal(await response.json(), null)
  const { rows } = await pool.query<{ status: string; attempts: number }>(
    `SELECT status,attempts FROM agent_work_items WHERE id=$1`, [stoppedWorkId],
  )
  assert.equal(rows[0]?.status, 'leased')
  assert.equal(rows[0]?.attempts, 0)
})

test('[integration] a stopped worker lease cannot execute a Canvas action before heartbeat', async () => {
  const workId = `stopped-action-${randomUUID()}`
  const leaseToken = 'stopped-worker-lease-token'
  await pool.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status,fence,lease_token_hash,lease_expires_at,cancel_requested_at)
     VALUES ($1,$2,$3,$4,$5,'canvas_worker','leased',4,$6,NOW()+INTERVAL '1 minute',NOW())`,
    [workId, COMPANY, AGENT, CHANNEL, `stopped-${workId}`, createHash('sha256').update(leaseToken).digest('hex')],
  )
  const response = await fetch(`${baseUrl}/internal/agent-os/work/${workId}/actions`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fence: 4, leaseToken, action: { runId: workId, cellId: 'stopped', callIndex: 0,
      action: 'canvas.create_frame', args: {}, idempotencyKey: `${workId}:stopped:0` } }),
  })
  assert.equal(response.status, 409)
  assert.equal((await pool.query(`SELECT 1 FROM agent_host_actions WHERE work_id=$1`, [workId])).rowCount, 0)
})
