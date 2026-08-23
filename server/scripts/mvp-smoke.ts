/** Full Compose smoke for WuKongIM -> durable work -> Agent OS -> final IM reply. */
import { createHmac, randomUUID } from 'node:crypto'
import { pool } from '../src/db/pool.js'
import { reconcileLearningChannels } from '../src/im/reconcile.js'
import { wukongClient } from '../src/im/wukong.js'
import { onboardStarterAgents } from '../src/onboardCompany.js'
import type { LingxiMessageV1 } from '../src/agent-os/types.js'

const BASE_URL = process.env.MVP_SMOKE_BASE_URL ?? 'http://localhost:5181'
const REPLY_TIMEOUT_MS = Number(process.env.MVP_SMOKE_REPLY_TIMEOUT_MS ?? 90_000)
const suffix = randomUUID().slice(0, 8)
const companyId = `co-agent-os-smoke-${suffix}`
const userId = `u-agent-os-smoke-${suffix}`

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const response = await fetch(`${BASE_URL}/api/health`).catch(() => null)
    if (response?.ok) return
    await sleep(1_000)
  }
  throw new Error('control plane did not become healthy')
}

async function seed(): Promise<{ channelId: string; agentId: string }> {
  await pool.query(
    `INSERT INTO users (id,email,display_name,email_verified_at,is_admin,tier)
     VALUES ($1,$2,'Agent OS Smoke',NOW(),FALSE,'pro')`,
    [userId, `${userId}@example.invalid`],
  )
  await pool.query(
    `INSERT INTO companies (id,name,slug,owner_user_id) VALUES ($1,'Agent OS Smoke',$2,$3)`,
    [companyId, `agent-os-smoke-${suffix}`, userId],
  )
  await pool.query(`INSERT INTO company_members (company_id,user_id,role) VALUES ($1,$2,'owner')`, [companyId, userId])
  await pool.query(
    `INSERT INTO participants (id,kind,name,initial,avatar_bg,status,company_id)
     VALUES ($1,'human','Agent OS Smoke','A','#0078C8','avail',$2)`,
    [userId, companyId],
  )
  await onboardStarterAgents(companyId)
  const synced = await reconcileLearningChannels()
  if (synced.failures > 0) throw new Error(`WuKong reconciliation had ${synced.failures} failures`)
  const { rows } = await pool.query<{ channel_id: string; leader_agent_id: string }>(
    `SELECT channel_id, leader_agent_id FROM im_channel_bindings
      WHERE company_id=$1 AND preset_key='dm:nova' LIMIT 1`,
    [companyId],
  )
  if (!rows[0]?.leader_agent_id) throw new Error('Nova direct channel was not provisioned')
  return { channelId: rows[0].channel_id, agentId: rows[0].leader_agent_id }
}

async function postWebhook(channelId: string, payload: LingxiMessageV1): Promise<Response> {
  const body = JSON.stringify({
    event_id: `smoke-event:${payload.clientMsgNo}`,
    event_type: 'message.committed',
    message: { channel_id: channelId, channel_type: 2, from_uid: userId, client_msg_no: payload.clientMsgNo, payload },
  })
  const signature = createHmac('sha256', process.env.WUKONG_WEBHOOK_SECRET ?? 'dev-wukong-webhook-secret')
    .update(body)
    .digest('hex')
  return fetch(`${BASE_URL}/webhooks/wukong`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wukong-signature': `sha256=${signature}` },
    body,
  })
}

async function waitForReply(channelId: string, agentId: string, afterSeq: number): Promise<number> {
  const deadline = Date.now() + REPLY_TIMEOUT_MS
  while (Date.now() < deadline) {
    const messages = await wukongClient().syncMessages(channelId, 2, 100, userId)
    const reply = messages.find((message) => (
      message.fromUid === agentId
      && message.messageSeq > afterSeq
      && message.payload.kind === 'text'
    ))
    if (reply) return reply.messageSeq
    await sleep(750)
  }
  const { rows } = await pool.query(
    `SELECT id,status,error,attempts FROM agent_work_items WHERE company_id=$1 ORDER BY created_at DESC LIMIT 5`,
    [companyId],
  )
  throw new Error(`timed out waiting for Agent OS reply; work=${JSON.stringify(rows)}`)
}

async function main(): Promise<void> {
  await waitForHealth()
  const { channelId, agentId } = await seed()
  const payload: LingxiMessageV1 = {
    version: 1,
    kind: 'text',
    clientMsgNo: `smoke-message-${suffix}`,
    body: 'Give me one short study tip to verify the Agent OS path.',
  }
  const sent = await wukongClient().sendMessage(channelId, 2, userId, payload)
  const first = await postWebhook(channelId, payload)
  if (!first.ok) throw new Error(`webhook returned ${first.status}: ${await first.text()}`)
  const replySeq = await waitForReply(channelId, agentId, sent.messageSeq)

  const replay = await postWebhook(channelId, payload)
  const replayBody = await replay.json() as { duplicate?: boolean }
  if (!replay.ok || replayBody.duplicate !== true) throw new Error('webhook replay was not deduplicated')
  await sleep(2_000)
  const messages = await wukongClient().syncMessages(channelId, 2, 100, userId)
  const replies = messages.filter((message) => (
    message.fromUid === agentId
    && message.messageSeq >= replySeq
    && message.payload.kind === 'text'
  ))
  if (replies.length !== 1) throw new Error(`expected one final reply after replay, got ${replies.length}`)
  console.log(`PASS Agent OS E2E: ${userId} -> ${agentId}; final_seq=${replySeq}; replay deduplicated`)
}

main().catch((error) => {
  console.error('FAIL Agent OS E2E:', error)
  process.exitCode = 1
}).finally(async () => {
  if (process.env.MVP_SMOKE_CLEANUP === '1') {
    await pool.query('DELETE FROM companies WHERE id=$1', [companyId]).catch(() => undefined)
    await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => undefined)
  }
  await pool.end()
})
