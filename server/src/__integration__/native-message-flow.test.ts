import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer, type Server } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool } from '../db/pool.js'
import { createHmac } from 'node:crypto'
import { wukongWebhookRouter } from '../im/webhook.js'
import { storage } from '../storage.js'
import { createNativeMessage } from '../im/message-types.js'
import { releaseKnowledgeAgentWakes } from '../agent-runtime/ingress-repository.js'
import { insertAttachmentKnowledgeJob } from '../modules/knowledge/ingestion-repository.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure cases: split sends, lost attachments/order, duplicate ingestion, early wake on
// the first completion, retrying a terminal failed source, forged file ownership,
// tenant/project escape, old protocol acceptance, changed nonce and replay drift.
let server: Server, baseUrl: string, recording: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  recording = await installRecordingWukong()
  const app = await buildApiTestApp('test-owner')
  app.use('/webhooks/wukong',wukongWebhookRouter)
  server = createServer(app)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  baseUrl = `http://127.0.0.1:${address.port}`
})
after(async () => { await recording?.close(); await teardownAll(server) })

test('one native message survives acceptance and replay; every attachment settles before one wake', async t => {
  const previous = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  t.after(() => { if (previous === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED; else process.env.OPEN_NOTEBOOK_ENABLED = previous })
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  const channelId = 'native-message-room', members = ['test-owner', agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,
    [channelId,companyId,projectId,JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
    [channelId,companyId,JSON.stringify({ members,channelType: 2 }),agentId])
  const attachments = ['one.txt','two.txt'].map(name => ({ id: `attachments/${companyId}/${name}`, type: 'file', name,
    contentType: 'text/plain', status: { type: 'complete' as const },
    content: [{ type: 'file' as const, sourceType: 'id' as const, data: `attachments/${companyId}/${name}`, mimeType: 'text/plain', filename: name }] }))
  for (const file of attachments) {
    await storage.put(file.id, Buffer.from('A recorded fact.'), 'text/plain')
    await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
      SELECT $1,$2,'test-owner',period_id FROM company_memberships WHERE company_id=$2 AND user_id='test-owner' AND ended_at IS NULL`,[file.id,companyId])
  }
  const message = createNativeMessage({ id: 'native-mixed-input', role: 'user', content: [{ type: 'text',text: 'Compare these files.' }], attachments })
  const headers = { 'content-type': 'application/json','x-company-id': companyId,'x-project-id': projectId }
  const send = (payload: unknown) => fetch(`${baseUrl}/api/im/channels/${channelId}/messages/accept`, {
    method: 'POST',headers,body: JSON.stringify({ clientNonce: message.id,payload }) })
  assert.equal((await send(message)).status,202)
  const repeated = await send(message); assert.equal(repeated.status,200)
  assert.equal((await repeated.json() as { duplicate: boolean }).duplicate,true)
  assert.equal(recording.messages.length,1)
  const history = await fetch(`${baseUrl}/api/im/channels/${channelId}/messages`,{ headers })
  assert.equal(history.status,200)
  const replay = await history.json() as { payload: unknown }[]
  assert.deepEqual(replay[0].payload,{ ...message, metadata: { custom: { reactions: [] } } })
  const old = await send({ version: 1,kind: 'text',clientMsgNo: message.id,body: 'old' })
  assert.equal(old.status,409)
  assert.match(await old.text(),/刷新/)
  assert.equal((await send({ ...message,content: [{ type: 'text',text: 'nonce collision' }] })).status,409)
  const foreign = createNativeMessage({ id: 'foreign-file',role: 'user',content: [],attachments: [{ ...attachments[0],id: 'attachments/other/file.txt' }] })
  const denied = await fetch(`${baseUrl}/api/im/channels/${channelId}/messages/accept`,{ method: 'POST',headers,body: JSON.stringify({ clientNonce: foreign.id,payload: foreign }) })
  assert.equal(denied.status,403)

  const outside = await fetch(`${baseUrl}/api/im/channels/${channelId}/messages`,{ headers: { ...headers,'x-company-id': 'outside-company' } })
  assert.equal(outside.status,403)
  const body = JSON.stringify([{ message_idstr: 'native-event',channel_id: channelId,from_uid: 'test-owner',client_msg_no: message.id,
    payload: Buffer.from(JSON.stringify({ type: 1001,...message })).toString('base64') }])
  const webhook = (signature: string) => fetch(`${baseUrl}/webhooks/wukong`,{ method: 'POST',headers: { 'content-type': 'application/json','x-wukong-signature': signature },body })
  assert.equal((await webhook('invalid')).status,401)
  const signature = createHmac('sha256','fixture').update(body).digest('hex')
  const committed = await webhook(signature)
  assert.equal(committed.status,200,await committed.clone().text())
  const receipt = await committed.json() as { knowledgeSourceIds: string[] }
  const duplicateWebhook = await webhook(signature)
  assert.equal(duplicateWebhook.status,200)
  assert.equal((await duplicateWebhook.json() as { duplicate: boolean }).duplicate,true)
  const inputs = attachments.map(file => ({ companyId,projectId,conversationId: channelId,clientMsgNo: message.id,attachmentId: file.id,
    createdBy: 'test-owner',title: file.name,mime: 'text/plain',size: 16,storageKey: file.id,recipients: [],visibilityScope: 'PROJECT' as const }))
  const sources = receipt.knowledgeSourceIds
  assert.equal(new Set(sources).size,2)
  assert.equal((await pool.query('SELECT id FROM knowledge_sources WHERE company_id=$1',[companyId])).rowCount,2)
  const rows = () => pool.query('SELECT available_at FROM lingxios_ingress_outbox WHERE company_id=$1 AND channel_id=$2',[companyId,channelId])
  assert.deepEqual((await rows()).rows,[{ available_at: null }])
  await pool.query("UPDATE knowledge_sources SET status='ready' WHERE id=$1",[sources[0]])
  await releaseKnowledgeAgentWakes(pool,sources[0]); assert.deepEqual((await rows()).rows,[{ available_at: null }])
  await pool.query("UPDATE knowledge_sources SET status='failed' WHERE id=$1",[sources[1]])
  await pool.query("UPDATE knowledge_source_jobs SET status='failed' WHERE source_id=$1",[sources[1]])
  await releaseKnowledgeAgentWakes(pool,sources[1])
  assert.ok((await rows()).rows[0].available_at)
  assert.equal((await rows()).rows.length,1)
  assert.equal((await insertAttachmentKnowledgeJob(pool,inputs[1],30_000)).sourceId,sources[1])
  assert.equal((await pool.query('SELECT status FROM knowledge_source_jobs WHERE source_id=$1',[sources[1]])).rows[0].status,'failed')
  await mkdir('artifacts/native-message',{ recursive: true })
  await writeFile('artifacts/native-message/flow.json',JSON.stringify({ passed: true,checks: ['single-send','ordered-replay','idempotency','old-protocol-rejected','attachment-ownership','tenant-isolation','signed-webhook','duplicate-webhook','two-sources','all-settled-single-wake','terminal-failure-stable'] },null,2))
})
