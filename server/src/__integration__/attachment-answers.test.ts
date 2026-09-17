import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { pool } from '../db/pool.js'
import { storage } from '../storage.js'
import { WukongClient, _setWukongClientForTests } from '../im/wukong.js'
import type { ImMessageEnvelope } from '../im/messages-application.js'
import type { ActionContext, RequestSnapshot } from '@lyyzka/lingxios'
import { knowledgeTools } from '../modules/knowledge/agent-tools.js'
import { openNotebookClient, OpenNotebookError } from '../modules/knowledge/provider.js'
import { createProductContext } from '../agent-runtime/context.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { enqueueAgentWakes } from '../agent-runtime/ingress.js'
import { readRequestAttachments, selectRequestAttachments, unavailableAttachmentIds } from '../agent-runtime/attachments.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce(); await resetAllTables() })
after(async () => { await teardownAll() })

test('attachment questions and history use committed bytes, wake once and retain tenant and audience boundaries', async () => {
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner',companyId)
  const members = ['test-owner',agentId]
  for (const [room,kind,channelType] of [['attachment-group','group',2],['attachment-dm','direct',1]] as const) {
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,$4,$1,$5::jsonb)`,
      [room,companyId,projectId,kind,JSON.stringify(members)])
    await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
      [room,companyId,JSON.stringify({ channelType,members }),agentId])
  }
  const text = 'Context '.repeat(300) + 'Unique recorded value: 7391.'
  const signal = new AbortController().signal
  const message = (id: string, seq: number, room: string): ImMessageEnvelope => ({ messageId: `im-${id}`,clientMsgNo: id,messageSeq: seq,
    channelId: room,fromUid: 'test-owner',timestamp: Math.floor(Date.now()/1000),payload: { version: 1,kind: 'attachment',clientMsgNo: id,
      data: { key: `attachments/${companyId}/${id}.txt`,name: `${id}.txt`,mime: 'text/plain',size: Buffer.byteLength(text) } } })
  for (const room of ['attachment-group','attachment-dm']) {
    const first = message(`${room}-one`,1,room), last = message(`${room}-two`,2,room)
    first.payload.data!.suppressAgentWake = true
    last.payload.body = 'What is the unique recorded value in both files?'
    last.payload.data!.attachmentClientMsgNos = [first.clientMsgNo,last.clientMsgNo]
    last.payload.data!.mentionedIds = [agentId]
    const history = [first,last]
    for (const item of history) await storage.put(String(item.payload.data!.key),Buffer.from(text),'text/plain')
    _setWukongClientForTests(new class extends WukongClient {
      override async syncMessages(channelId: string, channelType: number, limit = 80, _uid = '', before = 0) {
        return history.filter(item => item.channelId === channelId && (!before || item.messageSeq < before)).slice(-limit).map(item => ({ ...item,channelType }))
      }
      override async upsertChannel() {}
    }({ apiUrl: 'http://unused',wsUrl: 'ws://unused',apiToken: 'test',webhookSecret: 'test' }))
    const wake = (item: ImMessageEnvelope) => enqueueAgentWakes(pool,{ eventId: item.clientMsgNo,companyId,channelId: room,
      clientMsgNo: item.clientMsgNo,payload: item.payload,recipients: [agentId] })
    assert.equal(await wake(first),0)
    assert.equal(await wake(last),1)
    await wake(last)
    const rows = (await pool.query('SELECT attachment_client_msg_nos,available_at FROM lingxios_ingress_outbox WHERE channel_id=$1',[room])).rows
    assert.equal(rows.length,1)
    assert.deepEqual(rows[0].attachment_client_msg_nos,[first.clientMsgNo,last.clientMsgNo])
    assert.ok(rows[0].available_at)
    const input = { companyId,agentId,channelId: room,clientMsgNo: last.clientMsgNo }
    const accepted = await receiveAgentRequest(input)
    assert.ok('runs' in accepted && accepted.runs.length === 1)
    const run = (await pool.query('SELECT meta FROM lingxios.agent_work_items WHERE id=$1',[accepted.runs[0].runId])).rows[0]
    assert.equal(run.meta.text,last.payload.body)
    assert.equal(run.meta.deliveryMode,'auto')
    assert.deepEqual(run.meta.attachments.map((item: { text: string }) => item.text),[text,text])
    await receiveAgentRequest(input)
    assert.equal(Number((await pool.query('SELECT count(*) FROM lingxios.agent_work_items WHERE id=$1',[accepted.runs[0].runId])).rows[0].count),1)
    const followup: ImMessageEnvelope = { ...last,clientMsgNo: `${room}-followup`,messageId: `${room}-followup`,messageSeq: 3,
      payload: { version: 1,kind: 'text',clientMsgNo: `${room}-followup`,body: 'Explain the recorded value.',data: { mentionedIds: [agentId] } } }
    history.push(followup)
    const next = await receiveAgentRequest({ ...input,clientMsgNo: followup.clientMsgNo })
    assert.ok('runs' in next && next.runs.length === 1)
    const nextMeta = (await pool.query('SELECT meta FROM lingxios.agent_work_items WHERE id=$1',[next.runs[0].runId])).rows[0].meta
    assert.equal(nextMeta.attachments.length,2)
    await assert.rejects(receiveAgentRequest({ ...input,companyId: 'different-tenant' }),/unavailable/)
    await assert.rejects(readRequestAttachments(history,[first.clientMsgNo],'different-tenant',signal,new Set()),/invalid committed attachment/)
    assert.deepEqual(selectRequestAttachments(followup,[],[{ ...first,fromUid: 'other' },{ ...last,channelId: 'other' }]),[])
    assert.equal((await readRequestAttachments(history,[first.clientMsgNo],companyId,signal,new Set([first.clientMsgNo])))[0].contentStatus,'unavailable')
    await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,conversation_id,title,kind,status,visibility_scope,owner_user_id,created_by_user_id,created_via,origin_client_msg_no)
      VALUES($1,$2,$3,$4,'Private source','text','ready','PRIVATE','test-owner','test-owner','USER',$5)`,[`${room}-source`,companyId,projectId,room,first.clientMsgNo])
    assert.equal((await unavailableAttachmentIds(pool,companyId,room,[first.clientMsgNo],['test-owner','other-reader'])).has(first.clientMsgNo),true)
    await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,$2,'test-owner')`,[room,`${room}-source`])
    assert.equal((await unavailableAttachmentIds(pool,companyId,room,[first.clientMsgNo],['test-owner'])).has(first.clientMsgNo),true)
  }
})

test('native knowledge tools read beyond previews, page actual text and enforce source selection', async t => {
  await resetAllTables()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  await seedUserMembership('test-owner',companyId)
  const room = 'knowledge-answer-room', members = ['test-owner',agentId]
  await pool.query(`UPDATE participants SET capabilities='["knowledge"]'::jsonb WHERE company_id=$1 AND id=$2`,[companyId,agentId])
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)`,[room,companyId,projectId,JSON.stringify(members)])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,[room,companyId,JSON.stringify({ channelType: 2,members }),agentId])
  await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,conversation_id,title,kind,status,visibility_scope,owner_user_id,created_by_user_id,created_via,external_source_id)
    VALUES('answer-source',$1,$2,$3,'Recorded facts','text','ready','PRIVATE','test-owner','test-owner','USER','source:answer')`,[companyId,projectId,room])
  await pool.query(`INSERT INTO knowledge_notebook_bindings(project_id,company_id,external_key,external_notebook_id,state)
    VALUES($1,$2,$1,'notebook:answer','ready')`,[projectId,companyId])
  const text = 'Background '.repeat(1600) + 'Unique recorded value: 7391.'
  t.mock.method(openNotebookClient,'getSource',async () => ({ id: 'source:answer',full_text: text }))
  const searchMock = t.mock.method(openNotebookClient,'search',async () => [{ id: 'chunk:answer',parent_id: 'source:answer',content: 'Unique recorded value: 7391.' }])
  const previous = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  t.after(() => { if (previous === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED; else process.env.OPEN_NOTEBOOK_ENABLED = previous })
  const work: ActionContext['work'] = { id: 'knowledge-read-run',tenantId: companyId,agentId,principalId: 'test-owner',sessionId: room,
    kind: 'turn',lane: 'interactive',triggerRef: 'request',fence: 1,homeEpoch: 1,createdAt: new Date().toISOString(),meta: { conversationId: room,text: 'Find the recorded value.' } }
  const unexpected = async (): Promise<never> => { throw new Error('unexpected side effect in a read-only test') }
  const context = (action: string): ActionContext => ({ work,database: pool,signal: new AbortController().signal,requestVersion: 1,
    writeMemory: unexpected,forgetMemory: unexpected,requestSnapshot: unexpected,enqueueGraph: unexpected,readGraph: unexpected,
    waitForChildren: unexpected,createSharedState: unexpected,readSharedState: unexpected,updateSharedState: unexpected,
    enqueueChild: unexpected,readChild: unexpected,cancelChild: unexpected,reviseChild: unexpected,createArtifact: unexpected,
    deadlineAt: new Date(Date.now()+30000).toISOString(),action: { runId: work.id,cellId: action,callIndex: 0,idempotencyKey: action,action,args: {} } })
  const invoke = async (action: string, args: Record<string,unknown>) => {
    const tool = knowledgeTools.find(tool => tool.action === action)!, ctx = context(action), input = tool.parse(args)
    await tool.authorize(ctx,input)
    return tool.execute(ctx,input)
  }
  const search = await invoke('knowledge.search',{ query: 'recorded value' })
  assert.equal(search.evidence?.[0].excerpt,'Unique recorded value: 7391.')
  assert.ok(search.evidence?.[0].sourceVersion)
  const first = await invoke('knowledge.read_source',{ sourceId: 'answer-source',limit: 16000 })
  assert.equal((first.value as { truncated: boolean }).truncated,true)
  const second = await invoke('knowledge.read_source',{ sourceId: 'answer-source',offset: 16000,limit: 16000 })
  assert.match(second.evidence![0].excerpt,/7391/)
  assert.equal(second.evidence![0].sourceVersion,first.evidence![0].sourceVersion)
  assert.equal((second.value as { truncated: boolean }).truncated,false)
  await assert.rejects(invoke('knowledge.read_source',{ sourceId: 'answer-source',offset: text.length+1 }),/offset/)
  searchMock.mock.mockImplementation(async () => { throw new OpenNotebookError('provider unavailable',503) })
  const product = createProductContext(knowledgeTools)
  assert.deepEqual((await product.contextProvider.loadContext(work)).dynamic?.knowledgeRetrieval,{ status: 'unavailable' })
  const request: RequestSnapshot = { version: 1,workId: work.id,tenantId: companyId,sessionId: work.sessionId,authorId: 'test-owner',
    sourceRef: 'request',originalText: 'Find the recorded value.',attachments: [],revisions: [],
    evidence: { version: 1,id: 'knowledge-evidence',items: search.evidence!.map((item,index) => ({ ...item,marker: `S${index+1}` })) } }
  await product.contextProvider.authorizeRequest!(work,request)
  await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,'answer-source','test-owner')`,[room])
  await assert.rejects(product.contextProvider.authorizeRequest!(work,request),/source selection was revoked/)
  await assert.rejects(invoke('knowledge.read_source',{ sourceId: 'answer-source' }),/unavailable or excluded/)
  assert.equal((await invoke('knowledge.search',{ query: 'recorded value' })).evidence?.length,0)
  const other = context('knowledge.read_source'); other.work = { ...work,tenantId: 'other-tenant' }
  await assert.rejects(knowledgeTools.find(tool => tool.action === 'knowledge.read_source')!.authorize(other,{ sourceId: 'answer-source' }),/revoked|forbidden|authorized/)
})
