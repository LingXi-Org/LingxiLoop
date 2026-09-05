import assert from 'node:assert/strict'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import express from 'express'
import { agentOSControlRouter, executeActionWithLedger } from '../agent-os/control-plane.js'
import { executeLearningAction } from '../agent-os/learning-actions.js'
import type { AgentWorkItem, HostAction, LingxiMessageV1 } from '../agent-os/types.js'
import type { AssistantMessage, WorkItem } from '../../../third_party/lingxios/src/protocol/types.js'
import { sweepAgentWorkWatchdog } from '../agent-os/work-watchdog.js'
import { pool } from '../db/pool.js'
import { imRouter } from '../im/router.js'
import { wukongWebhookRouter } from '../im/webhook.js'
import { _setWukongClientForTests, WukongClient } from '../im/wukong.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

const COMPANY = 'co-agent-os-reliability'
const PROJECT = 'project-agent-os-reliability'
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

  override async syncMessages(): Promise<never[]> {
    return []
  }
}

before(async () => {
  process.env.AGENT_OS_SERVICE_TOKEN = SERVICE_TOKEN
  process.env.AGENT_OS_NODE_TIMEOUT_SECONDS = '5'
  _setWukongClientForTests(new IdempotentWukong({ apiUrl: 'http://unused', wsUrl: 'ws://unused', apiToken: 'test', webhookSecret: WEBHOOK_SECRET }))
  await ensureSchemaOnce()
  const app = express()
  app.use('/webhooks/wukong', wukongWebhookRouter)
  app.use(express.json())
  app.use('/api/im', (req, _res, next) => { (req as express.Request & { authUserId?: string }).authUserId = HUMAN; req.headers['x-company-id'] = COMPANY; req.headers['x-project-id'] = PROJECT; next() }, imRouter)
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
  await pool.query(
    `INSERT INTO users (id,email,display_name) VALUES ($1,'learner@reliability.test','Learner')`,
    [HUMAN],
  )
  await pool.query(`INSERT INTO companies (id,name,slug,type,plan_id) VALUES ($1,'Reliability','agent-os-reliability','EDUCATION','plan-personal-free')`, [COMPANY])
  await pool.query(`INSERT INTO company_memberships(company_id,user_id,role) VALUES($1,$2,'MEMBER')`, [COMPANY, HUMAN])
  await pool.query(
    `INSERT INTO education_contracts
       (id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
     VALUES ('contract-agent-os-reliability',$1,'plan-personal-free','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',1)`,
    [COMPANY],
  )
  await pool.query(
    `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
     VALUES ('seat-agent-os-reliability',$1,'contract-agent-os-reliability',$2,'ACTIVE')`,
    [COMPANY, HUMAN],
  )
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,name)
     VALUES($1,$2,'INSTITUTIONAL_COURSE','Reliability Workspace')`,
    [PROJECT, COMPANY],
  )
  await pool.query(
    `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,status,capabilities)
     VALUES ($1,$3,'agent','Nova','coach','N','#6d5dfc','avail','["chat","web"]'::jsonb),
            ($2,$3,'human','Learner','learner','L','#0078c8','avail','[]'::jsonb)`,
    [AGENT, HUMAN, COMPANY],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role,status)
     VALUES ($1,$2,$3,'STUDENT','ACTIVE')`,
    [COMPANY, PROJECT, HUMAN],
  )
  await pool.query(
    `INSERT INTO conversations(id,kind,title,members,company_id,project_id)
     VALUES($1,'group','Reliability Channel',$2::jsonb,$3,$4)`,
    [CHANNEL, JSON.stringify([AGENT, HUMAN]), COMPANY, PROJECT],
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

async function claimWork(workerId: string): Promise<WorkItem | null> {
  const response = await fetch(`${baseUrl}/internal/agent-os/v2/work/claim`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ workerId }),
  })
  assert.equal(response.status, 200)
  return await response.json() as WorkItem | null
}

async function completeWork(work: WorkItem): Promise<void> {
  const response = await fetch(`${baseUrl}/internal/agent-os/v2/work/${work.id}/complete`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fence: work.fence, leaseToken: work.leaseToken, status: 'completed' }),
  })
  assert.equal(response.status, 200)
}

test('[integration] legacy AgentOS v1 control routes are removed', async () => {
  const response = await fetch(`${baseUrl}/internal/agent-os/work/claim`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ workerId: 'legacy-worker' }),
  })
  assert.equal(response.status, 404)
})

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
  const duplicate = await postWebhook(body)
  assert.equal(duplicate.status, 200)
})

test('[integration] @all queues six agents', async () => {
  const agentIds = [AGENT, ...Array.from({ length: 5 }, (_, index) => `agent-agent-os-reliability-${index + 2}`)]
  for (const [index, agentId] of agentIds.slice(1).entries()) {
    await pool.query(
      `INSERT INTO participants (id,company_id,kind,name,role,initial,avatar_bg,status,capabilities)
       VALUES ($1,$2,'agent',$3,'coach','A','#6d5dfc','avail','[]'::jsonb)`,
      [agentId, COMPANY, `Agent ${index + 2}`],
    )
  }
  await pool.query(
    `UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$1::jsonb) WHERE channel_id=$2`,
    [JSON.stringify([...agentIds, HUMAN]), CHANNEL],
  )
  const eventId = `all-${randomUUID()}`
  const body = JSON.stringify({
    event_id: eventId,
    event_type: 'message.committed',
    message: {
      channel_id: CHANNEL,
      channel_type: 2,
      from_uid: HUMAN,
      client_msg_no: `msg-${eventId}`,
      payload: {
        version: 1,
        kind: 'text',
        clientMsgNo: `msg-${eventId}`,
        body: '@all Help me study.',
        data: { mentionAll: true },
      },
    },
  })

  const response = await postWebhook(body)
  assert.equal(response.status, 200)
  assert.equal((await pool.query(`SELECT 1 FROM agent_work_items WHERE trigger_client_msg_no=$1`, [`msg-${eventId}`])).rowCount, 6)
})

test('[integration] durable lanes and watchdog preempt lower-lane work without losing it', async () => {
  const activeId = `routine-${randomUUID()}`, waitingId = `learner-${randomUUID()}`
  await pool.query(
    `INSERT INTO agent_work_items(id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status,fence,lease_token_hash,lease_expires_at,lease_started_at,created_at,available_at)
     VALUES($1,$3,$4,$5,$1,'routine','leased',1,'hash',NOW()+INTERVAL '1 minute',NOW()-INTERVAL '5 minutes',NOW()-INTERVAL '5 minutes',NOW()-INTERVAL '5 minutes'),
           ($2,$3,$4,$5,$2,'message','queued',0,NULL,NULL,NULL,NOW()-INTERVAL '5 minutes',NOW()-INTERVAL '5 minutes')`,
    [activeId, waitingId, COMPANY, AGENT, CHANNEL],
  )
  await pool.query(`INSERT INTO agent_os_session_leases(session_key,work_id,fence,expires_at) VALUES($1,$2,1,NOW()+INTERVAL '1 minute')`, [`${COMPANY}:${AGENT}:${CHANNEL}:-`, activeId])
  const lanes = await pool.query<{ reason: string; lane: string }>(`SELECT reason,lane FROM agent_work_items WHERE id=ANY($1::text[]) ORDER BY reason`, [[activeId, waitingId]])
  assert.deepEqual(lanes.rows.map((row) => [row.reason, row.lane]), [['message', 'learner'], ['routine', 'background']])
  await sweepAgentWorkWatchdog(new Date())
  assert.equal((await pool.query(`SELECT preempt_requested_at IS NOT NULL AS requested FROM agent_work_items WHERE id=$1`, [activeId])).rows[0]?.requested, true)
  await pool.query(`UPDATE agent_work_items SET preempt_grace_expires_at=NOW()-INTERVAL '1 second' WHERE id=$1`, [activeId])
  const databaseNow = (await pool.query<{ now: Date }>(`SELECT NOW() AS now`)).rows[0].now
  await sweepAgentWorkWatchdog(databaseNow)
  const fenced = (await pool.query<{ status: string; fence: string; preemptions: number }>(`SELECT status,fence,preemptions FROM agent_work_items WHERE id=$1`, [activeId])).rows[0]
  assert.equal(fenced.status, 'queued')
  assert.equal(Number(fenced.fence), 2)
  assert.equal(fenced.preemptions, 1)
  assert.equal((await pool.query(`SELECT 1 FROM agent_os_session_leases WHERE work_id=$1`, [activeId])).rowCount, 0)
})

test('[integration] session persistence rejects a worker after its fence is superseded', async () => {
  const workId = `session-fence-${randomUUID()}`, leaseToken = 'session-fence-token'
  const sessionKey = `${COMPANY}:${AGENT}:${CHANNEL}:-`
  await pool.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status,fence,lease_token_hash,lease_started_at,lease_expires_at)
     VALUES($1,$2,$3,$4,$5,'message','leased',1,$6,NOW(),NOW()+INTERVAL '1 minute')`,
    [workId, COMPANY, AGENT, CHANNEL, `trigger-${workId}`, createHash('sha256').update(leaseToken).digest('hex')],
  )
  await pool.query(
    `INSERT INTO agent_os_session_leases(session_key,work_id,fence,expires_at) VALUES($1,$2,1,NOW()+INTERVAL '1 minute')`,
    [sessionKey, workId],
  )
  const session = {
    key: sessionKey, tenantId: COMPANY, agentId: AGENT, sessionId: CHANNEL,
    history: [{ role: 'user', content: 'once' }], appliedWorkIds: [workId], revision: 0, compactionEpoch: 0,
  }
  const save = () => fetch(`${baseUrl}/internal/agent-os/v2/sessions`, {
    method: 'PUT', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ workId, fence: 1, leaseToken, session }),
  })
  const firstSave = await save()
  assert.equal(firstSave.status, 200)
  session.revision = Number((await firstSave.json() as { revision: number }).revision)
  session.history.push({ role: 'assistant', content: 'saved by the current worker' })
  const secondSave = await save()
  assert.equal(secondSave.status, 200)
  session.revision = Number((await secondSave.json() as { revision: number }).revision)
  await pool.query(`UPDATE agent_work_items SET fence=2,status='queued',lease_token_hash=NULL WHERE id=$1`, [workId])
  await pool.query(`DELETE FROM agent_os_session_leases WHERE work_id=$1`, [workId])
  session.history.push({ role: 'assistant', content: 'late zombie write' })
  assert.equal((await save()).status, 409)
  const { rows } = await pool.query<{ history: Array<{ content: string }> }>(`SELECT history FROM agent_os_sessions WHERE session_key=$1`, [sessionKey])
  assert.equal(rows[0]?.history.some((item) => item.content === 'late zombie write'), false)
})

test('[integration] user send acceptance replays one nonce and rejects digest reuse', async () => {
  const nonce = `temp-${randomUUID()}`
  const payload = { version: 1, kind: 'text', clientMsgNo: nonce, body: 'Study calculus' }
  const send = () => fetch(`${baseUrl}/api/im/channels/${CHANNEL}/messages/accept`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': COMPANY }, body: JSON.stringify({ clientNonce: nonce, payload }),
  })
  assert.equal((await send()).status, 202)
  const duplicate = await send()
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json() as { duplicate?: boolean }).duplicate, true)
  assert.equal(sendAttempts, 1)
  const conflict = await fetch(`${baseUrl}/api/im/channels/${CHANNEL}/messages/accept`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-company-id': COMPANY },
    body: JSON.stringify({ clientNonce: nonce, payload: { ...payload, body: 'Different' } }),
  })
  assert.equal(conflict.status, 409)
  await pool.query(`UPDATE im_send_acceptances SET status='pending',echo=NULL WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`, [COMPANY, HUMAN, nonce])
  assert.equal((await send()).status, 202)
  assert.equal(persistedClientMessages.size, 1)
})

test('[integration] pending Host Action reuses its sink id after a post-side-effect crash', async () => {
  const work: AgentWorkItem = {
    id: `work-${randomUUID()}`, fence: 1, companyId: COMPANY, agentId: AGENT, channelId: CHANNEL,
    authorizationUserId: HUMAN, triggerClientMsgNo: 'trigger-host-action', reason: 'message',
    executionRole:'coordinator',lane: 'learner', leaseToken: 'unused-direct-call',
  }
  await pool.query(
    `INSERT INTO agent_work_items (id,company_id,authorization_user_id,agent_id,channel_id,trigger_client_msg_no,reason,status,fence,lease_token_hash,lease_expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'leased',$8,$9,NOW()+INTERVAL '1 minute')`,
    [work.id, COMPANY, HUMAN, AGENT, CHANNEL, work.triggerClientMsgNo, work.reason, work.fence, createHash('sha256').update(work.leaseToken).digest('hex')],
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

test('[integration] concurrent duplicate Host Actions execute once through the product ledger', async () => {
  const workId = `concurrent-action-${randomUUID()}`
  const leaseToken = 'concurrent-action-token'
  await pool.query(
    `INSERT INTO agent_work_items
       (id,company_id,authorization_user_id,agent_id,channel_id,trigger_client_msg_no,reason,status,fence,lease_token_hash,lease_expires_at)
     VALUES($1,$2,$3,$4,$5,$6,'message','leased',1,$7,NOW()+INTERVAL '1 minute')`,
    [workId, COMPANY, HUMAN, AGENT, CHANNEL, `trigger-${workId}`, createHash('sha256').update(leaseToken).digest('hex')],
  )
  const request = () => fetch(`${baseUrl}/internal/agent-os/v2/work/${workId}/actions`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      fence: 1, leaseToken,
      action: {
        runId: workId, cellId: 'concurrent', callIndex: 0, action: 'chat.send', args: { body: 'Only once' },
        idempotencyKey: `${workId}:concurrent:0`,
      },
    }),
  })
  const responses = await Promise.all([request(), request()])
  assert.deepEqual(responses.map((response) => response.status), [200, 200])
  assert.equal(sendAttempts, 1)
  assert.equal((await pool.query(`SELECT 1 FROM agent_host_actions WHERE work_id=$1 AND status='succeeded'`, [workId])).rowCount, 1)
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
    const response = await fetch(`${baseUrl}/internal/agent-os/v2/work/claim`, {
      method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: 'reliability-test' }),
    })
    assert.equal(response.status, 200)
    return await response.json() as WorkItem | null
  }
  const first = await claim()
  assert.equal(first?.id, ids[0])
  assert.equal(await claim(), null, 'a second work item in the same session must stay queued')
  const completed = await fetch(`${baseUrl}/internal/agent-os/v2/work/${first!.id}/complete`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fence: first!.fence, leaseToken: first!.leaseToken, status: 'completed' }),
  })
  assert.equal(completed.status, 200)
  assert.equal((await claim())?.id, ids[1])
})

test('[integration] two workers keep session affinity and take over with a fresh Home epoch', async () => {
  const insertQueued = async (id: string, thread: string, order: number) => {
    await pool.query(
      `INSERT INTO agent_work_items
         (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'message',NOW()+($7 * INTERVAL '1 millisecond'))`,
      [id, COMPANY, AGENT, CHANNEL, thread, `trigger-${id}`, order],
    )
  }
  const firstA = `affinity-a-${randomUUID()}`
  const firstB = `affinity-b-${randomUUID()}`
  await insertQueued(firstA, 'thread-a', 0)
  await insertQueued(firstB, 'thread-b', 1)

  const claimedA = await claimWork('node-a')
  const claimedB = await claimWork('node-b')
  assert.deepEqual(
    [claimedA && { id: claimedA.id, homeEpoch: claimedA.homeEpoch }, claimedB && { id: claimedB.id, homeEpoch: claimedB.homeEpoch }],
    [{ id: firstA, homeEpoch: 1 }, { id: firstB, homeEpoch: 1 }],
  )
  await completeWork(claimedA!)
  await completeWork(claimedB!)

  const followup = `affinity-followup-${randomUUID()}`
  await insertQueued(followup, 'thread-a', 2)
  assert.equal(await claimWork('node-b'), null, 'a live owner keeps its session affinity')
  const sameOwner = await claimWork('node-a')
  assert.deepEqual(sameOwner && { id: sameOwner.id, homeEpoch: sameOwner.homeEpoch }, { id: followup, homeEpoch: 1 })
  await completeWork(sameOwner!)

  const expired = `affinity-expired-${randomUUID()}`
  await pool.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,fence,leased_by,lease_expires_at,attempts)
     VALUES ($1,$2,$3,$4,'thread-a',$5,'message','leased',1,'node-a',NOW()-INTERVAL '1 minute',1)`,
    [expired, COMPANY, AGENT, CHANNEL, `trigger-${expired}`],
  )
  await pool.query(`UPDATE agent_os_workers SET last_seen_at=NOW()-INTERVAL '6 seconds' WHERE worker_id='node-a'`)
  const takenOver = await claimWork('node-b')
  assert.deepEqual(
    takenOver && { id: takenOver.id, fence: takenOver.fence, homeEpoch: takenOver.homeEpoch },
    { id: expired, fence: 2, homeEpoch: 2 },
  )
  assert.equal(await claimWork('node-a'), null, 'a returned stale node cannot steal the new owner route')
  const { rows } = await pool.query<{ worker_id: string; home_epoch: string }>(
    `SELECT worker_id,home_epoch FROM agent_os_session_routes WHERE session_key=$1`,
    [`${COMPANY}:${AGENT}:${CHANNEL}:thread-a`],
  )
  assert.deepEqual(rows, [{ worker_id: 'node-b', home_epoch: '2' }])
})

test('[integration] final message validation ignores streamed deltas from an older Fence', async () => {
  const workId = `stream-retry-${randomUUID()}`
  const leaseToken = 'stream-retry-token'
  await pool.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status,fence,lease_token_hash,lease_expires_at,leased_by)
     VALUES ($1,$2,$3,$4,$5,'message','leased',2,$6,NOW()+INTERVAL '1 minute','node-b')`,
    [workId, COMPANY, AGENT, CHANNEL, `trigger-${workId}`, createHash('sha256').update(leaseToken).digest('hex')],
  )
  await pool.query(
    `INSERT INTO agent_runs(id,agent_id,company_id,trigger,status,reasoning_runtime)
     VALUES($1,$2,$3,'{}'::jsonb,'running','agent-os')`,
    [workId, AGENT, COMPANY],
  )
  for (const [sequence, kind, data] of [
    [2, 'model.delta', { partType: 'text', delta: 'stale partial' }],
    [100_001, 'model.started', {}],
    [100_002, 'model.delta', { partType: 'text', delta: 'Recovered answer' }],
    [100_003, 'model.completed', { usage: { inputTokens: 3, outputTokens: 2 } }],
  ] as const) {
    await pool.query(
      `INSERT INTO agent_events(id,run_id,agent_id,company_id,kind,level,title,data,sequence)
       VALUES($1,$2,$3,$4,$5,'info',$5,$6::jsonb,$7)`,
      [randomUUID(), workId, AGENT, COMPANY, kind, JSON.stringify(data), sequence],
    )
  }
  const message: AssistantMessage = {
    version: 2, runId: workId, agentId: AGENT, sessionId: CHANNEL, body: 'Recovered answer',
  }
  const response = await fetch(`${baseUrl}/internal/agent-os/v2/work/${workId}/messages`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fence: 2, leaseToken, message }),
  })
  assert.equal(response.status, 200)
  assert.deepEqual([...persistedClientMessages], [`agent-${workId}`])
})

test('[integration] a stopped leased worker stays unclaimable after its lease expires', async () => {
  const stoppedWorkId = `stopped-lease-${randomUUID()}`
  await pool.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,trigger_client_msg_no,reason,status,lease_expires_at,cancel_requested_at)
     VALUES ($1,$2,$3,$4,$5,'canvas_worker','leased',NOW()-INTERVAL '1 minute',NOW())`,
    [stoppedWorkId, COMPANY, AGENT, CHANNEL, `stopped-${stoppedWorkId}`],
  )
  const response = await fetch(`${baseUrl}/internal/agent-os/v2/work/claim`, {
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
  const response = await fetch(`${baseUrl}/internal/agent-os/v2/work/${workId}/actions`, {
    method: 'POST', headers: { authorization: `Bearer ${SERVICE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ fence: 4, leaseToken, action: { runId: workId, cellId: 'stopped', callIndex: 0,
      action: 'canvas.create_frame', args: {}, idempotencyKey: `${workId}:stopped:0` } }),
  })
  assert.equal(response.status, 409)
  assert.equal((await pool.query(`SELECT 1 FROM agent_host_actions WHERE work_id=$1`, [workId])).rowCount, 0)
})
