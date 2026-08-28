import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import {
  closeTeacherRoomForCourse,
  ensureTeacherAgentForCourse,
  nextTeacherDigestRun,
  reactivateTeacherRoomForCourse,
  teacherActionRequiresApproval,
} from '../modules/learning/teacher-agent.js'
import { buildApiTestApp, ensureSchemaOnce, installFakeWukong, resetAllTables, teardownAll } from './_helpers.js'

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { installFakeWukong(); await resetAllTables() })
after(async () => { await teardownAll() })

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
  const results=await Promise.all(Array.from({length:6},()=>ensureTeacherAgentForCourse(fixture.courseId)))
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

test('[integration] archive and restore retain the same Pulse identity and teacher room',async()=>{
  const fixture=await seedTeacherCourse()
  const first=await ensureTeacherAgentForCourse(fixture.courseId)
  await pool.query(`UPDATE projects SET status='archived',archived_at=NOW() WHERE id=$1`,[fixture.projectId])
  await closeTeacherRoomForCourse(fixture.courseId)
  await pool.query(`UPDATE projects SET status='active',archived_at=NULL WHERE id=$1`,[fixture.projectId])
  await reactivateTeacherRoomForCourse(fixture.courseId)
  const second=await ensureTeacherAgentForCourse(fixture.courseId)
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
  const pulse=await ensureTeacherAgentForCourse(fixture.courseId)
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
