import { createNativeMessage, nativeData } from '../../../src/lib/nativeMessage'
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import type { ActionContext, WorkItem } from '@lyyzka/lingxios'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { createProductTools } from '../agent-runtime/tools.js'
import { createProductContext } from '../agent-runtime/context.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
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
    fromUid: 'learner',timestamp: Date.now()/1000,payload: createNativeMessage({ id: source.messageId, role: 'user', createdAt: new Date(0).toISOString(), content: [{ type: 'text', text: body }] }) })
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
    for (const capability of ['learning','canvas','knowledge','research','documents','memory']) assert.ok(grants.some(grant => grant.name === capability),capability)
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
  assert.match(missing.productRules ?? '',/ask the human to add/)
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
  assert.deepEqual([events[0].event.actorId,nativeData(events[0].event.payload,'learning-mission')?.coordinatorAgentId,events[0].event.payload.metadata.custom.progressVersion],
    [f.ids.forge,f.ids.forge,1])
})


// Failure cases: business creation silently starts a coordinator/DAG, evidence is
// self-certified, public turns lack business bindings, or completion resumes a sender.
test('Mission and Canvas finish through public mentions, evidence and independent review', { timeout: 120000 }, async () => {
  const f = await fixture(), stages = new Map<string, number>(), usage = { available: true, inputTokens: 100, outputTokens: 30 }
  let work: WorkItem | undefined
  const toolsSeen = new Set<string>()
  const worker = createWorker({ controlPlane: { connectWorker(input) {
    const host = f.api.connectWorker(input)
    return { ...host, async claimWork(...args) { const claimed = await host.claimWork(...args); if (claimed) work = claimed; return claimed } }
  } }, worker: { id: 'public-learning-collaboration', concurrency: 1, shutdownGraceMs: 1000 }, model: {
    modelId: 'collaboration-fixture', contextWindowTokens: 200000,
    async run(request) {
      assert.ok(work)
      const current = work, stage = stages.get(current.id) ?? 0
      stages.set(current.id, stage + 1)
      assert.ok(!request.tools?.some(tool => /^(handoffs__|graph__|canvas__(assign|handoff)$)/.test(tool.name)))
      const call = (name: string, args: unknown) => {
        assert.ok(request.tools?.some(tool => tool.name === name), name)
        toolsSeen.add(name)
        return { output: [{ type: 'function_call' as const, callId: current.id + ':' + stage, name, arguments: JSON.stringify(args) }], text: '', model: 'collaboration-fixture', usage }
      }
      const reply = (text: string) => ({ output: [{ role: 'assistant' as const, content: text }], text, model: 'collaboration-fixture', usage })
      if (current.agentId === f.ids.nova && current.id === f.run.runId) {
        if (stage === 0) return call('learning__start_mission', { goal: '完成课程练习并独立复核', successCriteria: '有可核验报告和反思', missionKind: 'STUDY' })
        const mission = (await pool.query('SELECT id FROM learning_missions WHERE company_id=$1', [f.companyId])).rows[0]
        if (stage === 1) return call('learning__add_steps', { missionId: mission.id, steps: [
          { kind: 'CHECK', description: '验证练习', successCriteria: '独立报告支持结论' },
          { kind: 'REFLECT', description: '记录反思', successCriteria: '指出证据与局限' },
        ] })
        if (stage === 2) return call('learning__finish_planning', { missionId: mission.id })
        assert.equal((await f.api.listRuns({ tenantId: f.companyId, limit: 100 })).items.length, 1, 'creating a Mission must not enqueue work')
        return reply('@' + f.ids.forge + ' 请建立练习画布，并安排明理提供证据、溯源独立复核。')
      }
      if (current.agentId === f.ids.forge) {
        if (stage === 0) return call('canvas__start_workspace', { title: '练习证据', goal: '产出可独立复核的结论', members: [
          { agentId: f.ids.sage, assignment: '读取已提交目标并提供概念证据', executionRole: 'specialist' },
          { agentId: f.ids.trace, assignment: '独立检查报告', executionRole: 'verifier', verifiesAgentId: f.ids.sage },
        ] })
        assert.equal((await f.api.listRuns({ tenantId: f.companyId, limit: 100 })).items.length, 2, 'creating a Canvas must not enqueue work')
        return reply('@' + f.ids.sage + ' 请读取目标并提交有证据的报告，再明确提及溯源复核。')
      }
      if (current.agentId === f.ids.sage) {
        if (stage === 0) return call('knowledge__list_sources', {})
        if (stage === 1) return call('canvas__submit_report', { finding: '已读原始学习目标', evidenceRefs: [{ kind: 'message', id: f.source.messageId }], confidence: 0.9 })
        return reply('@' + f.ids.trace + ' 请独立复核画布中的报告，核对原始提交的目标。')
      }
      if (current.agentId === f.ids.trace) {
        if (stage === 0) {
          const builder = (await pool.query("SELECT id FROM canvas_assignment_reports WHERE company_id=$1 AND execution_role='specialist'", [f.companyId])).rows[0]
          assert.ok(builder)
          return call('canvas__submit_report', { finding: '独立复核支持所述目标', evidenceRefs: [{ kind: 'message', id: f.source.messageId }, { kind: 'report', id: builder.id }],
            confidence: 0.9, verifiesReportId: builder.id, verdict: 'supported', disconfirmingChecks: ['已对照原始提交检查目标是否被改写'] })
        }
        return reply('@' + f.ids.nova + ' 独立复核已保存，请更新学习任务的检查与反思证据。')
      }
      assert.equal(current.agentId, f.ids.nova)
      const mission = (await pool.query('SELECT id FROM learning_missions WHERE company_id=$1', [f.companyId])).rows[0]
      if (stage < 2) {
        const report = (await pool.query("SELECT evidence_id FROM canvas_assignment_reports WHERE company_id=$1 AND execution_role='verifier'", [f.companyId])).rows[0]
        const steps = (await pool.query('SELECT id FROM learning_mission_steps WHERE mission_id=$1 ORDER BY position', [mission.id])).rows
        return call('learning__update_step', { missionId: mission.id, stepId: steps[stage].id, status: 'COMPLETED', outcome: '依据独立复核的证据完成', sourceEvidenceId: report.evidence_id })
      }
      if (stage === 2) return call('learning__complete_mission', { missionId: mission.id })
      return reply('学习任务的检查与反思已保存完成。')
    },
    async structured() { return { value: { missing: [] }, model: 'collaboration-fixture', usage } },
    async compact() { throw new Error('bounded integration must not compact') },
  } })
  try {
    const canvas = createCanvasRuntime(lingxiOSControl), signal = AbortSignal.timeout(110000)
    const deadline = Date.now() + 100000
    while ((await pool.query("SELECT 1 FROM learning_missions WHERE company_id=$1 AND status='COMPLETED'", [f.companyId])).rows.length === 0) {
      assert.ok(Date.now() < deadline, 'public learning collaboration timed out')
      await worker.runNext()
      await canvas.reconcile(pool, completeCanvasWork, signal)
      await delay(50)
    }
    await canvas.reconcile(pool, completeCanvasWork, signal)
    const runs = (await f.api.listRuns({ tenantId: f.companyId, limit: 100 })).items
    assert.equal(runs.length, 5)
    assert.equal((await pool.query('SELECT 1 FROM agent_handoffs')).rows.length, 0)
    assert.equal((await pool.query('SELECT 1 FROM lingxios.agent_work_waits')).rows.length, 0)
    assert.equal((await pool.query('SELECT 1 FROM canvas_agent_runs WHERE parent_work_id IS NOT NULL OR graph_id IS NOT NULL')).rows.length, 0)
    assert.deepEqual((await pool.query('SELECT execution_role FROM canvas_assignment_reports WHERE company_id=$1 ORDER BY execution_role', [f.companyId])).rows,
      [{ execution_role: 'specialist' }, { execution_role: 'verifier' }])
    assert.deepEqual((await pool.query('SELECT status FROM canvases WHERE company_id=$1', [f.companyId])).rows, [{ status: 'completed' }])
    assert.ok(toolsSeen.has('knowledge__list_sources'))
    assert.equal((await pool.query('SELECT 1 FROM agent_run_bindings WHERE internal')).rows.length, 0)
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir('artifacts/group-mentions', { recursive: true })
    await writeFile('artifacts/group-mentions/learning.json', JSON.stringify({ passed: true, tools: [...toolsSeen], runs: runs.map(run => run.identity),
      checks: ['mission-without-child', 'canvas-without-DAG', 'public-mentions', 'persisted-evidence', 'independent-verifier', 'no-auto-return'] }, null, 2))
  } finally { await worker.stop() }
})
