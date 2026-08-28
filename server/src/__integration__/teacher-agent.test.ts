import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
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
  await pool.query(`INSERT INTO companies(id,name,slug,owner_user_id) VALUES($1,'Pulse 测试公司',$1,$2)`,[companyId,adminId])
  for(const [id,role] of [[teacherId,'member'],[learnerId,'member'],[adminId,'owner']] as const){
    await pool.query(`INSERT INTO company_members(company_id,user_id,role) VALUES($1,$2,$3)`,[companyId,id,role])
  }
  for(const [id,name,role] of [[teacherId,'周老师','teacher'],[learnerId,'陈同学','learner'],[adminId,'公司管理员','owner']] as const){
    await pool.query(
      `INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status)
       VALUES($1,$2,'human',$3,$4,$5,'#667085','avail')`,
      [id,companyId,name,role,name.slice(0,1)],
    )
  }
  await pool.query(
    `INSERT INTO projects(id,company_id,name,description,color,created_by,is_general)
     VALUES($1,$2,'研究实验室','教师智能体集成测试','#7756D8',$3,FALSE)`,
    [projectId,companyId,teacherId],
  )
  await pool.query(
    `INSERT INTO courses(id,company_id,project_id,created_by)
     VALUES($1,$2,$3,$4)`,
    [courseId,companyId,projectId,teacherId],
  )
  await pool.query(
    `INSERT INTO course_members(course_id,company_id,user_id,role)
     VALUES($1,$2,$3,'teacher'),($1,$2,$4,'learner')`,
    [courseId,companyId,teacherId,learnerId],
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
    BEFORE INSERT ON agent_workspace FOR EACH ROW EXECUTE FUNCTION test_teacher_provision_failure()`)
  try{
    await assert.rejects(
      ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction),
      /test teacher provision failure/,
    )
  }finally{
    await pool.query(`DROP TRIGGER IF EXISTS test_teacher_provision_failure ON agent_workspace`)
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
  await pool.query(`UPDATE projects SET status='archived',archived_at=NOW() WHERE id=$1`,[fixture.projectId])
  await closeTeacherRoomForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  await pool.query(`UPDATE projects SET status='active',archived_at=NULL WHERE id=$1`,[fixture.projectId])
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

test('[integration] only a current course teacher can discover Pulse or open its teacher endpoint',async()=>{
  const fixture=await seedTeacherCourse()
  const pulse=await ensureTeacherAgentForCourse(fixture.companyId,fixture.courseId,pool,teacherTransaction)
  const path=`/api/courses/${encodeURIComponent(fixture.courseId)}/teacher-agent`
  const teacherSummary=await apiRequest(fixture.teacherId,fixture.companyId,path)
  assert.equal(teacherSummary.status,200)
  assert.equal((await teacherSummary.json() as {agentId:string}).agentId,pulse.agentId)
  assert.equal((await apiRequest(fixture.learnerId,fixture.companyId,path)).status,403)
  assert.equal((await apiRequest(fixture.adminId,fixture.companyId,path)).status,403)

  const teacherParticipants=await apiRequest(fixture.teacherId,fixture.companyId,'/api/participants',fixture.projectId)
  const learnerParticipants=await apiRequest(fixture.learnerId,fixture.companyId,'/api/participants',fixture.projectId)
  const adminParticipants=await apiRequest(fixture.adminId,fixture.companyId,'/api/participants',fixture.projectId)
  assert.equal(teacherParticipants.status,200)
  assert.equal(learnerParticipants.status,200)
  assert.equal(adminParticipants.status,200)
  const ids=async(response:Response)=>(await response.json() as Array<{id:string}>).map((item)=>item.id)
  assert.ok((await ids(teacherParticipants)).includes(pulse.agentId))
  assert.equal((await ids(learnerParticipants)).includes(pulse.agentId),false)
  assert.equal((await ids(adminParticipants)).includes(pulse.agentId),false)

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
  for(const method of ['publish_objective','publish_activity','close_activity','archive_objective','set_course_status','set_teacher_membership','review_evaluation','override_mastery']){
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

  await pool.query(
    `INSERT INTO learning_objectives(
      id,course_id,company_id,title,success_criteria,target_level,position,status,created_by
    ) VALUES
      ($1,$2,$3,'本租户目标','完成本租户目标',3,1,'published',$4),
      ($5,$6,$7,'外租户目标','完成外租户目标',3,1,'published',$8)`,
    [
      ownObjective,own.courseId,own.companyId,own.teacherId,
      foreignObjective,foreign.courseId,foreign.companyId,foreign.teacherId,
    ],
  )
  await pool.query(
    `INSERT INTO learning_activities(
      id,course_id,company_id,title,instructions,type,status,evaluation_mode,target_level,created_by
    ) VALUES
      ($1,$2,$3,'本租户活动','完成活动','practice','published','teacher_required',2,$4),
      ($5,$6,$7,'外租户活动','完成活动','practice','published','teacher_required',2,$8)`,
    [
      ownActivity,own.courseId,own.companyId,own.teacherId,
      foreignActivity,foreign.courseId,foreign.companyId,foreign.teacherId,
    ],
  )
  await pool.query(
    `INSERT INTO learning_attempts(
      id,course_id,company_id,learner_id,activity_id,assistance,evidence,status
    ) VALUES
      ($1,$2,$3,$4,$5,'none','[]'::jsonb,'submitted'),
      ($6,$7,$8,$9,$10,'none','[]'::jsonb,'submitted')`,
    [
      ownAttempt,own.courseId,own.companyId,own.learnerId,ownActivity,
      foreignAttempt,foreign.courseId,foreign.companyId,foreign.learnerId,foreignActivity,
    ],
  )
  await pool.query(
    `INSERT INTO learning_mastery(
      course_id,company_id,learner_id,objective_id,level,status,independent_evidence_count
    ) VALUES
      ($1,$2,$3,$4,3,'verified',2),
      ($5,$6,$7,$8,4,'verified',3)`,
    [
      own.courseId,own.companyId,own.learnerId,ownObjective,
      foreign.courseId,foreign.companyId,foreign.learnerId,foreignObjective,
    ],
  )

  const scope={companyId:own.companyId,courseId:own.courseId}
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
    `INSERT INTO learning_objectives(
      id,course_id,company_id,title,success_criteria,target_level,position,status,created_by
    ) VALUES
      ($1,$2,$3,'本租户审批目标','完成目标',3,1,'draft',$4),
      ($5,$6,$7,'外租户审批目标','完成目标',3,1,'draft',$8)
    RETURNING id,updated_at`,
    [
      ownObjective,own.courseId,own.companyId,own.teacherId,
      foreignObjective,foreign.courseId,foreign.companyId,foreign.teacherId,
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
    await findTeacherTurnCounts(pool,own.companyId,foreign.courseId),
    {learners:0,objectives:0,activities:0,pending_reviews:0},
  )
})
