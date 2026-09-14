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
const db = new Pool({ connectionString: url, max: 8 }), loader = register({ namespace: 'native-learning-check' })
const root = await mkdtemp(join(tmpdir(), 'lingxios-native-learning-'))
let control, worker, failure = false
const actionPool = { query: (...args) => db.query(...args), async connect() {
  const client = await db.connect()
  return { release: error => client.release(error), async query(sql, params) {
    if (failure && sql.includes('INSERT INTO learning_knowledge_units')) { failure = false; throw new Error('receipt interruption') }
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
  const { learningTools } = await loader.import('../server/src/modules/learning/agent-tools.ts', import.meta.url)
  const { teacherTools } = await loader.import('../server/src/modules/learning/teacher-agent-tools.ts', import.meta.url)
  const { scheduleRoutines } = await loader.import('../server/src/modules/routines/public.ts', import.meta.url)
  const { createRoutineTools } = await loader.import('../server/src/modules/routines/agent-tools.ts', import.meta.url)
  const { withTransaction } = await loader.import('../server/src/db/transaction.ts', import.meta.url)
  const { ensureTeacherAgentForCourse } = await loader.import('../server/src/modules/learning/teacher-agent-application.ts', import.meta.url)
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
      ('agent','t','agent','Agent','A','#667085','avail','["learning","canvas","routines"]'),('coordinator','t','agent','Coordinator','C','#667085','avail','["learning","canvas"]');
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
  const client = await db.connect()
  let teacher
  try { await client.query('BEGIN'); teacher = await ensureTeacherAgentForCourse('t','course',client, run => run(client)); await client.query('COMMIT') }
  catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
  const { createProductContext } = await loader.import('../server/src/agent-runtime/context.ts', import.meta.url)
  const { createProductHarness } = await loader.import('../server/src/agent-runtime/harness.ts', import.meta.url)
  const { syncConversationPolicy } = await loader.import('../server/src/agent-runtime/conversations.ts', import.meta.url)
  const tools=[...learningTools,...teacherTools,...createRoutineTools(async()=>control)]
  control=await createLingxiOS({database:actionPool,harness:createProductHarness(tools),...createProductContext(tools),homesRoot:root,
    modelBudget:{maxModelCalls:30},delivery:{onEvent:async()=>{},deliverMessage:async(_work,_message,context)=>({messageId:context.im.messageKey})}})
  let mode='teacher',hop=0,objectiveId,activityId,attemptId,evaluationId
  const usage={available:true,inputTokens:100,outputTokens:30}
  const model={modelId:'native-learning-check',contextWindowTokens:200000,
    async run() {
      hop++; assert.ok(hop<16,'bounded learning fixture must complete')
      const call=(name,args) => ({output:[{type:'function_call',callId:`${mode}-${hop}`,name,arguments:JSON.stringify(args)}],text:'',model:'native-learning-check',usage})
      if(mode==='teacher') {
        const input={objectives:[{title:'Leases',successCriteria:'Explain fencing'}]}
        if(hop===1) return call('teacher__draft_objectives',{objectives:[{title:42}]})
        if(hop===2) {failure=true;return call('teacher__draft_objectives',input)}
        if(hop===3) {assert.equal((await db.query('SELECT 1 FROM learning_knowledge_units')).rows.length,0);return call('teacher__draft_objectives',input)}
        const objective=(await db.query('SELECT id,created_by FROM learning_knowledge_units')).rows[0]
        objectiveId=objective.id;assert.equal(objective.created_by,teacher.agentId)
        if(hop===4) return call('teacher__publish_objective',{objectiveId})
        if(hop===5) return call('teacher__draft_activity',{title:'Lease exercise',instructions:'Show a fenced write',type:'PRACTICE',objectiveIds:[objectiveId]})
        activityId=(await db.query('SELECT id FROM learning_activities')).rows[0].id
        if(hop===6) return call('teacher__publish_activity',{activityId})
        if(hop===7) return call('teacher__configure_digest',{frequency:'daily',localTime:'09:00',timezone:'Asia/Shanghai'})
        if(hop===8) return call('teacher__overview',{})
      } else if(mode==='learner') {
        if(hop===1) return call('learning__record_attempt',{activityId,documentIds:['evidence-document']})
        attemptId=(await db.query('SELECT id FROM learning_attempts')).rows[0].id
        if(hop===2) return call('learning__propose_evaluation',{attemptId,demonstratedLevel:2,confidence:0.9,rubricResults:[{label:'Fencing',score:2,weight:1}]})
        evaluationId=(await db.query('SELECT id FROM learning_evaluations')).rows[0].id
        if(hop===3) return call('learning__get_attempt',{attemptId})
      } else if(mode==='review') {
        if(hop===1) return call('teacher__review_evaluation',{evaluationId,decision:'accept',reason:'The persisted evidence supports level 2.'})
        if(hop===2) return call('teacher__get_attempt',{attemptId})
      } else if(mode==='mission') {
        if(hop===1) return call('learning__start_mission',{goal:'Understand leases',successCriteria:'Explain fencing',sourceClientMsgNo:'source'})
        throw new Error('mission should wait for its coordinator')
      } else if(mode==='routine') {
        if(hop===1) return call('routines__create',{kind:'conversation',title:'Lease reminder',instructions:'Review lease fencing',schedule:{everyMinutes:60},timezone:'Asia/Shanghai'})
        const routine=(await db.query("SELECT id,status,created_by,channel_id FROM agent_routines WHERE kind='conversation'")).rows[0]
        assert.equal(routine.created_by,'learner');assert.equal(routine.channel_id,'study')
        if(hop===2) {assert.equal(routine.status,'paused');return call('routines__activate',{routineId:routine.id})}
        if(hop===3) {assert.equal(routine.status,'active');return call('routines__pause',{routineId:routine.id})}
        assert.equal(routine.status,'paused')
        if(hop===4) return call('routines__list',{})
      } else if(mode==='revoked') throw new Error('revoked teacher must not reach model')
      const text='Persisted and checked the learning results.'
      return {output:[{role:'assistant',content:text}],text,model:'native-learning-check',usage}
    },async structured(){return {value:{missing:[]},model:'native-learning-check',usage}},
    async compact(){throw new Error('bounded fixture must not compact')},
  }
  const makeWorker=id=>createWorker({controlPlane:control,model,kernel:{homesRoot:root},worker:{id},
    processors:{mission_coordinator:'conversation',teacher_digest:'conversation'}})
  worker=makeWorker('learning-first')
  async function enqueue(nextMode,agentId,principalId,conversationId) {
    mode=nextMode;hop=0
    const policy=await syncConversationPolicy(control,'t',conversationId)
    const accepted=await control.conversations.ingest({tenantId:'t',conversationId,policyVersion:policy.version,messageId:nextMode,version:1,
      author:{id:principalId,kind:'human'},text:'Verify native learning operations.',mentions:[agentId]},{mode:'execute',executionClass:'operation'})
    assert.equal(accepted.runs.length,1);assert.notEqual(accepted.runs[0].sessionId,conversationId)
    return accepted.runs[0]
  }
  async function complete(identity) {
    for(let pass=0;pass<8;pass++) {
      assert.equal(await worker.runNext(),true)
      const outcome=await control.readOutcome(identity)
      if(outcome?.status==='awaiting_approval') {
        // The next Worker resumes the persisted approved action, not a handmade session.
        await worker.stop();await control.decideApproval({...identity,approvalId:outcome.approvalId,approved:true})
        worker=makeWorker(`learning-${mode}-${pass}`)
      } else {assert.equal((await control.readRun(identity)).status,'succeeded',JSON.stringify(await control.readDiagnostics(identity)));return}
    }
    assert.fail('approval loop did not complete')
  }
  const teacherRun=await enqueue('teacher',teacher.agentId,'teacher',teacher.roomId)
  await complete(teacherRun)
  assert.equal((await control.readDiagnostics(teacherRun)).actions.filter(row=>row.result.executionState==='no_effect').length,1)
  const learnerRun=await enqueue('learner','agent','learner','study');await complete(learnerRun)
  assert.equal((await db.query('SELECT status FROM learning_evaluations')).rows[0].status,'PENDING')
  const reviewRun=await enqueue('review',teacher.agentId,'teacher',teacher.roomId);await complete(reviewRun)
  assert.equal((await db.query('SELECT status FROM learning_evaluations')).rows[0].status,'ACCEPTED')
  await db.query("UPDATE agent_routines SET next_run_at=NOW()-INTERVAL '1 minute'")
  assert.equal((await Promise.all([scheduleRoutines(run=>withTransaction(db,run),async()=>control),scheduleRoutines(run=>withTransaction(db,run),async()=>control)])).reduce((a,b)=>a+b),1)
  const digest=(await db.query('SELECT work_id,principal_id FROM agent_routine_runs')).rows[0]
  const digestIdentity=await readRunReference(db,'t',digest.work_id)
  assert.equal(digest.principal_id,'teacher');assert.notEqual(digestIdentity.sessionId,teacher.roomId)
  assert.equal((await control.readRun(digestIdentity)).kind,'teacher_digest')
  await control.cancel(digestIdentity)
  const routineRun=await enqueue('routine','agent','learner','study');await complete(routineRun)
  assert.equal((await db.query("SELECT status,next_run_at FROM agent_routines WHERE kind='conversation'")).rows[0].next_run_at,null)
  const missionRun=await enqueue('mission','agent','learner','study')
  assert.equal(await worker.runNext(),true)
  assert.equal((await control.readRun(missionRun)).status,'waiting',JSON.stringify(await control.readDiagnostics(missionRun)))
  const missionOutcome=await control.readOutcome(missionRun)
  const childIdentity=await readRunReference(db,'t',missionOutcome.taskRef)
  assert.ok(childIdentity);assert.equal(childIdentity.principalId,'learner');assert.notEqual(childIdentity.sessionId,'study')
  assert.equal((await control.readRun(childIdentity)).kind,'mission_coordinator')
  await control.cancel(missionRun)
  assert.equal((await control.readRun(childIdentity)).status,'cancelled')
  const revoked=await enqueue('revoked',teacher.agentId,'teacher',teacher.roomId)
  await db.query("UPDATE project_memberships SET status='SUSPENDED' WHERE user_id='teacher'")
  assert.equal(await worker.runNext(),true)
  assert.equal((await control.readRun(revoked)).status,'failed');assert.equal(hop,0)
  assert.equal((await db.query("SELECT name FROM projects WHERE id='p'")).rows[0].name,'Leases')
  console.log('Native Learning/Teacher: actual Worker, rollback, attribution, cross-worker approvals, learner evidence, teacher review, concurrent scheduling, isolated child identity, cancellation and revocation passed.')
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
