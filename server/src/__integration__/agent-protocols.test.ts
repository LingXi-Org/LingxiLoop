import { calendarApplication } from '../modules/calendar/index.js'
import { createCalendarEventRequestSchema } from '../modules/calendar/contracts.js'
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { DEFAULT_AGENT_CAPABILITIES } from '../../../src/lib/agentCapabilities.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

let im: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce(); await resetAllTables(); im = await installRecordingWukong() })
after(async () => { await teardownAll(); await im?.close() })
test('native capability registry executes cards and artifacts, gates approval, and enforces revocation', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner', companyId)
  await pool.query('UPDATE participants SET capabilities=$1 WHERE company_id=$2 AND id=$3', [JSON.stringify(DEFAULT_AGENT_CAPABILITIES),companyId,agentId])
  const conversationId = 'protocol-room', members = ['test-owner',agentId]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Protocols',$4::jsonb)`,[conversationId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[conversationId,companyId,JSON.stringify({channelType:2,members})])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,companyId,conversationId)
  await api.conversations.ingest({tenantId:companyId,conversationId,policyVersion:policy.version,messageId:'input',version:1,author:{id:'test-owner',kind:'human'},text:'Explain and help me learn.',mentions:[agentId]}, {mode:'execute',executionClass:'conversation'})
  const host = api.connectWorker({workerId:'protocol-test',workKinds:['turn']}), work = await host.claimWork()
  assert.ok(work)
  const context = await host.loadContext(work)
  assert.equal(context.responseProfile,'deep')
  for (const name of ['calendar','documents','files','canvas','learning','handoffs','research','chat','polls','knowledge','email','routines']) assert.ok(context.grants?.some(grant=>grant.name===name), name)
  assert.ok(!context.grants?.some(grant=>grant.name==='teacher'))
  await host.saveSession(work, {
    key: JSON.stringify([work.tenantId,work.agentId,work.sessionId,work.threadId ?? null]),
    tenantId:work.tenantId,agentId:work.agentId,sessionId:work.sessionId,...(work.threadId ? {threadId:work.threadId}:{}),
    history:[],appliedWorkIds:[work.id],revision:0,compactionEpoch:0,
    request:{version:1,mode:'execute',workId:work.id,tenantId:work.tenantId,sessionId:work.sessionId,authorId:'test-owner',sourceRef:'input',originalText:'Explain and help me learn.',revisions:[],attachments:[],evidence:{version:1,id:work.id,items:[]},conversation:work.conversation},
  })
  let counter=0
  const call = (action:string,args:Record<string,unknown>) => {
    const callIndex = counter++
    return host.executeAction(work,{ runId:work.id, cellId:'protocol', callIndex, action,args,idempotencyKey:JSON.stringify([work.id,'protocol',callIndex]) })
  }
  for (const action of ['documents.list','canvas.current','handoffs.list','email.inbox','routines.list','knowledge.list_sources','learning.get_learner_state','directory.statuses','chat.metadata']) {
    const result = await call(action,{})
    assert.equal(result.ok,true,`${action}: ${JSON.stringify(result)}`)
  }
  const file = await call('files.create',{name:'learning.md',text:'# Wi-Fi\n传感器通过接入点传输数据。'})
  assert.equal(file.ok,true,JSON.stringify(file))
  assert.equal(file.artifacts?.[0]?.mime,'text/markdown')
  assert.equal((await call('files.list',{})).ok,true)
  assert.equal((await call('files.read',{id:'missing'})).ok,false)
  assert.equal((await call('files.create',{name:'../escape.txt',text:'no'})).ok,false)
  const stats=await call('presentation.render',{type:'learning-stats',reference:conversationId})
  assert.equal(stats.ok,true,JSON.stringify(stats))
  assert.equal((await call('presentation.render',{type:'learning-stats',reference:'other-room'})).ok,false)
  const card = await call('chat.recommend',{title:'下一步学习',explanation:'先区分接入方式与传输协议。',nextStep:'画出传感器到手机的数据路径。'})
  assert.equal(card.ok,true,JSON.stringify(card))
  assert.equal(im.messages.filter(message=>message.payload.kind==='questionnaire').length,1)
  assert.equal((im.messages.find(message=>message.payload.kind==='questionnaire')?.payload.data?.questionnaire as {display?:string} | undefined)?.display,'recommendation')
  const malformed = await call('chat.send',{body:'<think>private</think>Answer'})
  assert.equal(malformed.ok,false)
  assert.ok(!im.messages.some(message=>message.payload.body?.includes('<think>')))
  const calendar = await call('calendar.list',{from:'2026-09-01T00:00:00Z',to:'2026-10-01T00:00:00Z'})
  assert.equal(calendar.ok,true,JSON.stringify(calendar))
  const approval = await call('calendar.create',{title:'复习',startAt:'2026-09-27T10:00:00Z'})
  assert.ok(approval.approval,JSON.stringify(approval))
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM calendar_events WHERE company_id=$1',[companyId])).rows[0].count,0)
  const event=await calendarApplication.create({companyId,projectId,userId:'test-owner'},createCalendarEventRequestSchema.parse({title:'Authorized event',startAt:'2026-09-28T10:00:00Z'}))
  const presentation=await call('presentation.render',{type:'calendar-event',reference:event.id})
  assert.equal(presentation.ok,true,JSON.stringify(presentation))
  assert.equal((await call('presentation.render',{type:'calendar-event',reference:event.id,fields:{title:'fabricated'}})).ok,false)
  await pool.query(`UPDATE participants SET capabilities=capabilities-'files'-'calendar' WHERE company_id=$1 AND id=$2`,[companyId,agentId])
  assert.equal((await call('files.create',{name:'blocked.txt',text:'blocked'})).ok,false)
  assert.equal((await call('calendar.list',{from:'2026-09-01T00:00:00Z',to:'2026-10-01T00:00:00Z'})).ok,false)
  assert.equal((await call('presentation.render',{type:'calendar-event',reference:event.id})).ok,false)
  assert.equal((await call('teacher.overview',{})).ok,false)
})
