import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool } from 'pg'
import { register } from 'tsx/esm/api'
import { createLingxiOS, readRunReference } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'

const url = process.env.LINGXIOS_NATIVE_TEST_DATABASE_URL
assert.ok(url && /^native_/.test(new URL(url).pathname.slice(1)), 'requires an empty disposable database named native_*')
Object.assign(process.env, { DATABASE_URL: url, OPENAI_API_KEY: 'native-check', WUKONG_USER_TOKEN_SECRET: 'native-check-wukong-token',
  OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small', REDIS_URL: process.env.LINGXIOS_NATIVE_TEST_REDIS_URL ?? 'redis://127.0.0.1:56063', R2_ENDPOINT: 'http://127.0.0.1:1', R2_BUCKET: 'native-check',
  R2_ACCESS_KEY_ID: 'native-check', R2_SECRET_ACCESS_KEY: 'native-check', R2_PUBLIC_BASE: 'https://assets.test.invalid',
  R2_URL_SIGNING_SECRET: 'native-check-signing-secret', LINGXILOOP_INVITE_BASE_URL: 'https://app.test.invalid' })
const db = new Pool({ connectionString: url, max: 8 }), loader = register({ namespace: 'native-artifact-check' })
const root = await mkdtemp(join(tmpdir(), 'lingxios-native-artifact-'))
let control, worker, activeWork, failure = false, staleReportRejected = false
const actionPool = { query: (...args) => db.query(...args), async connect() {
  const client = await db.connect()
  return { release: error => client.release(error), async query(sql, params) {
    if (failure && sql.includes('INSERT INTO artifact_agent_assignments')) { failure = false; throw new Error('receipt interruption') }
    return client.query(sql, params)
  } }
} }
const messages = [{ message_id: 'native-message-1', message_seq: 1, client_msg_no: 'source', from_uid: 'learner', channel_id: 'study', channel_type: 2,
  payload: Buffer.from(JSON.stringify({ version: 1, kind: 'text', clientMsgNo: 'source', body: 'Learn to verify leases.' })).toString('base64') }]
const im = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  const input = JSON.parse(Buffer.concat(chunks).toString() || '{}')
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(req.url === '/channel/messagesync' ? { messages: input.start_message_seq ? [] : messages } : {}))
})
await new Promise(resolve => im.listen(0, '127.0.0.1', resolve))
try {
  assert.equal((await db.query("SELECT 1 FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')")).rows.length, 0)
  const { migrateDatabase, assertMigrationsCurrent } = await loader.import('../server/src/db/migrate.ts', import.meta.url)
  await migrateDatabase(db)
  await assertMigrationsCurrent(db)
  const { ensureEducationPlan } = await loader.import('../server/src/modules/entitlements/public.ts', import.meta.url)
  const { WukongClient, _setWukongClientForTests } = await loader.import('../server/src/im/wukong.ts', import.meta.url)
  _setWukongClientForTests(new WukongClient({ apiUrl: `http://127.0.0.1:${im.address().port}`, wsUrl: 'ws://unused', apiToken: 'test', webhookSecret: 'test' }))
  await ensureEducationPlan(db)
  await db.query(`INSERT INTO users(id,email,display_name) VALUES('teacher','teacher@test.invalid','Teacher'),('learner','learner@test.invalid','Learner');
    INSERT INTO companies(id,name,slug,type,plan_id) VALUES('t','Native tools','native-tools','EDUCATION','plan-education');
    INSERT INTO company_memberships(company_id,user_id,role) VALUES('t','teacher','TEACHER'),('t','learner','STUDENT');
    INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
      VALUES('contract','t','plan-education','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '1 year',10);
    INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
      VALUES('seat-teacher','t','contract','teacher','ACTIVE'),('seat-learner','t','contract','learner','ACTIVE');
    INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,capabilities)
      VALUES('teacher','t','human','Teacher','T','#667085','avail','[]'),('learner','t','human','Learner','L','#667085','avail','[]'),
      ('agent','t','agent','Agent','A','#667085','avail','["learning","design"]'),('coordinator','t','agent','Coordinator','C','#667085','avail','["learning","design"]');
    UPDATE participants SET preset_key='nova' WHERE id='coordinator';
    WITH period AS (INSERT INTO company_membership_periods(membership_id,role) SELECT id,role FROM company_memberships RETURNING id,membership_id)
    UPDATE company_memberships member SET period_id=period.id FROM period WHERE member.id=period.membership_id;
    INSERT INTO projects(id,company_id,kind,name,created_by) VALUES('p','t','INSTITUTIONAL_COURSE','Leases','teacher');
    INSERT INTO courses(id,company_id,project_id,created_by) VALUES('course','t','p','teacher');
    INSERT INTO project_memberships(company_id,project_id,user_id,role) VALUES('t','p','teacher','TEACHER'),('t','p','learner','STUDENT');
    INSERT INTO conversations(id,kind,title,members,company_id,project_id) VALUES('study','group','Study','["learner","agent","coordinator"]','t','p');
    UPDATE courses SET study_room_conversation_id='study' WHERE id='course';
    INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES('study','t','{"channelId":"study","channelType":2,"members":["learner","agent","coordinator"]}');
    INSERT INTO documents(id,company_id,project_id,title,created_by) VALUES('evidence-document','t','p','Learner evidence','learner');`)
  const { createArtifactTools } = await loader.import('../server/src/modules/artifacts/agent-tools.ts', import.meta.url)
  const { createArtifactRuntime } = await loader.import('../server/src/modules/artifacts/runtime.ts', import.meta.url)
  const { createArtifactApplication } = await loader.import('../server/src/modules/artifacts/application.ts', import.meta.url)
  const { createArtifactExecution } = await loader.import('../server/src/modules/artifacts/execution.ts', import.meta.url)
  const { createRoutineTools, scheduleRoutines } = await loader.import('../server/src/modules/routines/public.ts', import.meta.url)
  const { createProductContext } = await loader.import('../server/src/agent-runtime/context.ts', import.meta.url)
  const { createProductHarness } = await loader.import('../server/src/agent-runtime/harness.ts', import.meta.url)
  const { syncConversationPolicy } = await loader.import('../server/src/agent-runtime/conversations.ts', import.meta.url)
  await db.query(`INSERT INTO participants(id,company_id,kind,name,initial,avatar_bg,status,capabilities)
    VALUES('verifier','t','agent','Verifier','V','#667085','avail','["design"]');
    UPDATE participants SET capabilities=capabilities||'["routines"]'::jsonb WHERE kind='agent';
    UPDATE conversations SET members=members||'["verifier"]'::jsonb WHERE id='study';
    UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',profile->'members'||'["verifier"]'::jsonb) WHERE channel_id='study'`)
  // Keep learner context private to its original human and teacher in this room.
  await db.query("UPDATE participants SET capabilities='[\"design\",\"routines\"]' WHERE kind='agent'")
  const lifecycle = createArtifactRuntime(async () => control)
  const tools = [...createArtifactTools('design', async () => control),...createRoutineTools(async () => control)]
  control = await createLingxiOS({ database: actionPool, harness: createProductHarness(tools), ...createProductContext(tools),
    verifyRun: async context => { const records=await lifecycle.verify(context); if(context.work.agentId==='agent' && records.some(record=>record.status==='failed')) staleReportRejected=true; return records }, homesRoot: root, modelBudget: { maxModelCalls: 24 },
    delivery: { onEvent: async () => {}, deliverMessage: async (_work,_message,context) => ({ messageId: context.im.messageKey }) } })
  const transaction = async run => { const client=await db.connect(); try { await client.query('BEGIN'); const result=await run(client); await client.query('COMMIT'); return result }
    catch(error) { await client.query('ROLLBACK'); throw error } finally { client.release() } }
  const app = createArtifactApplication({ db, execution: createArtifactExecution(async () => control), transaction,
    withArtifactFence: async (_id,run) => run(db), missingChannelMessageIds: async () => [], publishEvent: async () => {}, deliverComment: async () => {} })
  const input={title:'Design verification',goal:'Build and verify fencing',members:[
    {agentId:'agent',assignment:'Build an artboard'},
    {agentId:'verifier',assignment:'Verify the artboard',executionRole:'verifier',verifiesAgentId:'agent'}]}
  assert.throws(()=>tools.find(tool=>tool.action==='design.start_workspace').parse({...input,members:[{agentId:'agent',assignment:42}]}))
  const hops = new Map(), usage = { available: true,inputTokens: 100,outputTokens: 30 }
  const model = { modelId: 'native-artifact-check',contextWindowTokens: 200000,
    async run(request) {
      const hop=(hops.get(activeWork.id) ?? 0)+1; hops.set(activeWork.id,hop)
      assert.ok(hop<12,'bounded artifact fixture must complete')
      const call=(name,args) => ({ output:[{type:'function_call',callId:`${activeWork.id}-${hop}`,name,arguments:JSON.stringify(args)}],text:'',model:'native-artifact-check',usage })
      if(activeWork.agentId==='coordinator') {
        if(hop===1) { failure=true; return call('design__start_workspace',input) }
        if(hop===2) { assert.equal((await db.query('SELECT 1 FROM artifact_agent_assignments')).rows.length,0); return call('design__start_workspace',input) }
        if(hop===3) return call('design__edit_file',{path:'project/Main.dc.html',oldString:'Text the builder never wrote',newString:'Must not be written.'})
        if(hop===4) {
          assert.equal((await db.query("SELECT 1 FROM artifact_files WHERE convert_from(body,'UTF8') LIKE '%Must not be written%'")).rows.length,0)
          assert.equal(JSON.parse(request.items.filter(item=>item.type==='function_call_output').at(-1).output).executionState,'rejected')
          const reports=(await db.query("SELECT id FROM artifact_assignment_reports WHERE author_agent_id IN ('agent','verifier') AND assignment_id IS NOT NULL")).rows
          assert.equal(reports.length,2,JSON.stringify(await Promise.all((await db.query('SELECT work_id FROM artifact_agent_runs WHERE assignment_id IS NOT NULL')).rows.map(async row => control.readDiagnostics(await readRunReference(db,'t',row.work_id))))))
          return call('design__submit_report',{finding:'Builder and independent verifier agree.',confidence:0.9,evidenceRefs:[],consumedReportIds:reports.map(row=>row.id)})
        }
      } else if(activeWork.agentId==='agent') {
        if(hop===1) return call('design__write_files',{files:{'project/Main.dc.html':{content:'<x-dc><p>A stale lease cannot write.</p></x-dc>'}}})
        const board=(await db.query("SELECT path AS id FROM artifact_files WHERE path='project/Main.dc.html'")).rows[0]; assert.ok(board,JSON.stringify(request.items.filter(item=>item.type==='function_call_output')))
        if(hop===3) return call('design__edit_file',{path:board.id,oldString:'cannot write.',newString:'cannot write. Cancellation revokes descendants.'})
        if(hop===5) assert.equal(staleReportRejected,true,'changed evidence must invalidate the old report')
        if(hop===2 || hop===5) return call('design__submit_report',{finding:'The artboard describes fenced writes.',evidenceRefs:[{kind:'file',id:board.id}],confidence:0.9})
      } else if(activeWork.agentId==='verifier') {
        const report=(await db.query("SELECT id FROM artifact_assignment_reports WHERE author_agent_id='agent' AND assignment_id IS NOT NULL")).rows[0]
        assert.ok(report,'verifier runs after the builder report exists')
        const builder=(await db.query("SELECT work_id FROM artifact_agent_runs WHERE agent_id='agent'")).rows[0]
        assert.equal((await control.readRun(await readRunReference(db,'t',builder.work_id))).status,'succeeded')
        if(hop===1) return call('design__submit_verification',{finding:'The builder is supported.',evidenceRefs:[{kind:'file',id:'project/Main.dc.html'}],confidence:0.9,
          verifiesReportId:report.id,disconfirmingChecks:['Checked whether stale epochs could write.'],verdict:'supported'})
      }
      const text='Persisted and checked Design results.'
      return {output:[{role:'assistant',content:text}],text,model:'native-artifact-check',usage}
    },
    async structured() { return {value:{missing:[]},model:'native-artifact-check',usage} },
    async compact() { throw new Error('bounded check must not compact') },
  }
  function makeWorker(id) {
    return createWorker({ controlPlane: { connectWorker(options) {
      const host=control.connectWorker(options)
      return {...host,async claimWork(...args) { const work=await host.claimWork(...args); if(work) activeWork=work; return work } }
    } },model,kernel:{homesRoot:root},worker:{id} })
  }
  const policy=await syncConversationPolicy(control,'t','study')
  const accepted=await control.conversations.ingest({tenantId:'t',conversationId:'study',policyVersion:policy.version,messageId:'source',version:1,
    author:{id:'learner',kind:'human'},text:'Build and independently verify the Design result.',mentions:['coordinator']},{mode:'execute',executionClass:'operation'})
  const parent=accepted.runs[0]
  assert.ok(parent); assert.notEqual(parent.sessionId,'study')
  worker=makeWorker('artifact-first')
  assert.equal(await worker.runNext(),true)
  assert.equal((await control.readRun(parent)).status,'waiting',JSON.stringify(await control.readDiagnostics(parent)))
  const designId=(await db.query("SELECT id FROM artifacts WHERE kind='design'")).rows[0].id
  const collaboration=await lifecycle.readCollaboration(db,'t','learner',designId)
  assert.equal(collaboration.graphs.length,1)
  assert.equal(collaboration.graphs[0].nodes.length,2)
  const change={operationId:'finding',changes:[{field:'finding',expectedVersion:0,value:'Observed'}]}
  assert.equal((await lifecycle.updateSharedState(db,'t','learner',designId,change)).ok,true)
  assert.equal((await lifecycle.updateSharedState(db,'t','learner',designId,change)).deduplicated,true)
  assert.equal((await lifecycle.updateSharedState(db,'t','learner',designId,{...change,operationId:'stale'})).ok,false)
  // Resume the persisted graph with a different actual Worker; no runtime SQL fixtures.
  await worker.stop(); worker=makeWorker('artifact-second')
  const deadline=Date.now()+15000
  while((await control.readRun(parent)).status!=='succeeded' && Date.now()<deadline) {
    if(!await worker.runNext()) await new Promise(resolve=>setTimeout(resolve,20))
    const snapshot=await control.readRun(parent)
    assert.ok(!['failed','cancelled','blocked'].includes(snapshot.status),JSON.stringify({parent:await control.readDiagnostics(parent),children:await Promise.all((await db.query('SELECT work_id FROM artifact_agent_runs WHERE assignment_id IS NOT NULL')).rows.map(async row=>control.readDiagnostics(await readRunReference(db,'t',row.work_id))))}))
  }
  assert.equal((await control.readRun(parent)).status,'succeeded')
  assert.equal((await db.query('SELECT id FROM artifact_assignment_reports')).rows.length,4)
  assert.equal(staleReportRejected,true)
  await lifecycle.reconcile(db,app.completeArtifactWork,AbortSignal.timeout(10000))
  assert.equal((await app.getArtifactSnapshot('t',designId)).status,'completed')
  assert.ok((await lifecycle.readCollaboration(db,'t','learner',designId)).history.items.length)
  await db.query("UPDATE project_memberships SET status='SUSPENDED' WHERE user_id='learner'")
  await assert.rejects(lifecycle.readCollaboration(db,'t','learner',designId))
  console.log('Native Design artifact: real Worker graph, rollback, builder/verifier ordering, restart, parent report, shared state conflict/idempotency, projection and authorization passed.')
} finally {
  await worker?.stop()
  await control?.stop()
  const { closeDatabasePools } = await loader.import('../server/src/db/pool.ts', import.meta.url)
  await closeDatabasePools()
  const { redis, sub } = await loader.import('../server/src/redis.ts', import.meta.url)
  redis.disconnect(); sub.disconnect()
  await db.end(); await new Promise(resolve => im.close(resolve)); loader.unregister()
  await rm(root,{ recursive: true, force: true })
}
