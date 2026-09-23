import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { readRunReference, type ActionContext, type WorkItem } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { createProductTools } from '../agent-runtime/tools.js'
import { createProductContext } from '../agent-runtime/context.js'
import { flushNativeEvents } from '../agents/native-events.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { reconcileHandoffs } from '../modules/agents/handoff-progress.js'
import { createCanvasRuntime } from '../modules/canvas/runtime.js'
import { completeCanvasWork } from '../modules/canvas/facade.js'
import { onboardCompanyStarterWorkspace } from '../modules/companies/public.js'
import { STARTER_TEAM } from '../modules/learning/preset.js'
import { insertCourse } from '../modules/learning/courses-repository.js'
import { syncStudyRoomMembers } from '../modules/learning/reporting-repository.js'
import { upsertLearningMission } from '../modules/learning/missions-repository.js'
import { assignLearningMissionCoordinator } from '../modules/learning/missions-application.js'
import { openNotebookClient, OpenNotebookError } from '../modules/knowledge/provider.js'
import { installRecordingWukong } from './_recording-wukong.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

let im: Awaited<ReturnType<typeof installRecordingWukong>>
before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await stopLingxiOSControl(); await resetAllTables(); im = await installRecordingWukong() })
afterEach(async () => {
  await stopLingxiOSControl()
  // Native cancellation can settle before its last PostgreSQL query returns.
  for (let attempt=0;attempt<100;attempt++) {
    const active = await pool.query(`SELECT 1 FROM pg_stat_activity WHERE datname=current_database()
      AND pid<>pg_backend_pid() AND state IN ('active','idle in transaction') LIMIT 1`)
    if (!active.rows.length) { await im.close(); return }
    await delay(50)
  }
  throw new Error('native database work did not drain before fixture cleanup')
})
after(async () => { await teardownAll() })
const transaction = <T>(run: Parameters<typeof withTransaction<T>>[1]) => withTransaction(pool,run)

async function fixture() {
  const { companyId,projectId } = await seedCompanyWithAgent()
  await seedUserMembership('learner',companyId,{ role: 'STUDENT' })
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES($1,$2,'learner','STUDENT')`,[companyId,projectId])
  await onboardCompanyStarterWorkspace(companyId)
  const agents = (await pool.query<{ id: string; preset_key: string }>('SELECT id,preset_key FROM participants WHERE company_id=$1 AND preset_key=ANY($2::text[])',
    [companyId,STARTER_TEAM.map(agent => agent.presetKey)])).rows
  const ids = Object.fromEntries(agents.map(agent => [agent.preset_key,agent.id])), roomId = 'collaboration-room'
  const members = ['learner',...agents.map(agent => agent.id)]
  await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members,leader_id)
    VALUES($1,$2,$3,'group','自建项目讨论',$4::jsonb,$5)`,[roomId,companyId,projectId,JSON.stringify(members),ids.nova])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
    [roomId,companyId,JSON.stringify({ channelType: 2,members }),ids.nova])
  await pool.query(`INSERT INTO courses(id,company_id,project_id,created_by) VALUES('collab-course',$1,$2,'test-owner')`,[companyId,projectId])
  await pool.query(`INSERT INTO learning_course_rooms(course_id,company_id,conversation_id,purpose,created_by)
    VALUES('collab-course',$1,$2,'discussion','test-owner')`,[companyId,roomId])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,companyId,roomId)
  const source = { messageId: 'collab-request',version: 1 }, body = '本周完成一个有证据、有独立复核的课程练习，并整理反思。'
  im.messages.push({ channelId: roomId,channelType: 2,messageId: source.messageId,clientMsgNo: source.messageId,messageSeq: 1,
    fromUid: 'learner',timestamp: Date.now()/1000,payload: { version: 1,kind: 'text',clientMsgNo: source.messageId,body } })
  const accepted = await api.conversations.ingest({ tenantId: companyId,conversationId: roomId,policyVersion: policy.version,
    ...source,author: { id: 'learner',kind: 'human' },text: body,mentions: [ids.nova] },
  { mode: 'execute',executionClass: 'operation',codeExecution: 'disabled' })
  assert.equal(accepted.runs.length,1)
  return { companyId,projectId,ids,roomId,members,api,policy,source,run: accepted.runs[0] }
}

test('six real roster grants, source retrieval and Canvas candidates retain member and revocation boundaries', async t => {
  const f = await fixture(), tools = createProductTools(lingxiOSControl), product = createProductContext(tools)
  const previous = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  t.after(() => { if (previous === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED; else process.env.OPEN_NOTEBOOK_ENABLED = previous })
  await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,conversation_id,title,kind,status,visibility_scope,owner_user_id,created_by_user_id,created_via,external_source_id)
    VALUES('collab-source',$1,$2,$3,'课程证据','text','ready','PRIVATE','learner','learner','USER','source:collab')`,[f.companyId,f.projectId,f.roomId])
  await pool.query(`INSERT INTO knowledge_notebook_bindings(project_id,company_id,external_key,external_notebook_id,state)
    VALUES($1,$2,$1,'notebook:collab','ready')`,[f.projectId,f.companyId])
  t.mock.method(openNotebookClient,'getSource',async () => ({ id: 'source:collab',full_text: '实验的实际记录值为 7391。' }))
  const search = t.mock.method(openNotebookClient,'search',async () => [{ id: 'chunk:collab',parent_id: 'source:collab',content: '实验的实际记录值为 7391。' }])
  for (const agent of STARTER_TEAM) {
    const work: ActionContext['work'] = { id: f.run.runId,tenantId: f.companyId,agentId: f.ids[agent.presetKey],principalId: 'learner',
      sessionId: f.run.sessionId,kind: 'turn',lane: 'interactive',triggerRef: f.source.messageId,fence: 1,homeEpoch: 1,
      createdAt: new Date().toISOString(),meta: { text: '课程资料的证据是什么？' },
      conversation: { conversationId: f.roomId,policyVersion: f.policy.version,source: f.source,internal: false,
        audience: { visibility: 'conversation',participantIds: f.members } } }
    // Each agent has its own public identity when context binds a run.
    work.id = `roster-${agent.presetKey}`
    const context = await product.contextProvider.loadContext(work)
    assert.equal(context.persona?.name,agent.name)
    assert.ok(context.dynamic)
    assert.equal((context.dynamic.roster as unknown[]).length,6)
    const grants = await product.capabilityResolver.resolve(work)
    for (const capability of ['learning','canvas','knowledge','handoffs','research','documents']) assert.ok(grants.some(grant => grant.name === capability),capability)
    const action = { work,database: pool,signal: AbortSignal.timeout(10000),requestVersion: 1,
      action: { runId: work.id,cellId: 'read',callIndex: 0,action: 'canvas.available_agents',args: {},idempotencyKey: work.id } } as unknown as ActionContext
    const candidates = tools.find(tool => tool.action === 'canvas.available_agents')!
    await candidates.authorize(action,{})
    const result = await candidates.execute(action,{})
    assert.deepEqual((result.value as Array<{ id: string }>).map(item => item.id).sort(),Object.values(f.ids).sort())
    const read = tools.find(tool => tool.action === 'knowledge.list_sources')!
    const readContext = { ...action,action: { ...action.action,action: 'knowledge.list_sources' } }
    await read.authorize(readContext,{})
    assert.equal((await read.execute(readContext,{})).ok,true)
    for (const [name,args] of [['knowledge.search',{ query: '实际记录值' }],['knowledge.read_source',{ sourceId: 'collab-source' }]] as const) {
      const tool = tools.find(tool => tool.action === name)!, input = tool.parse(args), readContext = { ...action,action: { ...action.action,action: name } }
      await tool.authorize(readContext,input)
      const result = await tool.execute(readContext,input)
      assert.equal(result.evidence?.[0].excerpt,'实验的实际记录值为 7391。')
      assert.ok(result.evidence?.[0].sourceVersion)
    }
  }
  const work: ActionContext['work'] = { id: 'missing-roster',tenantId: f.companyId,agentId: f.ids.nova,principalId: 'learner',sessionId: 'roster',
    kind: 'turn',lane: 'interactive',triggerRef: 'question',fence: 1,homeEpoch: 1,createdAt: new Date().toISOString(),
    meta: { conversationId: f.roomId,text: '帮我查资料' } }
  await pool.query('UPDATE im_channel_bindings SET profile=jsonb_set(profile,\'{members}\',$2::jsonb) WHERE channel_id=$1', [f.roomId,JSON.stringify(['learner',f.ids.nova])])
  const missing = await product.contextProvider.loadContext(work)
  assert.ok(missing.dynamic)
  assert.ok((missing.dynamic.missingSpecialists as Array<{ name: string }>).some(agent => agent.name === '寻知'))
  assert.match(missing.productRules ?? '',/ask the user to add/)
  // Selection changes and upstream failures return explicit state, without fabricated evidence.
  const invokeRead = async (name = 'knowledge.search', args: object = { query: '实际记录值' }) => {
    const tool = tools.find(tool => tool.action === name)!, input = tool.parse(args)
    const context = { work,database: pool,signal: AbortSignal.timeout(10000),requestVersion: 1,
      action: { runId: work.id,cellId: 'search',callIndex: 0,action: name,args: input,idempotencyKey: 'search' } } as unknown as ActionContext
    await tool.authorize(context,input)
    return tool.execute(context,input)
  }
  search.mock.mockImplementation(async () => [])
  assert.equal(Reflect.get((await invokeRead()).value as object,'status'),'no_matches')
  search.mock.mockImplementation(async () => { throw new OpenNotebookError('fixture unavailable',503) })
  assert.deepEqual((await invokeRead()).value,{ status: 'unavailable',matches: [] })
  await pool.query("UPDATE knowledge_sources SET status='processing' WHERE id='collab-source'")
  assert.equal(Reflect.get((await invokeRead()).value as object,'status'),'processing')
  await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,'collab-source','learner')`,[f.roomId])
  assert.equal(Reflect.get((await invokeRead()).value as object,'status'),'no_sources')
  await pool.query("DELETE FROM conversation_source_exclusions WHERE source_id='collab-source'")
  await pool.query("UPDATE knowledge_sources SET status='ready' WHERE id='collab-source'")
  await seedUserMembership('reader',f.companyId,{ role: 'TEACHER' })
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES($1,$2,'reader','TEACHER')`,[f.companyId,f.projectId])
  await pool.query('UPDATE im_channel_bindings SET profile=jsonb_set(profile,\'{members}\',$2::jsonb) WHERE channel_id=$1',[f.roomId,JSON.stringify(['learner','reader',f.ids.nova])])
  work.conversation = { conversationId: f.roomId,policyVersion: (await syncConversationPolicy(f.api,f.companyId,f.roomId)).version,source: f.source,
    internal: false,audience: { visibility: 'conversation',participantIds: ['learner','reader',f.ids.nova] } }
  assert.deepEqual((await invokeRead('knowledge.list_sources',{})).value,[])
  assert.equal(Reflect.get((await invokeRead()).value as object,'status'),'no_sources')
  await assert.rejects(invokeRead('knowledge.read_source',{ sourceId: 'collab-source' }))
  await pool.query("UPDATE knowledge_sources SET visibility_scope='PROJECT' WHERE id='collab-source'")
  await pool.query(`INSERT INTO conversation_source_exclusions(conversation_id,source_id,user_id) VALUES($1,'collab-source','reader')`,[f.roomId])
  assert.equal(((await invokeRead('knowledge.list_sources',{})).value as Array<{ enabled: boolean }>)[0].enabled,false)
  await assert.rejects(invokeRead('knowledge.read_source',{ sourceId: 'collab-source' }),/excluded/)
  await pool.query("UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id=$2 AND user_id='learner'",[f.companyId,f.projectId])
  await assert.rejects(product.contextProvider.loadContext(work))
})

test('new course rooms retain all six agents after member synchronization', async () => {
  const f = await fixture()
  await insertCourse(pool,{ companyId: f.companyId,userId: 'test-owner',projectId: 'new-course-project',courseId: 'new-course',roomId: 'new-course-room',
    kind: 'INSTITUTIONAL_COURSE',planId: null,input: { name: '新课程',description: '',color: '#7756D8' } })
  const members = await syncStudyRoomMembers(pool,{ companyId: f.companyId,courseId: 'new-course',roomId: 'new-course-room',title: '新课程',topic: null,leaderId: f.ids.nova })
  assert.deepEqual(new Set(members),new Set(['test-owner',...Object.values(f.ids)]))
  assert.deepEqual((await pool.query("SELECT members,leader_id FROM conversations WHERE id='new-course-room'")).rows,[{ members,leader_id: f.ids.nova }])
  assert.deepEqual((await pool.query("SELECT profile->'members' AS members FROM im_channel_bindings WHERE channel_id='new-course-room'")).rows,[{ members }])
  assert.deepEqual((await pool.query('SELECT members FROM conversations WHERE id=$1',[f.roomId])).rows,[{ members: f.members }])
})

test('a shared learner room keeps Canvas available without exposing private learning context', async () => {
  const f = await fixture()
  await seedUserMembership('peer',f.companyId,{ role: 'STUDENT' })
  await pool.query(`INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES($1,$2,'peer','STUDENT')`,[f.companyId,f.projectId])
  const members = [...f.members,'peer']
  await pool.query('UPDATE conversations SET members=$2::jsonb WHERE id=$1',[f.roomId,JSON.stringify(members)])
  await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1",[f.roomId,JSON.stringify(members)])
  const policy = await syncConversationPolicy(f.api,f.companyId,f.roomId)
  const work: ActionContext['work'] = { id: 'shared-learning-run',tenantId: f.companyId,agentId: f.ids.nova,principalId: 'learner',
    sessionId: f.run.sessionId,kind: 'turn',lane: 'interactive',triggerRef: f.source.messageId,fence: 1,homeEpoch: 1,
    createdAt: new Date().toISOString(),meta: { text: '在 Canvas 中组织一次学习' },
    conversation: { conversationId: f.roomId,policyVersion: policy.version,source: f.source,internal: false,
      audience: { visibility: 'conversation',participantIds: members } } }
  const product = createProductContext(createProductTools(lingxiOSControl))
  const context = await product.contextProvider.loadContext(work)
  const grants = await product.capabilityResolver.resolve(work)
  assert.equal(context.dynamic?.learningContext,undefined)
  assert.ok(grants.some(grant => grant.name === 'canvas'))
  assert.ok(!grants.some(grant => grant.name === 'learning'))
})

test('changing a Mission coordinator publishes the current owner in the same transaction', async () => {
  const f = await fixture()
  const mission = await upsertLearningMission(pool,{ id: 'coordinator-mission',companyId: f.companyId,projectId: f.projectId,
    learnerId: 'learner',channelId: f.roomId,triggerClientMsgNo: f.source.messageId,goal: '完成练习',successCriteria: '独立检查',
    kind: 'PROJECT',coordinatorAgentId: f.ids.nova,createdBy: f.ids.nova })
  const input = { companyId: f.companyId,courseId: 'collab-course',missionId: mission.id,teacherId: 'test-owner',agentId: f.ids.forge }
  await assert.rejects(transaction(async db => {
    await assignLearningMissionCoordinator(db,input)
    throw new Error('fixture rollback')
  }),/fixture rollback/)
  assert.equal((await pool.query('SELECT coordinator_agent_id FROM learning_missions WHERE id=$1',[mission.id])).rows[0].coordinator_agent_id,f.ids.nova)
  assert.equal((await pool.query('SELECT id FROM agent_native_event_outbox WHERE company_id=$1',[f.companyId])).rowCount,0)
  await transaction(db => assignLearningMissionCoordinator(db,input))
  const events = (await pool.query('SELECT event FROM agent_native_event_outbox WHERE company_id=$1',[f.companyId])).rows
  assert.equal(events.length,1)
  assert.deepEqual([events[0].event.actorId,events[0].event.payload.data.coordinatorAgentId,events[0].event.payload.data.progressVersion],
    [f.ids.forge,f.ids.forge,1])
})

test('scripted native execution persists Mission → independent Canvas host → specialist and verifier reports → coordinator return', { timeout: 120000 }, async () => {
  const f = await fixture(), stages = new Map<string,number>(), usage = { available: true,inputTokens: 100,outputTokens: 30 }
  let work: WorkItem | undefined
  const toolsSeen = new Set<string>()
  const worker = createWorker({ controlPlane: { connectWorker(input) {
    const host = f.api.connectWorker(input)
    return { ...host,async claimWork(...args) { const claimed = await host.claimWork(...args); if (claimed) work = claimed; return claimed } }
  } },worker: { id: 'learning-collaboration',concurrency: 1,shutdownGraceMs: 1000 },
  processors: { handoff: 'conversation', canvas_worker: 'conversation', canvas_summary: 'conversation', mission_coordinator: 'conversation' },model: {
    modelId: 'collaboration-fixture',contextWindowTokens: 200000,
    async run(request) {
      assert.ok(work)
      const current = work, stage = stages.get(current.id) ?? 0
      stages.set(current.id,stage+1)
      const call = (name: string, args: unknown) => {
        assert.ok(request.tools?.some(tool => tool.name === name),`${current.agentId} lacks ${name}`)
        toolsSeen.add(name)
        return { output: [{ type: 'function_call' as const,callId: `${current.id}:${stage}`,name,arguments: JSON.stringify(args) }],text: '',model: 'collaboration-fixture',usage }
      }
      if (current.agentId === f.ids.nova) {
        if (stage === 0) return call('learning__start_mission',{ goal: '完成课程练习并独立复核',successCriteria: '有可核验报告和反思',missionKind: 'STUDY' })
        const mission = (await pool.query('SELECT id FROM learning_missions WHERE company_id=$1',[f.companyId])).rows[0]
        assert.ok(mission)
        if (stage === 1) return call('learning__add_steps',{ missionId: mission.id,steps: [
          { kind: 'CHECK',description: '验证练习',successCriteria: '独立报告支持结论' },
          { kind: 'REFLECT',description: '记录反思',successCriteria: '指出证据与局限' },
        ] })
        if (stage === 2) return call('learning__finish_planning',{ missionId: mission.id })
        if (stage === 3) return call('handoffs__create',{ toAgentId: f.ids.forge,title: '主持练习与独立复核',note: '建立 Canvas，等待报告后回传。' })
        if (stage === 4 || stage === 5) {
          assert.equal((await pool.query('SELECT 1 FROM canvas_agent_runs WHERE work_id=$1',[current.id])).rowCount,0,'Mission coordinator must remain free of the Canvas reporter role')
          const report = (await pool.query("SELECT evidence_id FROM canvas_assignment_reports WHERE company_id=$1 AND execution_role='reporter'",[f.companyId])).rows[0]
          assert.ok(report)
          const steps = (await pool.query('SELECT id FROM learning_mission_steps WHERE mission_id=$1 ORDER BY position',[mission.id])).rows
          return call('learning__update_step',{ missionId: mission.id,stepId: steps[stage-4].id,status: 'COMPLETED',outcome: '依据已保存并独立复核的报告完成',sourceEvidenceId: report.evidence_id })
        }
        if (stage === 6) return call('learning__complete_mission',{ missionId: mission.id })
      } else if (current.agentId === f.ids.forge) {
        if (stage === 0) return call('canvas__start_workspace',{ title: '练习证据',goal: '产出可独立复核的结论',members: [
          { agentId: f.ids.sage,assignment: '读取已提交目标并提供概念证据',executionRole: 'specialist' },
          { agentId: f.ids.trace,assignment: '独立检查报告',executionRole: 'verifier',verifiesAgentId: f.ids.sage,dependsOnAgentIds: [f.ids.sage] },
        ] })
        if (stage === 1) {
          const reports = (await pool.query('SELECT id FROM canvas_assignment_reports WHERE company_id=$1 AND assignment_id IS NOT NULL',[f.companyId])).rows
          assert.equal(reports.length,2)
          return call('canvas__submit_report',{ finding: '已消费专业报告和独立复核',evidenceRefs: [],confidence: 0.9,consumedReportIds: reports.map(row => row.id) })
        }
      } else if (current.agentId === f.ids.sage) {
        if (stage === 0) return call('knowledge__list_sources',{})
        if (stage === 1) return call('canvas__submit_report',{ finding: '已读原始学习目标',evidenceRefs: [{ kind: 'message',id: f.source.messageId }],confidence: 0.9 })
      } else if (current.agentId === f.ids.trace && stage === 0) {
        const builder = (await pool.query("SELECT id FROM canvas_assignment_reports WHERE company_id=$1 AND execution_role='specialist'",[f.companyId])).rows[0]
        assert.ok(builder)
        return call('canvas__submit_report',{ finding: '独立复核支持所述目标',evidenceRefs: [{ kind: 'message',id: f.source.messageId },{ kind: 'report',id: builder.id }],
          confidence: 0.9,verifiesReportId: builder.id,verdict: 'supported',disconfirmingChecks: ['已对照原始提交检查目标是否被改写'] })
      }
      return { output: [{ role: 'assistant' as const,content: '已完成并保存报告。' }],text: '已完成并保存报告。',model: 'collaboration-fixture',usage }
    },
    async structured() { return { value: { missing: [] },model: 'collaboration-fixture',usage } },
    async compact() { throw new Error('bounded integration must not compact') },
  } })
  try {
    const canvas = createCanvasRuntime(lingxiOSControl), signal = AbortSignal.timeout(110000)
    for (let attempt=0;attempt<40;attempt++) {
      await worker.runNext()
      await canvas.reconcile(pool,completeCanvasWork,signal)
      await reconcileHandoffs(pool,transaction,lingxiOSControl,signal)
      const run = await f.api.readRun(f.run)
      if (run && !['queued','leased','waiting'].includes(run.status)) { assert.equal(run.status,'succeeded',run.error ?? JSON.stringify(run.goalOutcome)); break }
      await delay(30)
    }
    const outcomes = await Promise.all([...stages.keys()].map(async id => {
      const identity = await readRunReference(pool,f.companyId,id), run = identity && await f.api.readRun(identity)
      return { agentId: identity?.agentId, stage: stages.get(id), status: run?.status, error: run?.error, goal: run?.goalOutcome }
    }))
    assert.equal((await f.api.readRun(f.run))?.status,'succeeded',JSON.stringify(outcomes))
    for (let attempt=0;attempt<100 && (await f.api.readRunState(f.run))?.delivery !== 'delivered';attempt++) await delay(50)
    assert.equal((await f.api.readRunState(f.run))?.delivery,'delivered')
    assert.deepEqual((await pool.query('SELECT status FROM learning_missions WHERE company_id=$1',[f.companyId])).rows,[{ status: 'COMPLETED' }])
    assert.deepEqual((await pool.query('SELECT status,run_settled FROM agent_handoffs WHERE company_id=$1',[f.companyId])).rows,[{ status: 'completed',run_settled: true }])
    assert.deepEqual((await pool.query('SELECT execution_role FROM canvas_assignment_reports WHERE company_id=$1 ORDER BY execution_role',[f.companyId])).rows,
      [{ execution_role: 'reporter' },{ execution_role: 'specialist' },{ execution_role: 'verifier' }])
    assert.ok(toolsSeen.has('knowledge__list_sources'))
    const events = (await pool.query("SELECT event FROM agent_native_event_outbox WHERE company_id=$1 AND event->>'type'='im.system'",[f.companyId])).rows.map(row => row.event)
    const plans = events.filter(event => event.payload.kind === 'learning_mission').sort((a,b) => a.payload.data.progressVersion-b.payload.data.progressVersion)
    assert.equal(plans.at(-1).payload.data.status,'COMPLETED')
    assert.equal(plans.at(-1).payload.data.steps.length,2)
    assert.ok(events.some(event => event.payload.kind === 'canvas' && event.payload.data.status === 'completed'))
    const before = events.length
    await canvas.reconcile(pool,completeCanvasWork,signal); await reconcileHandoffs(pool,transaction,lingxiOSControl,signal)
    assert.equal((await pool.query("SELECT 1 FROM agent_native_event_outbox WHERE company_id=$1 AND event->>'type'='im.system'",[f.companyId])).rowCount,before)
  } finally { await worker.stop() }
})

for (const outcome of ['failed','cancelled'] as const) test(`handoff ${outcome} follows the native child and durable progress delivery recovers after failure`, { timeout: 90000 }, async () => {
  const f = await fixture(), usage = { available: true,inputTokens: 10,outputTokens: 10 }
  let called = false
  const worker = createWorker({ controlPlane: f.api,worker: { id: `handoff-${outcome}`,concurrency: 1,shutdownGraceMs: 1000 },
    processors: { handoff: 'conversation' },model: { modelId: 'failure-fixture',contextWindowTokens: 200000,
      async run() {
        if (called) throw new Error('fixture model unavailable')
        called = true
        return { output: [{ type: 'function_call' as const,callId: 'delegate',name: 'handoffs__create',
          arguments: JSON.stringify({ toAgentId: f.ids.scout,title: '读取课程证据' }) }],text: '',model: 'failure-fixture',usage }
      },async structured() { return { value: { missing: [] },model: 'failure-fixture',usage } },
      async compact() { throw new Error('unexpected compaction') },
    } })
  try {
    await worker.runNext()
    const handoff = (await pool.query('SELECT id,child_work_id FROM agent_handoffs WHERE company_id=$1',[f.companyId])).rows[0]
    assert.ok(handoff)
    const identity = await readRunReference(pool,f.companyId,handoff.child_work_id)
    assert.ok(identity)
    if (outcome === 'cancelled') assert.equal(await f.api.cancel(identity),true)
    else await worker.runNext()
    assert.equal((await f.api.readRun(identity))?.status,outcome)
    const signal = AbortSignal.timeout(20000)
    const brokenTransaction: typeof transaction = run => withTransaction(pool,async client => {
      await run(client)
      throw new Error('fixture progress commit failure')
    })
    await assert.rejects(reconcileHandoffs(pool,brokenTransaction,lingxiOSControl,signal),/progress commit failure/)
    assert.deepEqual((await pool.query('SELECT status,run_settled FROM agent_handoffs WHERE id=$1',[handoff.id])).rows,[{ status: 'queued',run_settled: false }])
    await reconcileHandoffs(pool,transaction,lingxiOSControl,signal)
    assert.deepEqual((await pool.query('SELECT status,run_settled FROM agent_handoffs WHERE id=$1',[handoff.id])).rows,[{ status: outcome,run_settled: true }])
    const count = (await pool.query('SELECT id FROM agent_native_event_outbox WHERE company_id=$1',[f.companyId])).rowCount
    await reconcileHandoffs(pool,transaction,lingxiOSControl,signal)
    assert.equal((await pool.query('SELECT id FROM agent_native_event_outbox WHERE company_id=$1',[f.companyId])).rowCount,count)
    await flushNativeEvents(pool,async () => { throw new Error('fixture transport unavailable') },signal)
    assert.equal((await pool.query('SELECT id FROM agent_native_event_outbox WHERE company_id=$1 AND attempts>0 AND delivered_at IS NULL',[f.companyId])).rowCount,count)
    await pool.query('UPDATE agent_native_event_outbox SET available_at=NOW() WHERE company_id=$1',[f.companyId])
    const delivered: string[] = []
    await flushNativeEvents(pool,async event => { if (event.type === 'im.system' && event.payload.kind === 'handoff') delivered.push(String(event.payload.data?.status)) },signal)
    assert.ok(delivered.includes(outcome))
    assert.equal((await pool.query('SELECT id FROM agent_native_event_outbox WHERE company_id=$1 AND delivered_at IS NULL',[f.companyId])).rowCount,0)
  } finally { await worker.stop() }
})
