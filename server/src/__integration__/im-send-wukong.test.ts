import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool } from '../db/pool.js'
import { createNativeMessage } from '../im/message-types.js'
import { imMessagesApplication as app } from '../im/messages-facade.js'
import { ensureSendAcceptance } from '../im/messages-repository.js'
import { messageAcceptanceDigest } from '../im/messages-digest.js'
import { wukongClient, _setWukongClientForTests } from '../im/wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll, buildApiTestApp } from './_helpers.js'

// Real transport failure inventory: accepted zero/missing sequence, real durable write
// followed by ACK loss, concurrent recovery adding messages, unknown history being sent
// again, and another human turn being blocked. Browser checks exercise the unchanged HTTP
// boundary with isolated auth; they do not substitute for #160's production recovery UI.
test('real pinned WuKong recovers invalid receipts and ACK loss without duplicate durable messages', {
  skip: process.env.LINGXIOS_REAL_WUKONG !== '1', timeout: 180_000,
}, async t => {
  await ensureSchemaOnce(); await resetAllTables(); _setWukongClientForTests(null)
  const output = '.e2e/issue-154'; await mkdir(output, { recursive: true })
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const channelId = `im-reconcile-${randomUUID()}`, members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile)
    VALUES($1,$2,$3::jsonb)`, [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  const client = wukongClient()
  await client.upsertChannel({ channelId, channelType: 2, title: 'Synthetic reconciliation', members })
  const input = { companyId, userId: agentId, channelId, clientNonce: `lost-${randomUUID()}`,
    payload: createNativeMessage({ id: randomUUID(), role: 'assistant', content: [{ type: 'text', text: 'Synthetic saved result.' }] }) }
  const send = client.sendMessage.bind(client)
  let sendCalls = 0
  const drop = t.mock.method(client, 'sendMessage', async (...args: Parameters<typeof send>) => {
    sendCalls++; await send(...args); throw new Error('synthetic loss after a real WuKong write')
  })
  await assert.rejects(app.acceptAgentMessage(input), /synthetic loss/)
  drop.mock.restore()
  const recovered = await Promise.all(Array.from({ length: 6 }, () => app.acceptAgentMessage(input)))
  assert.ok(recovered.every(result => result.kind === 'accepted' && result.duplicate))
  const first = recovered[0]; assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  for (const sequence of [0, null]) {
    await pool.query(`UPDATE im_send_acceptances SET status='accepted',echo=$2::jsonb,error=NULL WHERE client_nonce=$1`,
    [input.clientNonce, JSON.stringify({ ...first.echo, messageSeq: sequence })])
    assert.equal((await app.sendStatus(input))?.status, 'pending')
    const repair = await app.acceptAgentMessage(input)
    assert.equal(repair.kind, 'accepted')
    if (repair.kind === 'accepted') assert.equal(repair.echo.messageId, first.echo.messageId)
  }
  assert.equal((await client.syncMessages(channelId, 2, 100, agentId)).length, 1)
  assert.equal(sendCalls, 1)

  const userPayload = createNativeMessage({ id: `human-${randomUUID()}`, role: 'user', content: [{ type: 'text', text: 'Synthetic human message.' }] })
  const human = { companyId, channelId, userId: 'test-owner', clientNonce: userPayload.id, payload: userPayload }
  const accepted = await app.acceptUserMessage(human); assert.equal(accepted.kind, 'accepted')
  if (accepted.kind !== 'accepted') return
  await pool.query(`UPDATE im_send_acceptances SET echo=$2::jsonb WHERE client_nonce=$1`,
  [human.clientNonce, JSON.stringify({ ...accepted.echo, messageSeq: 0 })])
  const unknownPayload = createNativeMessage({ id: `unknown-${randomUUID()}`, role: 'user', content: [{ type: 'text', text: 'Synthetic uncertain message.' }] })
  await ensureSendAcceptance(pool, { ...human, clientNonce: unknownPayload.id, payload: unknownPayload, channelType: 2,
    inputDigest: messageAcceptanceDigest({ channelId, channelType: 2, payload: unknownPayload }) })
  await pool.query(`UPDATE im_send_acceptances SET error='historical-uncertain' WHERE client_nonce=$1`, [unknownPayload.id])
  const api = await buildApiTestApp('test-owner')
  api.get('/__im_reconciliation/manifest', (_request, response) => response.json({ companyId, projectId, channelId,
    payload: userPayload, unknownPayload, expectedMessageId: accepted.echo.messageId }))
  api.get('/__im_reconciliation/stats', async (_request, response) => response.json((await pool.query(`SELECT
    (SELECT count(*)::int FROM llm_calls) AS models, (SELECT count(*)::int FROM lingxios.agent_action_ledger) AS actions`)).rows[0]))
  api.get('/', (_request, response) => response.type('html').send('<!doctype html><html lang="zh"><meta charset="utf-8"><title>IM reconciliation API verification</title><main><h1>IM 回执核对 API 验证</h1><p>隔离认证、真实 PostgreSQL 与 WuKong；生产恢复界面由 #160 联验。</p></main></html>'))
  const server = createServer(api)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  try {
    if (process.env.IM_RECONCILIATION_BROWSER === '1') {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(process.execPath, ['e2e/web/run.mjs', 'e2e/web/im-send-reconciliation.e2e.ts', '--output', `${output}/browser`],
        { stdio: 'inherit', env: { ...process.env, E2E_PROJECT: 'web', E2E_BASE_URL: `http://127.0.0.1:${address.port}`, E2E_TELEMETRY_DISABLED: '1' } })
        child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`official browser verification failed (${code})`)))
      })
    }
    const history = await client.syncMessages(channelId, 2, 100, agentId)
    assert.equal(history.filter(message => message.clientMsgNo === input.clientNonce).length, 1)
    assert.equal(history.filter(message => message.clientMsgNo === unknownPayload.id).length, 0)
    assert.deepEqual((await pool.query(`SELECT (SELECT count(*)::int FROM llm_calls) AS models,
      (SELECT count(*)::int FROM lingxios.agent_action_ledger) AS actions`)).rows[0], { models: 0, actions: 0 })
    await writeFile(`${output}/real-wukong.json`, JSON.stringify({ passed: true,
      pinnedWuKongCommit: 'c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47',
      checks: ['real ACK loss', '6 concurrent retries', 'accepted sequence 0', 'accepted missing sequence', 'same message ID', 'one message for the original nonce'],
      originalSendCalls: sendCalls, messagesForOriginalNonce: 1, models: 0, actions: 0,
      states: ['pending/unknown', 'accepted/reconciled', 'accepted/invalid sequence → pending projection', 'accepted/repaired'],
      browser: process.env.IM_RECONCILIATION_BROWSER === '1' ? 'official API boundary verification passed' : 'not run',
      limitations: ['isolated test authentication', 'production recovery UI joint verification belongs to #160', 'no real model provider', 'no 24h soak'],
    }, null, 2))
  } finally { await teardownAll(server) }
})
