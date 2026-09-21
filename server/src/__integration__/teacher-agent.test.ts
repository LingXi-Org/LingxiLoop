import assert from 'node:assert/strict'
import { installRecordingWukong } from './_recording-wukong.js'
import { seedMembershipPeriod } from './_helpers.js'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { createWorker } from '@lyyzka/lingxios/worker'
import type { ActionContext } from '@lyyzka/lingxios'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { createProductContext } from '../agent-runtime/context.js'
import { createProductTools } from '../agent-runtime/tools.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import type { Queryable } from '../db/queryable.js'
import { withTransaction } from '../db/transaction.js'
import {
  assertTeacherApprovalFresh,
  closeTeacherRoomForCourse,
  ensureTeacherAgentForCourse,
  nextTeacherDigestRun,
  reactivateTeacherRoomForCourse,
  teacherActionRequiresApproval,
} from '../modules/learning/teacher-agent-application.js'
import {
  findTeacherAttemptDetail,
  listTeacherLearnerRows,
  listTeacherObjectives,
  loadTeacherOverviewRows,
} from '../modules/learning/teacher-reporting-repository.js'
import {
  findTeacherScopeBinding,
  findTeacherTurnCounts,
} from '../modules/learning/teacher-runtime-repository.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { installFakeWukong(); await resetAllTables() })
after(async () => { await teardownAll() })

const teacherTransaction = <T>(work: (client: Queryable) => Promise<T>) => withTransaction(pool, work)

test('[integration] Pulse can send conversational messages only in its active authorized teacher room', async t => {
  const im = await installRecordingWukong()
  t.after(async () => { await stopLingxiOSControl(); await im.close() })
  const fixture = await seedTeacherCourse()
  const pulse = await ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,fixture.companyId,pulse.roomId)
  const source = { messageId: 'teacher-style',version: 1 }
  const accepted = await api.conversations.ingest({ tenantId: fixture.companyId,conversationId: pulse.roomId,
    policyVersion: policy.version,...source,author: { id: fixture.teacherId,kind: 'human' },text: '解释班级情况。',mentions: [pulse.agentId] })
  const run = accepted.runs[0]; assert.ok(run)
  const work: ActionContext['work'] = { id: run.runId,tenantId: fixture.companyId,agentId: pulse.agentId,
    principalId: fixture.teacherId,sessionId: run.sessionId,kind: 'turn',lane: 'interactive',triggerRef: source.messageId,
    fence: 1,homeEpoch: 1,createdAt: new Date().toISOString(),meta: { text: '解释班级情况。' },
    conversation: { conversationId: pulse.roomId,policyVersion: policy.version,source,internal: false,
      audience: { visibility: 'conversation',participantIds: policy.participants.map(member => member.id) } } }
  const tools = createProductTools(lingxiOSControl), product = createProductContext(tools)
  const loaded = await product.contextProvider.loadContext(work)
  assert.match(loaded.productRules ?? '',/User-facing IM conversation/)
  assert.match(loaded.productRules ?? '',/answer from them without tools when they are sufficient/)
  assert.match(JSON.stringify(loaded.dynamic?.teacherContext),/"learners":1/)
  assert.deepEqual((await product.capabilityResolver.resolve(work)).filter(grant => grant.name === 'chat'),[{ name: 'chat',methods: ['send'] }])
  const input = { body: '先从班级整体情况看起。' }, send = tools.find(tool => tool.action === 'chat.send')!
  const context = { work,database: pool,signal: AbortSignal.timeout(15000),requestVersion: 1,
    action: { runId: run.runId,cellId: 'teacher-send',callIndex: 0,action: 'chat.send',args: input,idempotencyKey: 'teacher-style-send' },
  } as unknown as ActionContext
  await send.authorize(context,input)
  assert.equal((await send.execute(context,input)).ok,true)
  assert.deepEqual((await pool.query(`SELECT input->>'text' AS body,outcome->>'reason' AS reason
    FROM lingxios.agent_im_messages WHERE tenant_id=$1 AND conversation_id=$2 AND input->'author'->>'kind'='agent'`,
  [fixture.companyId,pulse.roomId])).rows,[{ body: input.body,reason: 'agent_message' }])
  await assert.rejects(send.authorize({ ...context,work: { ...work,kind: 'teacher_digest',lane: 'background' } },input),/capability or membership/)
  await assert.rejects(send.authorize({ ...context,work: { ...work,lane: 'background' } },input),/capability or membership/)
  await assert.rejects(send.authorize({ ...context,work: { ...work,conversation: { ...work.conversation!,internal: true } } },input),/capability or membership/)
  await assert.rejects(tools.find(tool => tool.action === 'chat.ask')!.authorize({ ...context,
    action: { ...context.action,action: 'chat.ask' } },{}),/capability or membership/)
  await pool.query("UPDATE learning_course_teacher_rooms SET status='closed' WHERE company_id=$1 AND conversation_id=$2",[fixture.companyId,pulse.roomId])
  await assert.rejects(send.authorize(context,input),/closed/)
  await pool.query("UPDATE learning_course_teacher_rooms SET status='active' WHERE company_id=$1 AND conversation_id=$2",[fixture.companyId,pulse.roomId])
  await pool.query("UPDATE project_memberships SET status='SUSPENDED' WHERE company_id=$1 AND project_id=$2 AND user_id=$3",[fixture.companyId,fixture.projectId,fixture.teacherId])
  await assert.rejects(send.authorize(context,input))
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM im_send_acceptances WHERE company_id=$1',[fixture.companyId])).rows[0].count,1)
  await stopLingxiOSControl()
})

test('[integration] Pulse replies over the control plane without memory and rejects revoked membership', async () => {
  const fixture = await seedTeacherCourse()
  const pulse = await ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  const app = await lingxiOSControl()
  const policy = await syncConversationPolicy(app,fixture.companyId,pulse.roomId)
  const accepted = await app.conversations.ingest({ tenantId: fixture.companyId,conversationId: pulse.roomId,
    policyVersion: policy.version,messageId: 'teacher-memory-regression',version: 1,
    author: { id: fixture.teacherId,kind: 'human' },text: 'Reply Ready.',mentions: [pulse.agentId] },
  { mode: 'chat',executionClass: 'conversation',codeExecution: 'disabled' })
  const run = accepted.runs[0]; assert.ok(run)
  await bindProductRun(pool,run,pulse.roomId)
  const identity = { tenantId: fixture.companyId,principalId: fixture.teacherId,agentId: pulse.agentId,sessionId: run.sessionId,workId: run.runId }
  assert.deepEqual(await app.memory!.scopes(identity),[])
  const serviceToken = 'teacher-memory-regression-service-token'
  const port = await app.listenControlPlane({ serviceToken,port: 0,host: '127.0.0.1' })
  const usage = { available: true,inputTokens: 100,outputTokens: 10 }
  let calls = 0
  const worker = createWorker({ controlPlane: { url: `http://127.0.0.1:${port}`,serviceToken },
    worker: { id: 'teacher-memory-regression' },model: {
      modelId: 'teacher-memory-fixture',contextWindowTokens: 200000,
      async run() { calls++; return { output: [{ role: 'assistant',content: 'Ready.' }],text: 'Ready.',model: 'teacher-memory-fixture',usage } },
      async structured() { return { value: { missing: [] },model: 'teacher-memory-fixture',usage } },
      async compact() { throw new Error('bounded fixture must not compact') },
    } })
  try {
    assert.equal(await worker.runNext(),true)
    assert.ok(calls > 0,'teacher context must reach the model over HTTP')
    assert.ok(await app.readMessage(run),'teacher execution must produce a reply')
    await pool.query("UPDATE participants SET departed_at=NOW() WHERE company_id=$1 AND id=$2",[fixture.companyId,fixture.teacherId])
    await assert.rejects(app.memory!.scopes(identity),/memory source identity or membership was revoked/)
  } finally { await worker.stop(); await stopLingxiOSControl() }
})

interface Fixture {
  companyId:string
  projectId:string
  courseId:string
  teacherId:string
  learnerId:string
  adminId:string
}

async function seedTeacherCourse():Promise<Fixture>{
  const suffix=randomUUID().slice(0,8)
  const companyId=`co-pulse-${suffix}`
  const projectId=`project-pulse-${suffix}`
  const courseId=`course-pulse-${suffix}`
  const teacherId=`teacher-${suffix}`
  const learnerId=`learner-${suffix}`
  const adminId=`admin-${suffix}`
  for(const [id,name] of [[teacherId,'周老师'],[learnerId,'陈同学'],[adminId,'公司管理员']] as const){
    await pool.query(`INSERT INTO users(id,email,display_name) VALUES($1,$2,$3)`,[id,`${id}@test.local`,name])
  }
  await pool.query(`INSERT INTO companies(id,name,slug,type,plan_id) VALUES($1,'Pulse 测试公司',$1,'EDUCATION','plan-education')`,[companyId])
  for(const [id,role] of [[teacherId,'TEACHER'],[learnerId,'STUDENT'],[adminId,'TEACHER']] as const){
    await pool.query(`INSERT INTO company_memberships(company_id,user_id,role,is_admin) VALUES($1,$2,$3,$4)`,[companyId,id,role,id===adminId])
    await seedMembershipPeriod(pool,companyId,id)
  }
  const contractId=`contract-${suffix}`
  await pool.query(
    `INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit)
     VALUES ($1,$2,'plan-education','ACTIVE',NOW()-INTERVAL '1 day',NOW()+INTERVAL '30 days',3)`,
    [contractId,companyId],
  )
  for(const id of [teacherId,learnerId,adminId]){
    await pool.query(
      `INSERT INTO organization_seats(id,company_id,contract_id,user_id,status)
       VALUES ($1,$2,$3,$4,'ACTIVE')`,
      [`seat-${id}`,companyId,contractId,id],
    )
  }
  for(const [id,name,role] of [[teacherId,'周老师','teacher'],[learnerId,'陈同学','learner'],[adminId,'公司管理员','owner']] as const){
    await pool.query(
      `INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
       VALUES($1,$2,'human',$3,$4,$5,'#667085','avail')`,
      [id,companyId,name,role,name.slice(0,1)],
    )
  }
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,name,description,color,created_by,is_default)
     VALUES($1,$2,'INSTITUTIONAL_COURSE','研究实验室','教师智能体集成测试','#7756D8',$3,FALSE)`,
    [projectId,companyId,teacherId],
  )
  await pool.query(
    `INSERT INTO courses(id,company_id,project_id,created_by)
     VALUES($1,$2,$3,$4)`,
    [courseId,companyId,projectId,teacherId],
  )
  await pool.query(
    `INSERT INTO project_memberships(project_id,company_id,user_id,role)
     VALUES($1,$2,$3,'TEACHER'),($1,$2,$4,'STUDENT')`,
    [projectId,companyId,teacherId,learnerId],
  )
  return {companyId,projectId,courseId,teacherId,learnerId,adminId}
}

async function apiRequest(userId:string,companyId:string,path:string,projectId?:string):Promise<Response>{
  const app=await buildApiTestApp(userId)
  const server=createServer(app)
  await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address()
  if(!address||typeof address==='string')throw new Error('test server did not bind')
  try{
    return await fetch(`http://127.0.0.1:${address.port}${path}`,{
      headers:{'x-company-id':companyId,...(projectId?{'x-project-id':projectId}:{})},
    })
  }finally{
    await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))
  }
}

test('[integration] concurrent provisioning creates one Project Pulse and one Course teacher room',async()=>{
  const fixture=await seedTeacherCourse()
  const results=await Promise.all(Array.from({length:6},()=>ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)))
  assert.equal(new Set(results.map((item)=>item.agentId)).size,1)
  assert.equal(new Set(results.map((item)=>item.roomId)).size,1)
  assert.equal(results.filter((item)=>item.created).length,1)

  const {rows}=await pool.query<{
    agents:number;rooms:number;tools:string[];capabilities:string[];members:string[];subtitle:string
  }>(`SELECT
      (SELECT COUNT(*)::int FROM learning_project_teacher_agents WHERE project_id=$1) AS agents,
      (SELECT COUNT(*)::int FROM learning_course_teacher_rooms WHERE course_id=$2) AS rooms,
      p.tools,p.capabilities,c.members,c.subtitle
    FROM learning_project_teacher_agents pta
    JOIN participants p ON p.id=pta.agent_id AND p.company_id=pta.company_id
    JOIN learning_course_teacher_rooms tr ON tr.course_id=$2
    JOIN conversations c ON c.id=tr.conversation_id
    WHERE pta.project_id=$1`,[fixture.projectId,fixture.courseId])
  assert.equal(rows[0]?.agents,1)
  assert.equal(rows[0]?.rooms,1)
  assert.deepEqual(rows[0]?.tools,['ipython'])
  assert.deepEqual(rows[0]?.capabilities,['teacher_admin'])
  assert.deepEqual(new Set(rows[0]?.members),new Set([fixture.teacherId,results[0]!.agentId]))
  assert.equal(rows[0]?.members.includes(fixture.learnerId),false)
  assert.equal(rows[0]?.subtitle,'教师 · 1')
})

test('[integration] Pulse provisioning rolls back every owned row on persistence failure',async()=>{
  const fixture=await seedTeacherCourse()
  await pool.query(`CREATE OR REPLACE FUNCTION test_teacher_provision_failure() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'test teacher provision failure'; END; $$ LANGUAGE plpgsql`)
  await pool.query(`CREATE TRIGGER test_teacher_provision_failure
    BEFORE INSERT ON learning_course_teacher_rooms FOR EACH ROW EXECUTE FUNCTION test_teacher_provision_failure()`)
  try{
    await assert.rejects(
      ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction),
      /test teacher provision failure/,
    )
  }finally{
    await pool.query(`DROP TRIGGER IF EXISTS test_teacher_provision_failure ON learning_course_teacher_rooms`)
    await pool.query(`DROP FUNCTION IF EXISTS test_teacher_provision_failure()`)
  }
  const {rows}=await pool.query<{agents:number;rooms:number;participants:number}>(
    `SELECT
      (SELECT COUNT(*)::int FROM learning_project_teacher_agents
        WHERE company_id=$1 AND project_id=$2) AS agents,
      (SELECT COUNT(*)::int FROM learning_course_teacher_rooms
        WHERE company_id=$1 AND course_id=$3) AS rooms,
      (SELECT COUNT(*)::int FROM participants
        WHERE company_id=$1 AND preset_key=$4) AS participants`,
    [fixture.companyId,fixture.projectId,fixture.courseId,`teacher-agent:${fixture.projectId}`],
  )
  assert.deepEqual(rows[0],{agents:0,rooms:0,participants:0})
})

test('[integration] Pulse provisioning and lifecycle reject a foreign tenant scope',async()=>{
  const own=await seedTeacherCourse()
  const foreign=await seedTeacherCourse()
  await assert.rejects(
    ensureTeacherAgentForCourse(own.companyId,foreign.courseId,pool,teacherTransaction),
    /non-archived course not found/,
  )
  await ensureTeacherAgentForCourse(foreign.companyId,foreign.courseId,pool,teacherTransaction)
  await closeTeacherRoomForCourse(own.companyId,foreign.courseId,pool,teacherTransaction)
  const {rows}=await pool.query<{status:string}>(
    `SELECT status FROM learning_course_teacher_rooms
      WHERE company_id=$1 AND course_id=$2`,
    [foreign.companyId,foreign.courseId],
  )
  assert.equal(rows[0]?.status,'active')
})

test('[integration] archive and restore retain the same Pulse identity and teacher room',async()=>{
  const fixture=await seedTeacherCourse()
  const first=await ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  await pool.query(`UPDATE projects SET status='ARCHIVED',archived_at=NOW() WHERE id=$1`,[fixture.projectId])
  await closeTeacherRoomForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  await pool.query(`UPDATE projects SET status='ACTIVE',archived_at=NULL WHERE id=$1`,[fixture.projectId])
  await reactivateTeacherRoomForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  const second=await ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  assert.equal(second.agentId,first.agentId)
  assert.equal(second.roomId,first.roomId)
  const {rows}=await pool.query<{course_id:string;conversation_id:string;status:string}>(
    `SELECT course_id,conversation_id,status FROM learning_course_teacher_rooms WHERE course_id=$1`,
    [fixture.courseId],
  )
  assert.equal(rows.length,1)
  assert.equal(rows[0]?.status,'active')
  assert.equal(rows[0]?.conversation_id,first.roomId)
})

test('[integration] current course teachers and company administrators can discover Pulse and open its teacher endpoint',async()=>{
  const fixture=await seedTeacherCourse()
  const pulse=await ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  const path=`/api/courses/${encodeURIComponent(fixture.courseId)}/teacher-agent`
  const teacherSummary=await apiRequest(fixture.teacherId,fixture.companyId,path)
  assert.equal(teacherSummary.status,200)
  assert.equal((await teacherSummary.json() as {agentId:string}).agentId,pulse.agentId)
  assert.equal((await apiRequest(fixture.learnerId,fixture.companyId,path)).status,403)
  assert.equal((await apiRequest(fixture.adminId,fixture.companyId,path)).status,200)

  const teacherParticipants=await apiRequest(fixture.teacherId,fixture.companyId,'/api/participants',fixture.projectId)
  const learnerParticipants=await apiRequest(fixture.learnerId,fixture.companyId,'/api/participants',fixture.projectId)
  const adminParticipants=await apiRequest(fixture.adminId,fixture.companyId,'/api/participants',fixture.projectId)
  assert.equal(teacherParticipants.status,200)
  assert.equal(learnerParticipants.status,200)
  assert.equal(adminParticipants.status,200)
  const ids=async(response:Response)=>(await response.json() as Array<{id:string}>).map((item)=>item.id)
  assert.ok((await ids(teacherParticipants)).includes(pulse.agentId))
  assert.ok((await ids(adminParticipants)).includes(pulse.agentId))
  assert.equal((await ids(learnerParticipants)).includes(pulse.agentId),false)

  const learnerRoom=await apiRequest(
    fixture.learnerId,
    fixture.companyId,
    `/api/im/channels/${encodeURIComponent(pulse.roomId)}/messages`,
    fixture.projectId,
  )
  assert.ok(learnerRoom.status===403||learnerRoom.status===404)
})

test('[integration] teacher digest calculation keeps local wall-clock time across DST',async()=>{
  const beforeSpringForward=new Date('2026-03-07T14:00:00.000Z') // 09:00 in New York
  const nextDaily=await nextTeacherDigestRun({frequency:'daily',localTime:'08:30'},'America/New_York',beforeSpringForward,pool)
  assert.equal(new Date(nextDaily).toISOString(),'2026-03-08T12:30:00.000Z')
  const nextWeekly=await nextTeacherDigestRun({frequency:'weekly',weekday:'sunday',localTime:'08:30'},'America/New_York',beforeSpringForward,pool)
  assert.equal(new Date(nextWeekly).toISOString(),'2026-03-08T12:30:00.000Z')

  const beforeFallBack=new Date('2026-10-31T13:00:00.000Z') // 09:00 in New York
  const afterFallBack=await nextTeacherDigestRun({frequency:'daily',localTime:'08:30'},'America/New_York',beforeFallBack,pool)
  assert.equal(new Date(afterFallBack).toISOString(),'2026-11-01T13:30:00.000Z')
})

test('[integration] only critical teacher operations cross the approval boundary',()=>{
  for(const method of ['publish_objective','publish_activity','close_activity','archive_objective','transition_course','set_teacher_membership','review_evaluation']){
    assert.equal(teacherActionRequiresApproval(`teacher.${method}`),true,method)
  }
  for(const method of ['overview','get_learner','get_attempt','draft_objectives','draft_activity','update_course','set_learner_membership','set_room_binding','configure_digest']){
    assert.equal(teacherActionRequiresApproval(`teacher.${method}`),false,method)
  }
})

test('[integration] Pulse reporting repository cannot cross tenant course boundaries',async()=>{
  const own=await seedTeacherCourse()
  const foreign=await seedTeacherCourse()
  const ownObjective=`objective-${randomUUID()}`
  const foreignObjective=`objective-${randomUUID()}`
  const ownActivity=`activity-${randomUUID()}`
  const foreignActivity=`activity-${randomUUID()}`
  const ownAttempt=`attempt-${randomUUID()}`
  const foreignAttempt=`attempt-${randomUUID()}`
  const ownEvidence=`evidence-${randomUUID()}`
  const foreignEvidence=`evidence-${randomUUID()}`

  await pool.query(
    `INSERT INTO learning_knowledge_units(
      id,project_id,company_id,title,success_criteria,target_level,position,status,created_by
    ) VALUES
      ($1,$2,$3,'本租户目标','完成本租户目标',3,1,'PUBLISHED',$4),
      ($5,$6,$7,'外租户目标','完成外租户目标',3,1,'PUBLISHED',$8)`,
    [
      ownObjective,own.projectId,own.companyId,own.teacherId,
      foreignObjective,foreign.projectId,foreign.companyId,foreign.teacherId,
    ],
  )
  await pool.query(
    `INSERT INTO learning_activities(
      id,project_id,company_id,title,instructions,kind,status,evaluation_mode,target_level,created_by
    ) VALUES
      ($1,$2,$3,'本租户活动','完成活动','PRACTICE','PUBLISHED','TEACHER_REQUIRED',2,$4),
      ($5,$6,$7,'外租户活动','完成活动','PRACTICE','PUBLISHED','TEACHER_REQUIRED',2,$8)`,
    [
      ownActivity,own.projectId,own.companyId,own.teacherId,
      foreignActivity,foreign.projectId,foreign.companyId,foreign.teacherId,
    ],
  )
  await pool.query(
    `INSERT INTO evidence_records(
      id,project_id,company_id,level,derivation,kind,subject_user_id,data,created_by_type,created_by_id
    ) VALUES
      ($1,$2,$3,'L1','OBSERVED','learning_attempt',$4,'{}'::jsonb,'USER',$5),
      ($6,$7,$8,'L1','OBSERVED','learning_attempt',$9,'{}'::jsonb,'USER',$10)`,
    [
      ownEvidence,own.projectId,own.companyId,own.learnerId,own.teacherId,
      foreignEvidence,foreign.projectId,foreign.companyId,foreign.learnerId,foreign.teacherId,
    ],
  )
  await pool.query(
    `INSERT INTO learning_attempts(
      id,project_id,company_id,learner_id,activity_id,assistance,evidence_id,status
    ) VALUES
      ($1,$2,$3,$4,$5,'NONE',$6,'SUBMITTED'),
      ($7,$8,$9,$10,$11,'NONE',$12,'SUBMITTED')`,
    [
      ownAttempt,own.projectId,own.companyId,own.learnerId,ownActivity,ownEvidence,
      foreignAttempt,foreign.projectId,foreign.companyId,foreign.learnerId,foreignActivity,foreignEvidence,
    ],
  )
  await pool.query(
    `INSERT INTO learning_states(
      project_id,company_id,user_id,knowledge_unit_id,level,status,independent_evidence_count
    ) VALUES
      ($1,$2,$3,$4,3,'VERIFIED',2),
      ($5,$6,$7,$8,4,'VERIFIED',3)`,
    [
      own.projectId,own.companyId,own.learnerId,ownObjective,
      foreign.projectId,foreign.companyId,foreign.learnerId,foreignObjective,
    ],
  )

  const scope={companyId:own.companyId,projectId:own.projectId,courseId:own.courseId}
  const learners=await listTeacherLearnerRows(pool,scope,false)
  assert.deepEqual(learners.map((row)=>row.user_id),[own.learnerId])
  const objectives=await listTeacherObjectives(pool,scope)
  assert.deepEqual(objectives.map((row)=>row.id),[ownObjective])
  const overview=await loadTeacherOverviewRows(pool,scope,30)
  assert.equal(overview.coverage[0]?.learners,1)
  assert.equal(overview.coverage[0]?.learners_with_evidence,1)
  assert.equal(await findTeacherAttemptDetail(pool,scope,foreignAttempt),undefined)
  assert.equal((await findTeacherAttemptDetail(pool,scope,ownAttempt))?.id,ownAttempt)
})

test('[integration] Pulse approval freshness binds the target room to the trusted tenant',async()=>{
  const own=await seedTeacherCourse()
  const foreign=await seedTeacherCourse()
  const ownPulse=await ensureTeacherAgentForCourse(own.companyId,own.courseId,pool,teacherTransaction)
  const foreignPulse=await ensureTeacherAgentForCourse(foreign.companyId,foreign.courseId,pool,teacherTransaction)
  const ownObjective=`objective-${randomUUID()}`
  const foreignObjective=`objective-${randomUUID()}`
  const {rows}=await pool.query<{id:string;updated_at:Date}>(
    `INSERT INTO learning_knowledge_units(
      id,project_id,company_id,title,success_criteria,target_level,position,status,created_by
    ) VALUES
      ($1,$2,$3,'本租户审批目标','完成目标',3,1,'DRAFT',$4),
      ($5,$6,$7,'外租户审批目标','完成目标',3,1,'DRAFT',$8)
    RETURNING id,updated_at`,
    [
      ownObjective,own.projectId,own.companyId,own.teacherId,
      foreignObjective,foreign.projectId,foreign.companyId,foreign.teacherId,
    ],
  )
  const versions=new Map(rows.map((row)=>[row.id,row.updated_at.toISOString()]))

  await assertTeacherApprovalFresh({
    companyId:own.companyId,
    channelId:ownPulse.roomId,
    action:'teacher.publish_objective',
    preview:{entityId:ownObjective,currentVersion:versions.get(ownObjective)},
  },pool)
  await assert.rejects(
    assertTeacherApprovalFresh({
      companyId:own.companyId,
      channelId:foreignPulse.roomId,
      action:'teacher.publish_objective',
      preview:{entityId:foreignObjective,currentVersion:versions.get(foreignObjective)},
    },pool),
    /approval is stale/,
  )
})

test('[integration] Pulse runtime scope and counts reject foreign tenant state',async()=>{
  const own=await seedTeacherCourse()
  const foreign=await seedTeacherCourse()
  const foreignPulse=await ensureTeacherAgentForCourse(foreign.companyId,foreign.courseId,pool,teacherTransaction)

  assert.equal(
    await findTeacherScopeBinding(pool,own.companyId,foreignPulse.agentId,foreignPulse.roomId),
    undefined,
  )
  assert.deepEqual(
    await findTeacherTurnCounts(pool,own.companyId,foreign.projectId),
    {learners:0,objectives:0,activities:0,pending_reviews:0},
  )
})
