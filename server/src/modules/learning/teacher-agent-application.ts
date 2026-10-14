import { createHash } from 'node:crypto'
import type { AgentActionContext } from '../../agents/contracts.js'
import type { Queryable } from '../../db/queryable.js'
import type { ImChannelProfile } from '../../im/types.js'
import { wukongClient } from '../../im/wukong.js'
import { createNativeMessage } from '../../im/message-types.js'
import { syncProductChannel } from '../../agent-runtime/conversations.js'
import { inc } from '../../metrics.js'
import { requireLearningCourseRole } from './membership-application.js'
import { findTeacherScopeBinding } from './teacher-runtime-repository.js'
import { closeTeacherRoomState, findActiveTeacherRoom, findProjectTeacherAgentId, findTeacherProvisioningCourse,
 findTeacherWelcomeDescriptor, listCourseTeacherIds, persistTeacherProvisioning, reactivateTeacherRoomState, updateTeacherRoomMembers } from './teacher-provisioning-repository.js'
import { TEACHER_PRESET_VERSION, TEACHER_CAPABILITIES, TEACHER_ROLE, TEACHER_PROMPT } from './teacher-preset.js'
export type TeacherTransaction = <T>(work: (client: Queryable) => Promise<T>) => Promise<T>


function stableSegment(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 18)
}


interface TeacherScope {
  companyId: string
  projectId: string
  projectName: string
  courseId: string
  courseTitle: string
  courseStatus: 'ACTIVE' | 'ARCHIVED'
  roomId: string
  roomStatus: 'active' | 'closed'
  agentId: string
  agentName: string
  teacherId?: string
  mode: 'teacher' | 'routine' | 'approval'
}


export async function resolveTeacherScope(work: Pick<AgentActionContext, 'companyId' | 'agentId' | 'channelId' | 'authorizationUserId' | 'reason'>, db: Queryable): Promise<TeacherScope> {
  const row = await findTeacherScopeBinding(db, work.companyId, work.agentId, work.channelId)
  if (!row) { inc('learning.teacher_agent.authorization_denied', { reason: 'scope' }); throw Object.assign(new Error('teacher Agent is not registered for this room'), { code: 'teacher_scope_revoked' }) }
  if (row.room_status !== 'active' || row.course_status === 'ARCHIVED' || !row.has_teacher) throw Object.assign(new Error('teacher room is closed or has no teacher'), { code: 'teacher_scope_revoked' })
  const teacherId = work.authorizationUserId
  if (!teacherId) throw new Error('teacher action requires its original human principal')
  await requireLearningCourseRole(db, {
    companyId: row.company_id, courseId: row.course_id, userId: teacherId, role: 'teacher',
  })
  return {
    companyId:row.company_id,projectId:row.project_id,projectName:row.project_name,
    courseId:row.course_id,courseTitle:row.course_title,courseStatus:row.course_status,
    roomId:row.room_id,roomStatus:row.room_status,agentId:row.agent_id,agentName:row.agent_name,
    ...(teacherId?{teacherId}:{}),mode:work.reason==='routine'?'routine':work.reason==='resume'?'approval':'teacher',
  }
}


export async function ensureTeacherAgentForCourse(companyId: string,courseId: string,db: Queryable,transaction:TeacherTransaction): Promise<{agentId:string;roomId:string;created:boolean}> {
  const provision=async(persistence:Queryable)=>{
    const course=await findTeacherProvisioningCourse(persistence,companyId,courseId)
    if (!course) throw new Error('non-archived course not found')
    const agentId=`pulse-${stableSegment(`${companyId}:${course.projectId}`)}`
    const roomId=`teacher-${stableSegment(courseId)}`
    const displayName='望远'
    const resolvedAgentId=await findProjectTeacherAgentId(persistence,companyId,course.projectId)??agentId
    const result=await persistTeacherProvisioning(persistence,{
      ...course,courseId,agentId:resolvedAgentId,roomId,displayName,role:TEACHER_ROLE,
      capabilities:TEACHER_CAPABILITIES,prompt:TEACHER_PROMPT,presetVersion:TEACHER_PRESET_VERSION,
    })
    if(result.created)inc('learning.teacher_agent.provisioned')
    return {agentId:resolvedAgentId,roomId,created:result.created}
  }
  return transaction(provision)
}


export async function sendTeacherAgentWelcome(companyId:string,courseId:string,db:Queryable):Promise<void>{
  const descriptor=await findTeacherWelcomeDescriptor(db,companyId,courseId)
  if(!descriptor)return
  await wukongClient().sendMessage(descriptor.conversationId,2,descriptor.agentId,createNativeMessage({
    id:`teacher-welcome-${courseId}`,role:'assistant',
    content:[{type:'text',text:`望远已就绪：我可以协助查看“${descriptor.courseTitle}”的论坛作业、检索引用资料和整理反馈。`}],
    custom:{refs:{agentId:descriptor.agentId},suppressAgentWake:true},
  }))
}


export async function syncTeacherRoomMembers(companyId:string,courseId:string,db:Queryable,transaction:TeacherTransaction,
  syncChannel:(profile:ImChannelProfile)=>Promise<unknown> = syncProductChannel):Promise<void>{
  const persist=async(persistence:Queryable)=>{
    const room=await findActiveTeacherRoom(persistence,companyId,courseId)
    if(!room)return undefined
    const teachers=await listCourseTeacherIds(persistence,companyId,courseId)
    const members=[...teachers,room.agentId]
    return updateTeacherRoomMembers(persistence,{
      companyId,conversationId:room.conversationId,members,teacherCount:teachers.length,
    })
  }
  const profile=await transaction(persist)
  if(profile){
    await syncChannel(profile as unknown as ImChannelProfile)
  }
}


export async function closeTeacherRoomForCourse(companyId:string,courseId:string,db:Queryable,transaction:TeacherTransaction):Promise<void>{
  const close=(persistence:Queryable)=>closeTeacherRoomState(persistence,companyId,courseId)
  await transaction(close)
}

export async function reactivateTeacherRoomForCourse(companyId:string,courseId:string,db:Queryable,transaction:TeacherTransaction):Promise<void> {
 await reactivateTeacherRoomState(db,companyId,courseId)
 await syncTeacherRoomMembers(companyId,courseId,db,transaction)
}
export async function loadTeacherTurnContext(work: AgentActionContext, db: Queryable) {
 const scope=await resolveTeacherScope(work,db)
 const counts=await db.query("SELECT COUNT(*)::int AS assignments FROM course_forum_posts WHERE company_id=$1 AND project_id=$2 AND kind='assignment' AND deleted_at IS NULL", [scope.companyId,scope.projectId])
 return { course: { id:scope.courseId,projectId:scope.projectId,title:scope.courseTitle }, counts:counts.rows[0] }
}
