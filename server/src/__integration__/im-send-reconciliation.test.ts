import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { pool } from '../db/pool.js'
import { ForbiddenError } from '../modules/access/public.js'
import { createNativeMessage } from '../im/message-types.js'
import { imMessagesApplication as app } from '../im/messages-facade.js'
import { getSendAcceptance, acceptSend, ensureSendAcceptance } from '../im/messages-repository.js'
import { messageAcceptanceDigest } from '../im/messages-digest.js'
import { authorizeAcceptanceRepair } from '../../../scripts/reconcile-im-send-acceptances.js'
import { WukongClient, wukongClient } from '../im/wukong.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure inventory (written before implementation): cached zero/missing/unsafe sequence,
// invalid message ID/ownership/type/payload, lost ACK and process death, concurrent retries,
// conflicting payload under one nonce, revoked recipients, old paginated history, unknown
// transport outcome mistaken for non-execution, repair dry-run writing, raw errors leaking,
// and IM recovery unexpectedly executing actions or models.
// Maintenance fault inventory: SQL timeout/connection loss/TypeError or a forged
// reason/status mistaken for a policy denial; failed reauthorization writing a
// receipt; unavailable history hiding a code error; private diagnostic leakage.
let recording: Awaited<ReturnType<typeof installRecordingWukong>>
let input: Parameters<typeof app.acceptAgentMessage>[0]
before(async () => { await ensureSchemaOnce(); recording = await installRecordingWukong() })
beforeEach(async () => {
  await resetAllTables(); recording.messages.length = 0
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const channelId = 'reconciliation-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES($1,$2,$3,'group',$1,$4::jsonb)`, [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile)
    VALUES($1,$2,$3::jsonb)`, [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  input = { companyId, userId: agentId, channelId, clientNonce: 'same-result-key',
    payload: createNativeMessage({ id: 'same-result', role: 'assistant', content: [{ type: 'text', text: 'Saved result.' }] }) }
})
after(async () => { await recording?.close(); await teardownAll() })

async function corrupt(echo: unknown, status = 'accepted', error: string | null = null) {
  await pool.query(`UPDATE im_send_acceptances SET echo=$4::jsonb,status=$5,error=$6,updated_at=NOW()-INTERVAL '1 minute'
    WHERE company_id=$1 AND user_id=$2 AND client_nonce=$3`,
  [input.companyId, input.userId, input.clientNonce, JSON.stringify(echo), status, error])
}
async function ledgers() {
  const rows = await pool.query(`SELECT (SELECT count(*)::int FROM llm_calls) AS models,
    (SELECT count(*)::int FROM lingxios.agent_action_ledger) AS actions`)
  return rows.rows[0]
}

test('invalid cached receipts are pending on the existing status API and repair the original acceptance', async () => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  const baseline = await ledgers()
  for (const patch of [{ messageSeq: 0 }, { messageSeq: undefined }, { messageSeq: -1 }, { messageSeq: 1.5 },
    { messageSeq: Number.MAX_SAFE_INTEGER + 1 }, { messageId: '0' }, { messageId: '' }, { channelId: 'foreign-room' },
    { fromUid: 'another-author' }, { channelType: 1 }, { clientMsgNo: 'foreign-nonce' },
    { payload: { ...input.payload, content: [{ type: 'text', text: 'changed cached body' }] } }]) {
    await corrupt({ ...first.echo, ...patch })
    const status = await app.sendStatus(input)
    assert.equal(status?.status, 'pending'); assert.equal(status?.echo, null)
    assert.equal(status?.error, 'delivery-reconciliation-required')
    const repaired = await app.acceptAgentMessage(input)
    assert.equal(repaired.kind, 'accepted')
    if (repaired.kind === 'accepted') {
      assert.equal(repaired.duplicate, true)
      assert.equal(repaired.echo.messageId, first.echo.messageId)
      assert.equal(repaired.echo.messageSeq, 1)
    }
    assert.equal(recording.messages.length, 1)
  }
  await corrupt(null)
  assert.equal((await app.acceptAgentMessage(input)).kind, 'accepted')
  assert.equal(recording.messages.length, 1)
  assert.deepEqual(await ledgers(), baseline)
})

test('lost ACK and concurrent retries recover one durable message without another send', async t => {
  const client = wukongClient(), send = client.sendMessage.bind(client)
  const dropped = t.mock.method(client, 'sendMessage', async (...args: Parameters<typeof send>) => {
    await send(...args); throw new Error('PRIVATE_PROVIDER_RESPONSE')
  })
  await assert.rejects(app.acceptAgentMessage(input), /PRIVATE_PROVIDER_RESPONSE/)
  dropped.mock.restore()
  assert.equal((await getSendAcceptance(pool, input))?.error, 'send-dispatch-started-v1')
  const noResend = t.mock.method(client, 'sendMessage', async () => { throw new Error('must not resend') })
  const results = await Promise.all(Array.from({ length: 8 }, () => app.acceptAgentMessage(input)))
  assert.ok(results.every(result => result.kind === 'accepted' && result.duplicate))
  assert.equal(noResend.mock.callCount(), 0); assert.equal(recording.messages.length, 1)
  assert.deepEqual(await ledgers(), { models: 0, actions: 0 })
})

test('uncertain execution remains pending with bounded history retries and never resends', async t => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt(first.echo, 'pending', 'legacy-send-failure')
  recording.messages.length = 0
  const client = wukongClient()
  const history = t.mock.method(client, 'syncMessages', async () => [])
  const send = t.mock.method(client, 'sendMessage', async () => { throw new Error('must not resend') })
  for (let attempt = 0; attempt < 4; attempt++) await assert.rejects(app.acceptAgentMessage(input), /reconcil|恢复/)
  assert.equal(history.mock.callCount(), 1); assert.equal(send.mock.callCount(), 0)
  const status = await app.sendStatus(input)
  assert.equal(status?.status, 'pending'); assert.equal(status?.echo, null)
  assert.equal(status?.error, 'delivery-reconciliation-required')
})

test('a nonce conflict fails before history lookup and before any new dispatch', async t => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt({ ...first.echo, messageSeq: 0 })
  const history = t.mock.method(wukongClient(), 'syncMessages', async () => { throw new Error('must not read') })
  const result = await app.acceptAgentMessage({ ...input,
    payload: { ...input.payload, content: [{ type: 'text', text: 'Different result.' }] } })
  assert.equal(result.kind, 'nonce_conflict'); assert.equal(history.mock.callCount(), 0)
  await corrupt(first.echo, 'pending', 'legacy-unknown')
  assert.equal((await app.acceptAgentMessage({ ...input, rejectVerbatimPeerBody: 'Different result.',
    payload: { ...input.payload, content: [{ type: 'text', text: 'Different result.' }] } })).kind, 'nonce_conflict')
  assert.equal(history.mock.callCount(), 0)
  assert.equal(recording.messages.length, 1)
})

test('authoritative ownership, payload, channel type and a known message ID must all agree', async () => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  const original = structuredClone(recording.messages[0])
  for (const patch of [{ fromUid: 'another-author' }, { channelType: 1 }, { messageId: 'different-durable-id' },
    { payload: { ...input.payload, content: [{ type: 'text' as const, text: 'Different result.' }] } }]) {
    recording.messages[0] = { ...original, ...patch }
    await corrupt({ ...first.echo, messageSeq: 0 })
    await assert.rejects(app.acceptAgentMessage(input), /reconcil|conflict|恢复/)
    assert.equal((await app.sendStatus(input))?.status, 'pending')
  }
  assert.equal(recording.messages.length, 1)
})

test('revoked channel membership prevents history reads and receipt recovery', async t => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt({ ...first.echo, messageSeq: 0 })
  await pool.query(`UPDATE conversations SET members='["test-owner"]'::jsonb WHERE id=$1`, [input.channelId])
  const history = t.mock.method(wukongClient(), 'syncMessages', async () => { throw new Error('must not read') })
  assert.equal((await app.acceptAgentMessage(input)).kind, 'channel_not_found')
  assert.equal(await app.sendStatus(input), null); assert.equal(history.mock.callCount(), 0)
})

test('receipt write boundary rejects invalid transport receipts before accepting', async t => {
  t.mock.method(wukongClient(), 'sendMessage', async () => ({ messageId: 'invalid', messageSeq: 0 }))
  await assert.rejects(app.acceptAgentMessage(input), /invalid|reconcil/)
  assert.equal((await getSendAcceptance(pool, input))?.status, 'pending')
})

test('historical pending rows without a dispatch marker are uncertain; new keys can still send', async t => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  await corrupt(null, 'pending', null); recording.messages.length = 0
  const send = t.mock.method(wukongClient(), 'sendMessage', async () => { throw new Error('must not resend') })
  await assert.rejects(app.acceptAgentMessage(input), /reconcil|恢复/)
  assert.equal(send.mock.callCount(), 0)
  send.mock.restore()
  assert.equal((await app.acceptAgentMessage({ ...input, clientNonce: 'new-human-turn' })).kind, 'accepted')
  assert.equal(recording.messages.length, 1)
})

test('repair inspection is read-only, classifies unknown safely, and never dispatches', async t => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt({ ...first.echo, messageSeq: 0 })
  const before = await getSendAcceptance(pool, input)
  const send = t.mock.method(wukongClient(), 'sendMessage', async () => { throw new Error('must not send') })
  assert.equal((await app.reconcileSendAcceptance(input)).classification, 'confirmed')
  assert.deepEqual(await getSendAcceptance(pool, input), before)
  assert.equal((await app.reconcileSendAcceptance({ ...input, apply: true })).classification, 'confirmed')
  assert.equal((await app.sendStatus(input))?.status, 'accepted')
  assert.equal((await app.reconcileSendAcceptance({ ...input, apply: true })).classification, 'confirmed')
  await corrupt(null, 'pending', 'legacy-error'); recording.messages.length = 0
  assert.equal((await app.reconcileSendAcceptance(input)).classification, 'unknown')
  assert.equal(send.mock.callCount(), 0)
})

test('repository write boundary cannot persist a fabricated receipt', async () => {
  await app.acceptAgentMessage(input)
  await assert.rejects(acceptSend(pool, { ...input, echo: { messageId: 'made-up', messageSeq: 0 } }), /invalid/)
})

test('numeric WuKong IDs beyond the JS safe integer range retain their exact history identity', async () => {
  let receipt = '{"reason":1,"message_id":2111292352269127680,"message_seq":1}'
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json')
    response.end(receipt)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  try {
    const client = new WukongClient({ apiUrl: `http://127.0.0.1:${address.port}`, wsUrl: 'ws://unused', apiToken: 'fixture', webhookSecret: 'fixture' })
    assert.equal((await client.sendMessage(input.channelId, 2, input.userId, input.payload, input.clientNonce)).messageId, '2111292352269127680')
    for (const invalid of [{ reason: 1, message_id: true, message_seq: 1 },
      { reason: 1, message_id: { id: 'foreign' }, message_seq: 1 },
      { reason: 1, message_id: 'valid', message_seq: true }]) {
      receipt = JSON.stringify(invalid)
      await assert.rejects(client.sendMessage(input.channelId, 2, input.userId, input.payload, input.clientNonce), /not accepted/)
    }
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})

test('recovery scans older pages and refuses two distinct messages under the same nonce', async () => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  const original = recording.messages[0]
  for (let sequence = 2; sequence <= 251; sequence++) recording.messages.push({ ...original,
    messageId: `later-${sequence}`, messageSeq: sequence, clientMsgNo: `later-${sequence}` })
  await corrupt({ ...first.echo, messageSeq: 0 })
  assert.equal((await app.acceptAgentMessage(input)).kind, 'accepted')
  recording.messages.push({ ...original, messageId: 'second-copy', messageSeq: 252 })
  await corrupt({ ...first.echo, messageSeq: 0 })
  await assert.rejects(app.acceptAgentMessage(input), /reconciliation/)
  assert.equal((await app.sendStatus(input))?.status, 'pending')
})

test('only a persisted pre-dispatch marker proves non-execution; inspection never dispatches it', async () => {
  await ensureSendAcceptance(pool, { ...input, channelType: 2, inputDigest: messageAcceptanceDigest({ ...input, channelType: 2 }) })
  assert.equal((await app.reconcileSendAcceptance(input)).classification, 'not_executed')
  assert.equal((await app.reconcileSendAcceptance({ ...input, apply: true })).classification, 'not_executed')
  assert.equal(recording.messages.length, 0)
  await corrupt(null, 'pending', 'send-dispatch-started-v1')
  assert.equal((await app.reconcileSendAcceptance(input)).classification, 'unknown')
})

test('the maintenance CLI defaults to read-only, exits cleanly and applies only an explicitly scoped key', { timeout: 30_000 }, async () => {
  input = { ...input, userId: 'test-owner', clientNonce: 'cli-original-nonce', payload: createNativeMessage({
    id: 'cli-original-nonce', role: 'user', content: [{ type: 'text', text: 'Synthetic CLI result.' }] }) }
  const first = await app.acceptUserMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt({ ...first.echo, messageSeq: 0 })
  const before = await getSendAcceptance(pool, input), client = wukongClient()
  const run = (args: string[]) => new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/reconcile-im-send-acceptances.ts',
      '--company', input.companyId, '--sender', input.userId, ...args], { timeout: 10_000,
      env: { ...process.env, WUKONG_API_URL: client.config.apiUrl, WUKONG_API_TOKEN: client.config.apiToken,
        WUKONG_WS_URL: client.config.wsUrl, WUKONG_WEBHOOK_SECRET: client.config.webhookSecret } })
    let stdout = ''; child.stdout.on('data', chunk => { stdout += chunk.toString() })
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout }))
  })
  const inspect = await run(['--nonce', input.clientNonce])
  assert.equal(inspect.code, 0)
  assert.equal(JSON.parse(inspect.stdout.split('\n')[0]).classification, 'confirmed')
  assert.doesNotMatch(inspect.stdout, /Synthetic CLI result|cli-original-nonce/)
  assert.deepEqual(await getSendAcceptance(pool, input), before)
  assert.equal((await run(['--apply'])).code, 1)
  assert.deepEqual(await getSendAcceptance(pool, input), before)
  assert.equal((await run(['--nonce', input.clientNonce, '--apply', '--database', new URL(process.env.DATABASE_URL!).pathname.slice(1)])).code, 0)
  assert.equal((await app.sendStatus(input))?.status, 'accepted')
  assert.equal(recording.messages.length, 1)
})

test('maintenance distinguishes actual policy denials from unexpected authorization errors at both checks', async () => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt({ ...first.echo, messageSeq: 0 })
  const before = await getSendAcceptance(pool, input)
  for (const failAt of [1, 2]) {
    for (const fault of [new TypeError('PRIVATE_IMPLEMENTATION_DETAIL'),
      Object.assign(new Error('PRIVATE_CONNECTION_DETAIL'), { code: 'ECONNRESET' }),
      Object.assign(new Error('PRIVATE_FORGED_DENIAL'), { reason: 'forbidden', status: 403 })]) {
      let checks = 0
      await assert.rejects(app.reconcileSendAcceptance({ ...input, apply: true, authorize: async () => {
        if (++checks === failAt) throw fault
      } }), error => {
        assert.ok(error instanceof Error && !(error instanceof ForbiddenError))
        assert.equal(error.message, 'IM send acceptance reconciliation is unavailable')
        assert.equal(error.cause, fault)
        assert.doesNotMatch(JSON.stringify(error), /PRIVATE_/)
        return true
      })
      assert.equal(checks, failAt)
      assert.deepEqual(await getSendAcceptance(pool, input), before)
    }
    let checks = 0
    const result = await app.reconcileSendAcceptance({ ...input, apply: true, authorize: async () => {
      if (++checks === failAt) throw new ForbiddenError('RESOURCE_MEMBERSHIP_REQUIRED')
    } })
    assert.equal(result.classification, 'forbidden')
    assert.deepEqual(await getSendAcceptance(pool, input), before)
  }
  assert.equal(recording.messages.length, 1)
  assert.deepEqual(await ledgers(), { models: 0, actions: 0 })
})

test('maintenance preserves a real PostgreSQL timeout cause without relabelling it forbidden', async () => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt({ ...first.echo, messageSeq: 0 })
  const before = await getSendAcceptance(pool, input)
  for (const failAt of [1, 2]) {
    const client = await pool.connect()
    let checks = 0, databaseCause: unknown
    try {
      await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout='20ms'")
      await assert.rejects(app.reconcileSendAcceptance({ ...input, apply: true, authorize: async () => {
        if (++checks === failAt) {
          try { await client.query('SELECT pg_sleep(0.2)') }
          catch (cause) { databaseCause = cause; throw cause }
        }
      } }), error => {
        assert.ok(error instanceof Error && !(error instanceof ForbiddenError))
        assert.equal(error.message, 'IM send acceptance reconciliation is unavailable')
        assert.equal(error.cause, databaseCause)
        assert.equal((error.cause as { code: string }).code, '57014')
        assert.doesNotMatch(JSON.stringify(error), /pg_sleep|statement timeout/)
        return true
      })
    } finally { await client.query('ROLLBACK'); client.release() }
    assert.equal(checks, failAt)
    assert.deepEqual(await getSendAcceptance(pool, input), before)
  }
})

test('maintenance history failures retain a safe cause and cannot change the acceptance', async t => {
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt({ ...first.echo, messageSeq: 0 })
  const before = await getSendAcceptance(pool, input), fault = new TypeError('PRIVATE_HISTORY_DETAIL')
  t.mock.method(wukongClient(), 'syncMessages', async () => { throw fault })
  await assert.rejects(app.reconcileSendAcceptance({ ...input, apply: true }), error => {
    assert.ok(error instanceof Error)
    assert.equal(error.message, 'IM send acceptance reconciliation is unavailable')
    assert.equal(error.cause, fault)
    assert.doesNotMatch(JSON.stringify(error), /PRIVATE_HISTORY_DETAIL/)
    return true
  })
  assert.deepEqual(await getSendAcceptance(pool, input), before)
})

test('maintenance repeats original principal, project and frozen audience authorization, including before commit', async t => {
  const { lingxiOSControl } = await import('../agent-runtime/runtime.js')
  const { syncConversationPolicy } = await import('../agent-runtime/conversations.js')
  const { bindProductRun } = await import('../agent-runtime/identity.js')
  await seedUserMembership('peer', input.companyId, { role: 'STUDENT' })
  const projectId = (await pool.query('SELECT project_id FROM conversations WHERE id=$1', [input.channelId])).rows[0].project_id
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'peer','STUDENT')`, [projectId, input.companyId])
  const members = ['test-owner', 'peer', input.userId]
  await pool.query(`UPDATE conversations SET members=$2::jsonb WHERE id=$1`, [input.channelId, JSON.stringify(members)])
  await pool.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1`, [input.channelId, JSON.stringify(members)])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, input.companyId, input.channelId)
  const admitted = await api.conversations.ingest({ tenantId: input.companyId, conversationId: input.channelId,
    policyVersion: policy.version, messageId: 'repair-authority-source', version: 1,
    author: { id: 'peer', kind: 'human' }, text: 'Synthetic authorized source.', mentions: [input.userId] },
  { mode: 'execute', executionClass: 'conversation', codeExecution: 'disabled' })
  assert.equal(admitted.runs.length, 1)
  await bindProductRun(pool, admitted.runs[0], input.channelId)
  input.payload = createNativeMessage({ ...input.payload, custom: { harness: { runId: admitted.runs[0].runId } } })
  const first = await app.acceptAgentMessage(input); assert.equal(first.kind, 'accepted')
  if (first.kind !== 'accepted') return
  await corrupt({ ...first.echo, messageSeq: 0 })
  const repair = { ...input, authorize: (db: Parameters<typeof authorizeAcceptanceRepair>[0], row: Parameters<typeof authorizeAcceptanceRepair>[2]) => authorizeAcceptanceRepair(db, input, row) }
  assert.equal((await app.reconcileSendAcceptance(repair)).classification, 'confirmed')
  await pool.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1`, [input.channelId, JSON.stringify(members.slice(1))])
  assert.equal((await app.reconcileSendAcceptance({ ...repair, apply: true })).classification, 'forbidden')
  await pool.query(`UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1`, [input.channelId, JSON.stringify(members)])
  await pool.query(`DELETE FROM project_memberships WHERE project_id=$1 AND user_id='peer'`, [projectId])
  assert.equal((await app.reconcileSendAcceptance({ ...repair, apply: true })).classification, 'forbidden')
  await pool.query(`INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,'peer','STUDENT')`, [projectId, input.companyId])
  const sync = wukongClient().syncMessages.bind(wukongClient())
  t.mock.method(wukongClient(), 'syncMessages', async (...args: Parameters<typeof sync>) => {
    const messages = await sync(...args)
    await pool.query(`UPDATE users SET access_revoked_at=NOW() WHERE id='peer'`)
    return messages
  })
  assert.equal((await app.reconcileSendAcceptance({ ...repair, apply: true })).classification, 'forbidden')
  assert.equal((await getSendAcceptance(pool, input))?.echo?.messageSeq, 0)
  assert.deepEqual(await ledgers(), { models: 0, actions: 0 })
})
