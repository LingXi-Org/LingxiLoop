import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { enqueueAgentWakes } from '../agent-runtime/ingress.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { createNativeMessage } from '../im/message-types.js'
import { createAgentRequestSchema } from '../modules/agents/contracts.js'
import { productionWorkerTasks } from '../worker.js'
import { sendInvitationEmail } from '../modules/companies/invitation-email.js'
import { __setEmailProviderOverrideForTesting } from '../modules/email/index.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure modes: stale grants accepted, calendar ingress wakes an agent, retry
// jobs send mail, old HTTP writes succeed, or auth/invitation mail loses its provider.
let server: Server, base: string, companyId: string
before(async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const seeded = await seedCompanyWithAgent(); companyId = seeded.companyId
  await seedUserMembership('test-owner',companyId)
  server = createServer(await buildApiTestApp('test-owner'))
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  base = `http://127.0.0.1:${address.port}`
})
after(async () => { await teardownAll(server) })

test('organization invitation email keeps its transactional provider', async () => {
  const sent: string[] = []
  __setEmailProviderOverrideForTesting(async args => { sent.push(...args.to); return { ok:true,smtpMessageId:args.messageId,error:null } })
  try {
    await sendInvitationEmail({ to:'invitee@example.test',inviterName:'Teacher',inviterEmail:'teacher@example.test',companyName:'School',role:'teacher',note:null,inviteUrl:'https://loop.test/invite/fixture' })
    assert.deepEqual(sent,['invitee@example.test'])
  } finally { __setEmailProviderOverrideForTesting(null) }
})

test('retired capabilities and scheduler ingress cannot be re-enabled', async () => {
  for (const capability of ['email','calendar']) assert.equal(createAgentRequestSchema.safeParse({ name:'Legacy',systemPrompt:'Help the current user.',capabilities:[capability] }).success,false)
  assert.ok(!productionWorkerTasks.some(task => /email|calendar/.test(task.name)))
  const payload = createNativeMessage({ id:'legacy-calendar',role:'system',content:[{type:'text',text:'Legacy calendar task'}],custom:{ calendarEventId:'legacy-event',scheduledFor:'2026-10-13T00:00:00Z' } })
  assert.equal(await enqueueAgentWakes(pool,{ eventId:'legacy-event',companyId,channelId:'legacy-room',clientMsgNo:'legacy-calendar',payload,recipients:['scout'] }),0)
  await assert.rejects(receiveAgentRequest({ companyId,agentId:'scout',channelId:'legacy-room',clientMsgNo:'legacy-calendar',kind:'calendar' }),/retired/)
})

test('old product endpoints fail explicitly before producing effects', async () => {
  for (const endpoint of ['/email/threads','/email/send','/calendar/events']) {
    const response = await fetch(base + '/api' + endpoint,{method:'POST',headers:{'x-company-id':companyId,'content-type':'application/json'},body:'{}'})
    assert.equal(response.status,410,endpoint)
    assert.match((await response.json() as { error:string }).error,/retired/)
  }
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM email_messages')).rows[0].count,0)
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM calendar_events')).rows[0].count,0)
})

test('retirement migration preserves history while clearing grants and outstanding ingress', async () => {
  await pool.query(`UPDATE participants SET capabilities='["email","calendar","documents"]'::jsonb WHERE company_id=$1 AND kind='agent'`,[companyId])
  await pool.query(`INSERT INTO lingxios_ingress_outbox(event_id,agent_id,company_id,channel_id,client_msg_no,kind)
    SELECT 'retirement-fixture',id,company_id,'legacy-room','legacy-calendar','calendar' FROM participants WHERE company_id=$1 AND kind='agent' LIMIT 1`,[companyId])
  await pool.query(`INSERT INTO calendar_events(id,company_id,project_id,created_by,kind,title,start_at)
    VALUES('retained-calendar',$1,$2,'test-owner','personal','Historic schedule',NOW())`,[companyId,`general-${companyId}`])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
    VALUES('retained-mail-room',$1,$2,'email','Historic mail','["test-owner"]')`,[companyId,`general-${companyId}`])
  await pool.query(`INSERT INTO email_messages(message_id,conversation_id,company_id,author_id,body,sequence,direction,transport_status,from_addr,next_retry_at)
    VALUES('retained-mail','retained-mail-room',$1,'test-owner','Historic mail body',1,'out','failed','teacher@example.test',NOW())`,[companyId])
  const before = (await pool.query('SELECT count(*)::int AS count FROM participants')).rows[0].count
  const migration = await readFile(new URL('../db/migrations/0034_retire_email_calendar.sql',import.meta.url),'utf8')
  await withTransaction(pool,db=>db.query(migration))
  const agents = (await pool.query('SELECT capabilities FROM participants WHERE company_id=$1 AND kind=\'agent\'',[companyId])).rows
  assert.ok(agents.every(row => JSON.stringify(row.capabilities) === '["documents"]'))
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM participants')).rows[0].count,before)
  const wake = (await pool.query("SELECT failed_at,error FROM lingxios_ingress_outbox WHERE event_id='retirement-fixture'")).rows[0]
  assert.ok(wake.failed_at); assert.match(wake.error,/retired/)
  assert.deepEqual((await pool.query("SELECT title,status FROM calendar_events WHERE id='retained-calendar'")).rows,[{title:'Historic schedule',status:'cancelled'}])
  assert.deepEqual((await pool.query("SELECT body,next_retry_at FROM email_messages WHERE message_id='retained-mail'")).rows,[{body:'Historic mail body',next_retry_at:null}])
})
