/** Pulse application orchestration. Persistence is owned by teacher-* repositories. */
import { createHash } from 'node:crypto'
import type { AgentWorkItem, HostAction } from '../../agent-os/types.js'
import type { Queryable } from '../../db/queryable.js'
import type { ImChannelProfile } from '../../im/types.js'
import { wukongClient } from '../../im/wukong.js'
import { inc } from '../../metrics.js'
import { audit, auditInTransaction } from '../identity/public.js'
import { ProjectLifecycleApplication } from '../projects/public.js'
import {
  bindLearningCourseRoom,
  closeLearningActivity,
  createLearningActivity,
  createLearningObjectives,
  publishLearningActivity,
  requireLearningCourseRole,
  reviewLearningEvaluation,
  setLearningCourseMembership,
  setLearningObjectiveStatus,
} from './application.js'
import { projectLifecycleProjection } from './project-lifecycle-projection.js'
import {
  findTeacherActivityApprovalTarget,
  findTeacherActivityApprovalVersion,
  findTeacherCourseApprovalTarget,
  findTeacherCourseApprovalVersion,
  findTeacherEvaluationApprovalTarget,
  findTeacherEvaluationApprovalVersion,
  findTeacherMembershipApprovalTarget,
  findTeacherMembershipApprovalVersion,
  findTeacherObjectiveApprovalTarget,
  findTeacherObjectiveApprovalVersion,
} from './teacher-approval-repository.js'
import {
  calculateTeacherDigestRun,
  pauseTeacherDigest,
  upsertTeacherDigest,
} from './teacher-digest-repository.js'
import { updateTeacherCourseMetadata } from './teacher-management-repository.js'
import {
  activateTeacherRoomRoutine,
  closeTeacherRoomState,
  findActiveTeacherRoom,
  findProjectTeacherAgentId,
  findTeacherAgentSummaryRow,
  findTeacherProvisioningCourse,
  findTeacherWelcomeDescriptor,
  listCourseTeacherIds,
  listTeacherRoomRoutines,
  persistTeacherProvisioning,
  reactivateTeacherRoomState,
  updateTeacherRoomMembers,
} from './teacher-provisioning-repository.js'
import {
  findTeacherAttemptDetail,
  findTeacherLearner,
  listTeacherActivities,
  listTeacherBindableRooms,
  listTeacherLearnerRows,
  listTeacherObjectives,
  listTeacherReviews,
  loadTeacherLearnerDetailRows,
  loadTeacherOverviewRows,
} from './teacher-reporting-repository.js'
import {
  findTeacherApprovalTriggerAuthor,
  findTeacherDigestSchedule,
  findTeacherScopeBinding,
  findTeacherTurnCounts,
  pauseTeacherDigestForMissingTeacher,
} from './teacher-runtime-repository.js'
import type {
  LearningActivityType,
  LearningEvaluationMode,
  TeacherAgentSummary,
  TeacherDigestSchedule,
  TeacherTurnContext,
} from './types.js'

const PULSE_PRESET_VERSION = 2
const PULSE_CAPABILITIES = ['teacher_admin'] as const
const PULSE_ROLE = '教学运营与学情汇总'
const PULSE_PROMPT = `You are Pulse, the product-managed Project teacher operations Agent. Work only in the registered teacher room. Observe current Host-scoped facts, identify the smallest requested management operation, execute reversible routine operations or submit approval-gated operations, then report the exact durable result. Aggregate before drilling into an individual learner. Never contact learners, enter Study Rooms, teach, invent evidence, infer hidden traits, or use Canvas, handoffs, email, memory, learning Missions, or general routines. Scheduled turns are read-only summaries.`
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const APPROVAL_METHODS = new Set([
  'publish_objective', 'publish_activity', 'close_activity', 'archive_objective',
  'transition_course', 'set_teacher_membership', 'review_evaluation', 'override_mastery',
])
const WRITE_METHODS = new Set([
  'draft_objectives', 'draft_activity', 'update_course', 'set_learner_membership',
  'set_room_binding', 'configure_digest', ...APPROVAL_METHODS,
])

export type TeacherTransaction = <T>(work: (client: Queryable) => Promise<T>) => Promise<T>

function stableSegment(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 18)
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function textArg(args: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    if (typeof args[name] === 'string' && args[name].trim()) return args[name].trim()
  }
  throw new Error(`${names[0]} is required`)
}

function optionalText(args: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    if (typeof args[name] === 'string' && args[name].trim()) return args[name].trim()
  }
  return undefined
}

function boolArg(args: Record<string, unknown>, defaultValue = true): boolean {
  return typeof args.enabled === 'boolean' ? args.enabled : defaultValue
}

function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date()); return true }
  catch { return false }
}

function versionToken(value:unknown):string{
  if(value instanceof Date)return value.toISOString()
  if(typeof value==='string'){
    const parsed=new Date(value)
    if(!Number.isNaN(parsed.getTime())&&/[T ]/.test(value))return parsed.toISOString()
  }
  return String(value??'')
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

async function resolveTeacherTriggerAuthor(work: AgentWorkItem, db: Queryable): Promise<string | undefined> {
  if (work.reason === 'routine') return undefined
  if (work.reason === 'resume' && work.triggerClientMsgNo.startsWith('approval:')) {
    return findTeacherApprovalTriggerAuthor(db, {
      companyId: work.companyId,
      agentId: work.agentId,
      channelId: work.channelId,
      approvalId: work.triggerClientMsgNo.slice('approval:'.length),
    })
  }
  const messages = await wukongClient().syncMessages(work.channelId, 2, 80, work.agentId)
  return messages.find((message) => message.clientMsgNo === work.triggerClientMsgNo)?.fromUid
}

export async function resolveTeacherScope(work: AgentWorkItem, db: Queryable): Promise<TeacherScope> {
  const row = await findTeacherScopeBinding(db, work.companyId, work.agentId, work.channelId)
  if (!row) { inc('learning.teacher_agent.authorization_denied', { reason: 'scope' }); throw new Error('teacher Agent is not registered for this room') }
  if (row.room_status !== 'active') throw new Error('teacher room is closed')
  if(work.reason==='routine'&&!row.has_teacher){
    await pauseTeacherDigestForMissingTeacher(db,work.companyId,work.agentId,work.channelId)
    throw new Error('teacher digest paused because the course has no teacher')
  }
  const teacherId = await resolveTeacherTriggerAuthor(work, db)
  if (work.reason !== 'routine') {
    if (!teacherId) throw new Error('teacher action requires a human trigger')
    await requireLearningCourseRole(db, {
      companyId: row.company_id, courseId: row.course_id, userId: teacherId, role: 'teacher',
    })
  }
  return {
    companyId:row.company_id,projectId:row.project_id,projectName:row.project_name,
    courseId:row.course_id,courseTitle:row.course_title,courseStatus:row.course_status,
    roomId:row.room_id,roomStatus:row.room_status,agentId:row.agent_id,agentName:row.agent_name,
    ...(teacherId?{teacherId}:{}),mode:work.reason==='routine'?'routine':work.reason==='resume'?'approval':'teacher',
  }
}

async function digestSchedule(scope: Pick<TeacherScope, 'companyId'|'agentId'|'roomId'>, db: Queryable): Promise<TeacherDigestSchedule> {
  const row=await findTeacherDigestSchedule(db,scope.companyId,scope.agentId,scope.roomId)
  if (!row) return { frequency:'off',timezone:'Asia/Shanghai',status:'paused' }
  const frequency=row.schedule?.frequency==='daily'||row.schedule?.frequency==='weekly'?row.schedule.frequency:'off'
  const weekday=typeof row.schedule?.weekday==='string'&&WEEKDAYS.includes(row.schedule.weekday as typeof WEEKDAYS[number])
    ? row.schedule.weekday as typeof WEEKDAYS[number]:undefined
  return { frequency,timezone:row.timezone, ...(typeof row.schedule?.localTime==='string'?{localTime:row.schedule.localTime}:{}),
    ...(weekday?{weekday}:{}),status:row.status==='active'?'active':'paused',...(row.next_run_at?{nextRunAt:String(row.next_run_at)}:{}) }
}

export async function loadTeacherTurnContext(work: AgentWorkItem, db: Queryable): Promise<TeacherTurnContext | undefined> {
  let scope:TeacherScope
  try { scope=await resolveTeacherScope(work,db) } catch { return undefined }
  const [counts,digest]=await Promise.all([
    findTeacherTurnCounts(db,scope.companyId,scope.projectId),
    digestSchedule(scope,db),
  ])
  return {
    agent:{id:scope.agentId,name:scope.agentName,projectId:scope.projectId},
    course:{id:scope.courseId,projectId:scope.projectId,title:scope.courseTitle,status:scope.courseStatus},
    room:{id:scope.roomId,status:scope.roomStatus},
    trigger:{mode:scope.mode,...(scope.teacherId?{teacherId:scope.teacherId}:{})},
    counts:{learners:Number(counts.learners),objectives:Number(counts.objectives),activities:Number(counts.activities),pendingReviews:Number(counts.pending_reviews)},
    digest,
  }
}

export async function ensureTeacherAgentForCourse(companyId: string,courseId: string,db: Queryable,transaction:TeacherTransaction): Promise<{agentId:string;roomId:string;created:boolean}> {
  const provision=async(persistence:Queryable)=>{
    const course=await findTeacherProvisioningCourse(persistence,companyId,courseId)
    if (!course) throw new Error('non-archived course not found')
    const agentId=`pulse-${stableSegment(`${companyId}:${course.projectId}`)}`
    const roomId=`teacher-${stableSegment(courseId)}`
    const displayName=`Pulse · ${course.projectName}`.slice(0,80)
    const resolvedAgentId=await findProjectTeacherAgentId(persistence,companyId,course.projectId)??agentId
    const result=await persistTeacherProvisioning(persistence,{
      ...course,courseId,agentId:resolvedAgentId,roomId,displayName,role:PULSE_ROLE,
      capabilities:PULSE_CAPABILITIES,prompt:PULSE_PROMPT,presetVersion:PULSE_PRESET_VERSION,
    })
    if(result.created)inc('learning.teacher_agent.provisioned')
    return {agentId:resolvedAgentId,roomId,created:result.created}
  }
  return transaction(provision)
}

export async function sendTeacherAgentWelcome(companyId:string,courseId:string,db:Queryable):Promise<void>{
  const descriptor=await findTeacherWelcomeDescriptor(db,companyId,courseId)
  if(!descriptor)return
  await wukongClient().sendMessage(descriptor.conversationId,2,descriptor.agentId,{
    version:1,kind:'system',clientMsgNo:`teacher-welcome-${courseId}`,
    body:`Pulse 已就绪：我可以汇总“${descriptor.courseTitle}”的学情、管理草稿与成员，并把关键变更提交给教师审批。`,
    refs:{agentId:descriptor.agentId},data:{suppressAgentWake:true},
  })
}

export async function syncTeacherRoomMembers(companyId:string,courseId:string,db:Queryable,transaction:TeacherTransaction):Promise<void>{
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
    await wukongClient().upsertChannel(profile as unknown as ImChannelProfile)
  }
}

export async function closeTeacherRoomForCourse(companyId:string,courseId:string,db:Queryable,transaction:TeacherTransaction):Promise<void>{
  const close=(persistence:Queryable)=>closeTeacherRoomState(persistence,companyId,courseId)
  await transaction(close)
}

export async function reactivateTeacherRoomForCourse(companyId:string,courseId:string,db:Queryable,transaction:TeacherTransaction):Promise<void>{
  const roomId=await reactivateTeacherRoomState(db,companyId,courseId)
  if(!roomId)throw new Error('teacher room not found for active course')
  await syncTeacherRoomMembers(companyId,courseId,db,transaction)
  const routines=await listTeacherRoomRoutines(db,companyId,roomId)
  for(const routine of routines){
    if(routine.schedule?.frequency!=='daily'&&routine.schedule?.frequency!=='weekly')continue
    const localTime=typeof routine.schedule.localTime==='string'?routine.schedule.localTime:'09:00'
    const weekday=typeof routine.schedule.weekday==='string'&&WEEKDAYS.includes(routine.schedule.weekday as typeof WEEKDAYS[number])
      ? routine.schedule.weekday as typeof WEEKDAYS[number]
      : undefined
    const nextRunAt=await nextTeacherDigestRun({
      frequency:routine.schedule.frequency,
      localTime,
      ...(weekday?{weekday}:{}),
    },routine.timezone,new Date(),db)
    await activateTeacherRoomRoutine(db,companyId,routine.id,nextRunAt)
  }
}

export async function getTeacherAgentSummary(companyId:string,courseId:string,teacherId:string,db:Queryable):Promise<TeacherAgentSummary>{
  await requireLearningCourseRole(db,{companyId,courseId,userId:teacherId,role:'teacher'})
  const row=await findTeacherAgentSummaryRow(db,companyId,courseId)
  if(!row)throw new Error('teacher Agent not provisioned')
  return {agentId:row.agent_id,displayName:row.name,projectId:row.project_id,courseId,roomId:row.conversation_id,roomStatus:row.room_status,
    digest:await digestSchedule({companyId:row.company_id,agentId:row.agent_id,roomId:row.conversation_id},db),pendingApprovals:Number(row.pending)}
}

async function overview(scope:TeacherScope,windowDays:number,db:Queryable):Promise<unknown>{
  const days=Math.max(1,Math.min(90,Math.trunc(windowDays||30)))
  const {distribution,missions,activity,attention,coverage}=await loadTeacherOverviewRows(
    db,
    {companyId:scope.companyId,projectId:scope.projectId,courseId:scope.courseId},
    days,
  )
  inc('learning.teacher_agent.summary_generated')
  const attentionWithReasons=attention.map((item)=>{
    const row=object(item);const reasons:string[]=[]
    if(Number(row.due_reviews)>0)reasons.push('due_review')
    if(Number(row.needs_review)>0)reasons.push('needs_review')
    if(Number(row.paused_missions)>0)reasons.push('paused_mission')
    return {...row,reasons}
  })
  return {generatedAt:new Date().toISOString(),windowDays:days,course:{id:scope.courseId,title:scope.courseTitle},stateDistribution:distribution,missions,activity:activity[0]??{},evidenceCoverage:coverage[0]??{},attention:attentionWithReasons}
}

async function listLearners(scope:TeacherScope,attentionOnly:boolean,db:Queryable):Promise<unknown[]>{
  const rows=await listTeacherLearnerRows(
    db,
    {companyId:scope.companyId,projectId:scope.projectId,courseId:scope.courseId},
    attentionOnly,
  )
  return rows.map((item)=>{
    const row=object(item);const attentionReasons:string[]=[]
    if(Number(row.due_reviews)>0)attentionReasons.push('due_review')
    if(Number(row.needs_review)>0)attentionReasons.push('needs_review')
    if(Number(row.paused_missions)>0)attentionReasons.push('paused_mission')
    return {...row,attentionReasons}
  })
}

async function learnerDetail(scope:TeacherScope,learnerId:string,db:Queryable):Promise<unknown>{
  const reportingScope={companyId:scope.companyId,projectId:scope.projectId,courseId:scope.courseId}
  const member=await findTeacherLearner(db,reportingScope,learnerId)
  if(!member)throw new Error('learner is outside the current course')
  const detail=await loadTeacherLearnerDetailRows(db,reportingScope,learnerId)
  inc('learning.teacher_agent.learner_drilldown')
  return {learner:{id:learnerId,...member},...detail}
}

async function attemptDetail(scope:TeacherScope,attemptId:string,db:Queryable):Promise<unknown>{
  const attempt=await findTeacherAttemptDetail(
    db,
    {companyId:scope.companyId,projectId:scope.projectId,courseId:scope.courseId},
    attemptId,
  )
  if(!attempt)throw new Error('attempt is outside the current course')
  await audit({kind:'teacher_agent_attempt_access',userId:scope.teacherId,companyId:scope.companyId,detail:{courseId:scope.courseId,attemptId,agentId:scope.agentId}})
  inc('learning.teacher_agent.evidence_accessed')
  return attempt
}

export async function nextTeacherDigestRun(
  schedule:{frequency:'daily'|'weekly';localTime:string;weekday?:typeof WEEKDAYS[number]},
  timezone:string,
  from:Date,
  db:Queryable,
):Promise<string>{
  const weekdayIndex=schedule.weekday?WEEKDAYS.indexOf(schedule.weekday)+1:1
  return calculateTeacherDigestRun(db,{
    timezone,frequency:schedule.frequency,localTime:schedule.localTime,weekdayIndex,from,
  })
}

async function configureDigest(scope:TeacherScope,args:Record<string,unknown>,db:Queryable):Promise<TeacherDigestSchedule>{
  if(!scope.teacherId)throw new Error('digest configuration requires a teacher')
  const frequency=textArg(args,'frequency')
  const id=`teacher-digest-${stableSegment(scope.courseId)}`
  if(frequency==='off'){
    await pauseTeacherDigest(db,scope.companyId,id)
    inc('learning.teacher_agent.digest_configured',{frequency:'off'})
    return {frequency:'off',timezone:optionalText(args,'timezone')??'Asia/Shanghai',status:'paused'}
  }
  if(frequency!=='daily'&&frequency!=='weekly')throw new Error('frequency must be daily, weekly, or off')
  const timezone=optionalText(args,'timezone')??'Asia/Shanghai'
  if(!validTimezone(timezone))throw new Error('timezone must be a valid IANA timezone')
  const localTime=textArg(args,'localTime','local_time')
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime))throw new Error('localTime must use HH:mm')
  const weekdayRaw=optionalText(args,'weekday')?.toLowerCase()
  const weekday=weekdayRaw&&WEEKDAYS.includes(weekdayRaw as typeof WEEKDAYS[number])?weekdayRaw as typeof WEEKDAYS[number]:undefined
  if(frequency==='weekly'&&!weekday)throw new Error('weekly digest requires weekday')
  const schedule:{frequency:'daily'|'weekly';localTime:string;weekday?:typeof WEEKDAYS[number]}={frequency,localTime,...(weekday?{weekday}:{})}
  const nextRunAt=await nextTeacherDigestRun(schedule,timezone,new Date(),db)
  await upsertTeacherDigest(db,{
    id,companyId:scope.companyId,agentId:scope.agentId,roomId:scope.roomId,
    schedule,timezone,nextRunAt,teacherId:scope.teacherId,
  })
  inc('learning.teacher_agent.digest_configured',{frequency})
  return {frequency,timezone,localTime,...(weekday?{weekday}:{}),status:'active',nextRunAt}
}

export interface TeacherApprovalMetadata {requestedBy:string;summary:string;scope:Record<string,unknown>;preview:Record<string,unknown>}

export async function describeTeacherAction(work:AgentWorkItem,action:HostAction,db:Queryable):Promise<TeacherApprovalMetadata|undefined>{
  if(!action.action.startsWith('teacher.'))return undefined
  const scope=await resolveTeacherScope(work,db)
  const method=action.action.slice('teacher.'.length)
  if(scope.mode==='routine'&&WRITE_METHODS.has(method))throw new Error('scheduled teacher summaries are read-only')
  if(!APPROVAL_METHODS.has(method))return undefined
  if(!scope.teacherId)throw new Error('approval request requires a teacher')
  const args=object(action.args)
  let entityId:string|undefined;let entityLabel:string|undefined;let currentState:unknown;let currentVersion:unknown
  if(method.includes('objective')){
    entityId=textArg(args,'objectiveId','objective_id')
    const target=await findTeacherObjectiveApprovalTarget(db,scope.companyId,scope.courseId,entityId)
    if(!target)throw new Error('objective is outside the current course')
    currentState=target.status;currentVersion=versionToken(target.updatedAt);entityLabel=target.label??undefined
  }
  else if(method.includes('activity')){
    entityId=textArg(args,'activityId','activity_id')
    const target=await findTeacherActivityApprovalTarget(db,scope.companyId,scope.courseId,entityId)
    if(!target)throw new Error('activity is outside the current course')
    currentState=target.status;currentVersion=versionToken(target.updatedAt);entityLabel=target.label??undefined
  }
  else if(method==='transition_course'){
    entityId=scope.courseId;entityLabel=scope.courseTitle
    const target=await findTeacherCourseApprovalTarget(db,scope.companyId,scope.courseId)
    currentState=target?.status;currentVersion=versionToken(target?.updatedAt)
  }
  else if(method==='set_teacher_membership'){
    entityId=textArg(args,'userId','user_id')
    const target=await findTeacherMembershipApprovalTarget(db,scope.companyId,scope.courseId,entityId)
    currentState=target.enabled;currentVersion=currentState;entityLabel=target.label??'课程成员'
  }
  else {
    entityId=textArg(args,'evaluationId','evaluation_id')
    const target=await findTeacherEvaluationApprovalTarget(db,scope.companyId,scope.courseId,entityId)
    if(!target)throw new Error('evaluation is outside the current course')
    currentState=target.status;currentVersion=currentState;entityLabel=target.label??'学习评价'
  }
  const operationLabel:Record<string,string>={
    publish_objective:'发布学习目标',archive_objective:'归档学习目标',publish_activity:'发布学习活动',close_activity:'关闭学习活动',
    transition_course:{END:'结束课程',ENTER_READ_ONLY:'进入只读',ARCHIVE:'归档课程'}[String(args.command)]??'推进课程生命周期',
    set_teacher_membership:args.enabled===false?'移除教师身份':'授予教师身份',
    review_evaluation:args.decision==='reject'?'退回学习评价':'采纳学习评价',override_mastery:'人工调整掌握等级',
  }
  return {requestedBy:scope.teacherId,summary:`${operationLabel[method]??'确认关键变更'}“${entityLabel??'当前对象'}”`,
    scope:{projectId:scope.projectId,courseId:scope.courseId,roomId:scope.roomId,risk:method.includes('evaluation')||method==='override_mastery'?'learning_evaluation':'course_management'},
    preview:{method,entityId,entityLabel,currentState,currentVersion,args}}
}

export async function assertTeacherApprovalFresh(input:{channelId:string;companyId:string;action:string;preview:Record<string,unknown>},db:Queryable):Promise<void>{
  if(!input.action.startsWith('teacher.'))return
  const entityId=String(input.preview.entityId??'');const expected=String(input.preview.currentVersion??'')
  const method=input.action.slice('teacher.'.length);let current=''
  if(method.includes('objective'))current=versionToken(await findTeacherObjectiveApprovalVersion(db,input.companyId,input.channelId,entityId))
  else if(method.includes('activity'))current=versionToken(await findTeacherActivityApprovalVersion(db,input.companyId,input.channelId,entityId))
  else if(method==='transition_course')current=versionToken(await findTeacherCourseApprovalVersion(db,input.companyId,input.channelId,entityId))
  else if(method==='set_teacher_membership')current=String(await findTeacherMembershipApprovalVersion(db,input.companyId,input.channelId,entityId))
  else current=String(await findTeacherEvaluationApprovalVersion(db,input.companyId,input.channelId,entityId)??'')
  if(!current||current!==expected)throw new Error('approval is stale because the target changed; request a fresh approval')
}

export function teacherActionRequiresApproval(action:string):boolean{return action.startsWith('teacher.')&&APPROVAL_METHODS.has(action.slice('teacher.'.length))}

export async function executeTeacherAction(work:AgentWorkItem,method:string,args:Record<string,unknown>,db:Queryable,transaction:TeacherTransaction):Promise<unknown>{
  const scope=await resolveTeacherScope(work,db)
  if(scope.mode==='routine'&&WRITE_METHODS.has(method))throw new Error('scheduled teacher summaries are read-only')
  if(method==='current')return loadTeacherTurnContext(work,db)
  if(method==='overview')return overview(scope,Number(args.windowDays??args.window_days??30),db)
  if(method==='list_learners')return listLearners(scope,args.attentionOnly===true||args.attention_only===true,db)
  if(method==='get_learner')return learnerDetail(scope,textArg(args,'learnerId','learner_id'),db)
  if(method==='get_attempt')return attemptDetail(scope,textArg(args,'attemptId','attempt_id'),db)
  const reportingScope={companyId:scope.companyId,projectId:scope.projectId,courseId:scope.courseId}
  if(method==='list_objectives')return listTeacherObjectives(db,reportingScope)
  if(method==='list_activities')return listTeacherActivities(db,reportingScope)
  if(method==='list_reviews')return listTeacherReviews(db,reportingScope)
  if(method==='list_rooms')return listTeacherBindableRooms(db,reportingScope)
  if(method==='get_digest_schedule')return digestSchedule(scope,db)
  if(!scope.teacherId)throw new Error('teacher management action requires a teacher trigger')
  if(method==='draft_objectives'){
    const values=Array.isArray(args.objectives)?args.objectives.map(object).map((item)=>{
      const prerequisites=item.prerequisiteIds??item.prerequisite_ids
      return {title:textArg(item,'title'),successCriteria:textArg(item,'successCriteria','success_criteria'),targetLevel:Number(item.targetLevel??item.target_level??3),prerequisiteIds:Array.isArray(prerequisites)?prerequisites.map(String):[]}
    }):[]
    return createLearningObjectives(db, transaction, {
      companyId: scope.companyId,
      courseId: scope.courseId,
      actorId: scope.teacherId,
      actorKind: 'teacher',
      objectives: values,
    })
  }
  if(method==='draft_activity'){
    const objectiveIds=args.objectiveIds??args.objective_ids
    return createLearningActivity(db,transaction,{companyId:scope.companyId,courseId:scope.courseId,actorId:scope.teacherId,actorKind:'teacher',title:textArg(args,'title'),instructions:textArg(args,'instructions'),type:textArg(args,'type') as LearningActivityType,evaluationMode:(optionalText(args,'evaluationMode','evaluation_mode')??'TEACHER_REQUIRED') as LearningEvaluationMode,targetLevel:Number(args.targetLevel??args.target_level??2),rubric:Array.isArray(args.rubric)?args.rubric:[],objectiveIds:Array.isArray(objectiveIds)?objectiveIds.map(String):[],...(optionalText(args,'dueAt','due_at')?{dueAt:optionalText(args,'dueAt','due_at')}:{})})
  }
  if(method==='update_course'){
    const title=optionalText(args,'title');const description=optionalText(args,'description')
    if(!title&&!description)throw new Error('title or description is required')
    return updateTeacherCourseMetadata(db,{
      companyId:scope.companyId,courseId:scope.courseId,...(title?{title}:{}),...(description?{description}:{}),
    })
  }
  if(method==='set_learner_membership'){await setLearningCourseMembership(db,transaction,{companyId:scope.companyId,courseId:scope.courseId,managerId:scope.teacherId,userId:textArg(args,'userId','user_id'),role:'learner',enabled:boolArg(args)});return {ok:true}}
  if(method==='set_room_binding'){const conversationId=textArg(args,'conversationId','conversation_id');const purpose=optionalText(args,'purpose');const enabled=args.enabled!==false&&Boolean(purpose);await bindLearningCourseRoom(db,{companyId:scope.companyId,courseId:scope.courseId,managerId:scope.teacherId,conversationId,enabled,...(enabled?{purpose:purpose as 'lab'|'discussion'}:{})});return {ok:true,enabled}}
  if(method==='configure_digest')return configureDigest(scope,args,db)
  if(method==='publish_objective'){await setLearningObjectiveStatus(db,{companyId:scope.companyId,courseId:scope.courseId,objectiveId:textArg(args,'objectiveId','objective_id'),teacherId:scope.teacherId,status:'PUBLISHED'});return {ok:true}}
  if(method==='archive_objective'){await setLearningObjectiveStatus(db,{companyId:scope.companyId,courseId:scope.courseId,objectiveId:textArg(args,'objectiveId','objective_id'),teacherId:scope.teacherId,status:'ARCHIVED'});return {ok:true}}
  if(method==='publish_activity'){await publishLearningActivity(transaction,{companyId:scope.companyId,courseId:scope.courseId,activityId:textArg(args,'activityId','activity_id'),teacherId:scope.teacherId});return {ok:true}}
  if(method==='close_activity'){await closeLearningActivity(db,{companyId:scope.companyId,courseId:scope.courseId,activityId:textArg(args,'activityId','activity_id'),teacherId:scope.teacherId});return {ok:true}}
  if(method==='transition_course'){
    const command=textArg(args,'command')
    if(!['END','ENTER_READ_ONLY','ARCHIVE'].includes(command))throw new Error('command must be END, ENTER_READ_ONLY, or ARCHIVE')
    const lifecycle=new ProjectLifecycleApplication({transaction,auditInTransaction,projectLifecycleProjection})
    return lifecycle.executeInTransaction(db,{
      actorUserId:scope.teacherId,companyId:scope.companyId,projectId:scope.projectId,
      command:command as 'END'|'ENTER_READ_ONLY'|'ARCHIVE',
    })
  }
  if(method==='set_teacher_membership'){const userId=textArg(args,'userId','user_id');const enabled=boolArg(args);await setLearningCourseMembership(db,transaction,{companyId:scope.companyId,courseId:scope.courseId,managerId:scope.teacherId,userId,role:'teacher',enabled});await syncTeacherRoomMembers(scope.companyId,scope.courseId,db,transaction);return {ok:true}}
  if(method==='review_evaluation'||method==='override_mastery'){await reviewLearningEvaluation(db,transaction,inc,{companyId:scope.companyId,courseId:scope.courseId,evaluationId:textArg(args,'evaluationId','evaluation_id'),teacherId:scope.teacherId,decision:method==='override_mastery'?'accept':optionalText(args,'decision')==='reject'?'reject':'accept',reason:textArg(args,'reason'),...(args.overrideLevel!==undefined||args.override_level!==undefined?{overrideLevel:Number(args.overrideLevel??args.override_level)}:{})});return {ok:true}}
  throw new Error(`unsupported teacher action: ${method}`)
}
