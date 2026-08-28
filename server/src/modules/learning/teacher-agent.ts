import { createHash } from 'node:crypto'
import { audit } from '../identity/public.js'
import { pool } from '../../db/pool.js'
import type { Queryable } from '../../db/queryable.js'
import { withClientTransaction, withTransaction } from '../../db/transaction.js'
import type { PoolClient } from 'pg'
import { wukongClient } from '../../im/wukong.js'
import type { ImChannelProfile } from '../../im/types.js'
import { inc } from '../../metrics.js'
import type { AgentWorkItem, HostAction } from '../../agent-os/types.js'
import {
  bindLearningCourseRoom,
  closeLearningActivity,
  createLearningActivity,
  createLearningObjectives,
  publishLearningActivity,
  reviewLearningEvaluation,
  requireLearningCourseRole,
  setLearningCourseMembership,
  setLearningObjectiveStatus,
} from './application.js'
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
  findTeacherDigestSchedule,
  findTeacherScopeBinding,
  findTeacherTriggerAuthor,
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
  'set_course_status', 'set_teacher_membership', 'review_evaluation', 'override_mastery',
])
const WRITE_METHODS = new Set([
  'draft_objectives', 'draft_activity', 'update_course', 'set_learner_membership',
  'set_room_binding', 'configure_digest', ...APPROVAL_METHODS,
])

function learningTransaction(db: Queryable) {
  return <T>(work: (client: Queryable) => Promise<T>): Promise<T> => db === pool
    ? withTransaction(pool, work)
    : withClientTransaction(db as PoolClient, work)
}

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
  courseStatus: 'active' | 'archived'
  roomId: string
  roomStatus: 'active' | 'closed'
  agentId: string
  agentName: string
  teacherId?: string
  mode: 'teacher' | 'routine' | 'approval'
}

export async function resolveTeacherScope(work: AgentWorkItem, db: Queryable = pool): Promise<TeacherScope> {
  const row = await findTeacherScopeBinding(db, work.companyId, work.agentId, work.channelId)
  if (!row) { inc('learning.teacher_agent.authorization_denied', { reason: 'scope' }); throw new Error('teacher Agent is not registered for this room') }
  if (row.room_status !== 'active' || row.course_status === 'archived') throw new Error('teacher room is closed')
  if(work.reason==='routine'&&!row.has_teacher){
    await pauseTeacherDigestForMissingTeacher(db,work.companyId,work.agentId,work.channelId)
    throw new Error('teacher digest paused because the course has no teacher')
  }
  const teacherId = await findTeacherTriggerAuthor(db, work)
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

async function digestSchedule(scope: Pick<TeacherScope, 'companyId'|'agentId'|'roomId'>, db: Queryable = pool): Promise<TeacherDigestSchedule> {
  const row=await findTeacherDigestSchedule(db,scope.companyId,scope.agentId,scope.roomId)
  if (!row) return { frequency:'off',timezone:'Asia/Shanghai',status:'paused' }
  const frequency=row.schedule?.frequency==='daily'||row.schedule?.frequency==='weekly'?row.schedule.frequency:'off'
  const weekday=typeof row.schedule?.weekday==='string'&&WEEKDAYS.includes(row.schedule.weekday as typeof WEEKDAYS[number])
    ? row.schedule.weekday as typeof WEEKDAYS[number]:undefined
  return { frequency,timezone:row.timezone, ...(typeof row.schedule?.localTime==='string'?{localTime:row.schedule.localTime}:{}),
    ...(weekday?{weekday}:{}),status:row.status==='active'?'active':'paused',...(row.next_run_at?{nextRunAt:String(row.next_run_at)}:{}) }
}

export async function loadTeacherTurnContext(work: AgentWorkItem, db: Queryable = pool): Promise<TeacherTurnContext | undefined> {
  let scope:TeacherScope
  try { scope=await resolveTeacherScope(work,db) } catch { return undefined }
  const [counts,digest]=await Promise.all([
    findTeacherTurnCounts(db,scope.companyId,scope.courseId),
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

export async function ensureTeacherAgentForCourse(courseId: string, db: Queryable = pool): Promise<{agentId:string;roomId:string;created:boolean}> {
  const {rows:courseRows}=await db.query<{company_id:string;project_id:string;course_title:string;project_name:string}>(
    `SELECT c.company_id,c.project_id,p.name AS course_title,p.name AS project_name
       FROM courses c JOIN projects p ON p.id=c.project_id AND p.company_id=c.company_id
      WHERE c.id=$1 AND p.status='active' LIMIT 1`,[courseId],
  )
  const course=courseRows[0]
  if (!course) throw new Error('non-archived course not found')
  const agentId=`pulse-${stableSegment(`${course.company_id}:${course.project_id}`)}`
  const roomId=`teacher-${stableSegment(courseId)}`
  const displayName=`Pulse · ${course.project_name}`.slice(0,80)
  const {rows:existing}=await db.query<{agent_id:string}>(`SELECT agent_id FROM learning_project_teacher_agents WHERE project_id=$1`,[course.project_id])
  const resolvedAgentId=existing[0]?.agent_id??agentId
  await db.query(
    `INSERT INTO participants(id,preset_key,kind,name,role,initial,avatar_bg,status,bio,tools,capabilities,system_prompt,company_id)
     VALUES($1,$2,'agent',$3,$4,'P','transparent','avail','项目级教师专用智能体；负责课程管理与学情汇总',$5::jsonb,$6::jsonb,$7,$8)
     ON CONFLICT(id,company_id) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,tools=EXCLUDED.tools,
       capabilities=EXCLUDED.capabilities,system_prompt=EXCLUDED.system_prompt,departed_at=NULL`,
    [resolvedAgentId,`teacher-agent:${course.project_id}`,displayName,PULSE_ROLE,JSON.stringify(['ipython']),JSON.stringify(PULSE_CAPABILITIES),PULSE_PROMPT,course.company_id],
  )
  await db.query(
    `INSERT INTO learning_project_teacher_agents(project_id,company_id,agent_id,preset_version)
     VALUES($1,$2,$3,$4) ON CONFLICT(project_id) DO UPDATE SET preset_version=EXCLUDED.preset_version,updated_at=NOW()`,
    [course.project_id,course.company_id,resolvedAgentId,PULSE_PRESET_VERSION],
  )
  const {rows:teachers}=await db.query<{user_id:string}>(
    `SELECT user_id FROM course_members WHERE course_id=$1 AND role='teacher' ORDER BY user_id`,[courseId],
  )
  const members=[...teachers.map((row)=>row.user_id),resolvedAgentId]
  const title=`教师室｜${course.course_title}`.slice(0,80)
  const {rowCount}=await db.query(
    `INSERT INTO conversations(id,preset_key,kind,title,subtitle,topic,members,leader_id,pinned,tag,company_id,project_id)
     VALUES($1,$2,'group',$3,$4,'课程管理、学情汇总与教师审批',$5::jsonb,$6,TRUE,'teacher',$7,$8)
     ON CONFLICT(id) DO NOTHING`,
    [roomId,`teacher-room:${courseId}`,title,`教师 · ${teachers.length}`,JSON.stringify(members),resolvedAgentId,course.company_id,course.project_id],
  )
  await db.query(
    `INSERT INTO conversation_counters(conversation_id,next_sequence) VALUES($1,1) ON CONFLICT(conversation_id) DO NOTHING`,[roomId],
  )
  await db.query(
    `INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id,preset_key)
     VALUES($1,$2,$3::jsonb,$4,$5)
     ON CONFLICT(channel_id) DO UPDATE SET profile=EXCLUDED.profile,leader_agent_id=EXCLUDED.leader_agent_id,preset_key=EXCLUDED.preset_key`,
    [roomId,course.company_id,JSON.stringify({channelId:roomId,channelType:2,kind:'group',title,members,topic:'课程管理、学情汇总与教师审批',pinned:true,createdAt:new Date().toISOString()}),resolvedAgentId,`teacher-room:${courseId}`],
  )
  await db.query(
    `INSERT INTO learning_course_teacher_rooms(course_id,company_id,conversation_id,status) VALUES($1,$2,$3,'active')
     ON CONFLICT(course_id) DO UPDATE SET status='active',closed_at=NULL`,[courseId,course.company_id,roomId],
  )
  await db.query(
    `INSERT INTO agent_workspace(agent_id,path,body,company_id,updated_at)
     VALUES($1,'IDENTITY.md',$2,$3,NOW()),($1,'SOUL.md',$4,$3,NOW()) ON CONFLICT(agent_id,path) DO NOTHING`,
    [resolvedAgentId,`# ${displayName}\n\n**Role:** ${PULSE_ROLE}\n`,course.company_id,`# Pulse operating policy\n\n${PULSE_PROMPT}\n`],
  )
  if ((rowCount??0)>0) inc('learning.teacher_agent.provisioned')
  return {agentId:resolvedAgentId,roomId,created:(rowCount??0)>0}
}

export async function sendTeacherAgentWelcome(courseId:string):Promise<void>{
  const {rows}=await pool.query<{conversation_id:string;agent_id:string;course_title:string}>(
    `SELECT tr.conversation_id,pta.agent_id,project.name AS course_title FROM learning_course_teacher_rooms tr
      JOIN courses c ON c.id=tr.course_id AND c.company_id=tr.company_id
      JOIN projects project ON project.id=c.project_id AND project.company_id=c.company_id
      JOIN learning_project_teacher_agents pta ON pta.project_id=c.project_id AND pta.company_id=c.company_id
     WHERE tr.course_id=$1`,[courseId],
  )
  if(!rows[0])return
  await wukongClient().sendMessage(rows[0].conversation_id,2,rows[0].agent_id,{
    version:1,kind:'system',clientMsgNo:`teacher-welcome-${courseId}`,
    body:`Pulse 已就绪：我可以汇总“${rows[0].course_title}”的学情、管理草稿与成员，并把关键变更提交给教师审批。`,
    refs:{agentId:rows[0].agent_id},data:{suppressAgentWake:true},
  })
}

export async function syncTeacherRoomMembers(courseId:string,db:Queryable=pool):Promise<void>{
  const {rows}=await db.query<{conversation_id:string;status:string;agent_id:string}>(
    `SELECT tr.conversation_id,tr.status,pta.agent_id FROM learning_course_teacher_rooms tr
      JOIN courses c ON c.id=tr.course_id AND c.company_id=tr.company_id
      JOIN learning_project_teacher_agents pta ON pta.project_id=c.project_id AND pta.company_id=c.company_id
     WHERE tr.course_id=$1`,[courseId],
  )
  if(!rows[0]||rows[0].status!=='active')return
  const {rows:teachers}=await db.query<{user_id:string}>(`SELECT user_id FROM course_members WHERE course_id=$1 AND role='teacher' ORDER BY user_id`,[courseId])
  const members=[...teachers.map((row)=>row.user_id),rows[0].agent_id]
  await db.query(`UPDATE conversations SET members=$2::jsonb,subtitle=$3,updated_at=NOW() WHERE id=$1`,[rows[0].conversation_id,JSON.stringify(members),`教师 · ${teachers.length}`])
  const {rows:bindings}=await db.query<{profile:Record<string,unknown>}>(`UPDATE im_channel_bindings SET profile=profile||jsonb_build_object('members',$2::jsonb),updated_at=NOW() WHERE channel_id=$1 RETURNING profile`,[rows[0].conversation_id,JSON.stringify(members)])
  if(bindings[0]?.profile){
    await wukongClient().upsertChannel(bindings[0].profile as unknown as ImChannelProfile)
  }
}

export async function closeTeacherRoomForCourse(courseId:string,db:Queryable=pool):Promise<void>{
  await db.query(`UPDATE learning_course_teacher_rooms SET status='closed',closed_at=NOW() WHERE course_id=$1 AND status='active'`,[courseId])
  await db.query(`UPDATE agent_routines r SET status='paused',next_run_at=NULL,updated_at=NOW()
    FROM learning_course_teacher_rooms tr WHERE tr.course_id=$1 AND r.channel_id=tr.conversation_id AND r.kind='teacher_project_digest'`,[courseId])
}

export async function reactivateTeacherRoomForCourse(courseId:string,db:Queryable=pool):Promise<void>{
  const {rows:rooms}=await db.query<{conversation_id:string}>(
    `UPDATE learning_course_teacher_rooms room
        SET status='active',closed_at=NULL
       FROM courses course JOIN projects project
         ON project.id=course.project_id AND project.company_id=course.company_id
      WHERE room.course_id=$1 AND room.course_id=course.id AND room.company_id=course.company_id
        AND project.status='active'
      RETURNING room.conversation_id`,
    [courseId],
  )
  if(!rooms[0])throw new Error('teacher room not found for active course')
  await syncTeacherRoomMembers(courseId,db)
  const {rows:routines}=await db.query<{id:string;schedule:Record<string,unknown>;timezone:string}>(
    `SELECT routine.id,routine.schedule,routine.timezone
       FROM agent_routines routine
      WHERE routine.channel_id=$1 AND routine.kind='teacher_project_digest'`,
    [rooms[0].conversation_id],
  )
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
    await db.query(
      `UPDATE agent_routines SET status='active',next_run_at=$2,updated_at=NOW() WHERE id=$1`,
      [routine.id,nextRunAt],
    )
  }
}

export async function getTeacherAgentSummary(courseId:string,teacherId:string,db:Queryable=pool):Promise<TeacherAgentSummary>{
  await requireLearningCourseRole(db,{courseId,userId:teacherId,role:'teacher'})
  const {rows}=await db.query<{agent_id:string;name:string;project_id:string;conversation_id:string;room_status:'active'|'closed';company_id:string;pending:number}>(
    `SELECT pta.agent_id,p.name,c.project_id,tr.conversation_id,tr.status AS room_status,c.company_id,
      (SELECT COUNT(*)::int FROM agent_os_approvals a WHERE a.channel_id=tr.conversation_id AND a.status='pending') AS pending
     FROM courses c JOIN learning_project_teacher_agents pta ON pta.project_id=c.project_id AND pta.company_id=c.company_id
     JOIN participants p ON p.id=pta.agent_id AND p.company_id=pta.company_id
     JOIN learning_course_teacher_rooms tr ON tr.course_id=c.id WHERE c.id=$1`,[courseId],
  )
  const row=rows[0];if(!row)throw new Error('teacher Agent not provisioned')
  return {agentId:row.agent_id,displayName:row.name,projectId:row.project_id,courseId,roomId:row.conversation_id,roomStatus:row.room_status,
    digest:await digestSchedule({companyId:row.company_id,agentId:row.agent_id,roomId:row.conversation_id},db),pendingApprovals:Number(row.pending)}
}

async function overview(scope:TeacherScope,windowDays:number,db:Queryable):Promise<unknown>{
  const days=Math.max(1,Math.min(90,Math.trunc(windowDays||30)))
  const {distribution,missions,activity,attention,coverage}=await loadTeacherOverviewRows(
    db,
    {companyId:scope.companyId,courseId:scope.courseId},
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
  return {generatedAt:new Date().toISOString(),windowDays:days,course:{id:scope.courseId,title:scope.courseTitle},masteryDistribution:distribution,missions,activity:activity[0]??{},evidenceCoverage:coverage[0]??{},attention:attentionWithReasons}
}

async function listLearners(scope:TeacherScope,attentionOnly:boolean,db:Queryable):Promise<unknown[]>{
  const rows=await listTeacherLearnerRows(
    db,
    {companyId:scope.companyId,courseId:scope.courseId},
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
  const reportingScope={companyId:scope.companyId,courseId:scope.courseId}
  const member=await findTeacherLearner(db,reportingScope,learnerId)
  if(!member)throw new Error('learner is outside the current course')
  const detail=await loadTeacherLearnerDetailRows(db,reportingScope,learnerId)
  inc('learning.teacher_agent.learner_drilldown')
  return {learner:{id:learnerId,...member},...detail}
}

async function attemptDetail(scope:TeacherScope,attemptId:string,db:Queryable):Promise<unknown>{
  const attempt=await findTeacherAttemptDetail(
    db,
    {companyId:scope.companyId,courseId:scope.courseId},
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
  db:Queryable=pool,
):Promise<string>{
  const weekdayIndex=schedule.weekday?WEEKDAYS.indexOf(schedule.weekday)+1:1
  const {rows}=await db.query<{next_run_at:string}>(
    `WITH x AS (SELECT $5::timestamptz AT TIME ZONE $1 AS local_now), candidate AS (
       SELECT CASE WHEN $2='daily' THEN
         ((CASE WHEN local_now::time < $3::time THEN local_now::date ELSE local_now::date+1 END)+$3::time)
       ELSE
         ((local_now::date + (($4::int-EXTRACT(ISODOW FROM local_now)::int+7)%7))+$3::time)
       END AS local_candidate,local_now FROM x
     ) SELECT ((CASE WHEN $2='weekly' AND local_candidate<=local_now THEN local_candidate+INTERVAL '7 days' ELSE local_candidate END) AT TIME ZONE $1)::text AS next_run_at FROM candidate`,
    [timezone,schedule.frequency,schedule.localTime,weekdayIndex,from],
  )
  if(!rows[0])throw new Error('could not calculate next digest time')
  return String(rows[0].next_run_at)
}

async function configureDigest(scope:TeacherScope,args:Record<string,unknown>,db:Queryable):Promise<TeacherDigestSchedule>{
  if(!scope.teacherId)throw new Error('digest configuration requires a teacher')
  const frequency=textArg(args,'frequency')
  const id=`teacher-digest-${stableSegment(scope.courseId)}`
  if(frequency==='off'){
    await db.query(`UPDATE agent_routines SET status='paused',next_run_at=NULL,updated_at=NOW() WHERE id=$1 AND company_id=$2`,[id,scope.companyId])
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
  await db.query(`INSERT INTO agent_routines(id,company_id,agent_id,channel_id,kind,title,instructions,schedule,timezone,status,next_run_at,created_by,approved_by)
    VALUES($1,$2,$3,$4,'teacher_project_digest','项目学情摘要','Generate a bounded aggregate teacher digest with loop.teacher.overview. Do not read raw attempts or perform writes.',$5::jsonb,$6,'active',$7,$8,$8)
    ON CONFLICT(id) DO UPDATE SET schedule=EXCLUDED.schedule,timezone=EXCLUDED.timezone,status='active',next_run_at=EXCLUDED.next_run_at,updated_at=NOW(),created_by=EXCLUDED.created_by`,
    [id,scope.companyId,scope.agentId,scope.roomId,JSON.stringify(schedule),timezone,nextRunAt,scope.teacherId])
  inc('learning.teacher_agent.digest_configured',{frequency})
  return {frequency,timezone,localTime,...(weekday?{weekday}:{}),status:'active',nextRunAt}
}

export interface TeacherApprovalMetadata {requestedBy:string;summary:string;scope:Record<string,unknown>;preview:Record<string,unknown>}

export async function describeTeacherAction(work:AgentWorkItem,action:HostAction,db:Queryable=pool):Promise<TeacherApprovalMetadata|undefined>{
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
  else if(method==='set_course_status'){
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
    set_course_status:String(args.status)==='archived'?'归档课程':'启用课程',
    set_teacher_membership:args.enabled===false?'移除教师身份':'授予教师身份',
    review_evaluation:args.decision==='reject'?'退回学习评价':'采纳学习评价',override_mastery:'人工调整掌握等级',
  }
  return {requestedBy:scope.teacherId,summary:`${operationLabel[method]??'确认关键变更'}“${entityLabel??'当前对象'}”`,
    scope:{projectId:scope.projectId,courseId:scope.courseId,roomId:scope.roomId,risk:method.includes('evaluation')||method==='override_mastery'?'learning_evaluation':'course_management'},
    preview:{method,entityId,entityLabel,currentState,currentVersion,args}}
}

export async function assertTeacherApprovalFresh(input:{channelId:string;companyId:string;action:string;preview:Record<string,unknown>},db:Queryable=pool):Promise<void>{
  if(!input.action.startsWith('teacher.'))return
  const entityId=String(input.preview.entityId??'');const expected=String(input.preview.currentVersion??'')
  const method=input.action.slice('teacher.'.length);let current=''
  if(method.includes('objective'))current=versionToken(await findTeacherObjectiveApprovalVersion(db,input.companyId,input.channelId,entityId))
  else if(method.includes('activity'))current=versionToken(await findTeacherActivityApprovalVersion(db,input.companyId,input.channelId,entityId))
  else if(method==='set_course_status')current=versionToken(await findTeacherCourseApprovalVersion(db,input.companyId,input.channelId,entityId))
  else if(method==='set_teacher_membership')current=String(await findTeacherMembershipApprovalVersion(db,input.companyId,input.channelId,entityId))
  else current=String(await findTeacherEvaluationApprovalVersion(db,input.companyId,input.channelId,entityId)??'')
  if(!current||current!==expected)throw new Error('approval is stale because the target changed; request a fresh approval')
}

export function teacherActionRequiresApproval(action:string):boolean{return action.startsWith('teacher.')&&APPROVAL_METHODS.has(action.slice('teacher.'.length))}

export async function executeTeacherAction(work:AgentWorkItem,method:string,args:Record<string,unknown>,db:Queryable=pool):Promise<unknown>{
  const scope=await resolveTeacherScope(work,db)
  if(scope.mode==='routine'&&WRITE_METHODS.has(method))throw new Error('scheduled teacher summaries are read-only')
  if(method==='current')return loadTeacherTurnContext(work,db)
  if(method==='overview')return overview(scope,Number(args.windowDays??args.window_days??30),db)
  if(method==='list_learners')return listLearners(scope,args.attentionOnly===true||args.attention_only===true,db)
  if(method==='get_learner')return learnerDetail(scope,textArg(args,'learnerId','learner_id'),db)
  if(method==='get_attempt')return attemptDetail(scope,textArg(args,'attemptId','attempt_id'),db)
  const reportingScope={companyId:scope.companyId,courseId:scope.courseId}
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
    return createLearningObjectives(db, learningTransaction(db), {
      companyId: scope.companyId,
      courseId: scope.courseId,
      actorId: scope.teacherId,
      actorKind: 'teacher',
      objectives: values,
    })
  }
  if(method==='draft_activity'){
    const objectiveIds=args.objectiveIds??args.objective_ids
    return createLearningActivity(db,learningTransaction(db),{companyId:scope.companyId,courseId:scope.courseId,actorId:scope.teacherId,actorKind:'teacher',title:textArg(args,'title'),instructions:textArg(args,'instructions'),type:textArg(args,'type') as LearningActivityType,evaluationMode:(optionalText(args,'evaluationMode','evaluation_mode')??'teacher_required') as LearningEvaluationMode,targetLevel:Number(args.targetLevel??args.target_level??2),rubric:Array.isArray(args.rubric)?args.rubric:[],objectiveIds:Array.isArray(objectiveIds)?objectiveIds.map(String):[],...(optionalText(args,'dueAt','due_at')?{dueAt:optionalText(args,'dueAt','due_at')}:{})})
  }
  if(method==='update_course'){
    const title=optionalText(args,'title');const description=optionalText(args,'description')
    if(!title&&!description)throw new Error('title or description is required')
    const {rows}=await db.query(`UPDATE projects project SET name=COALESCE($2,project.name),description=COALESCE($3,project.description),updated_at=NOW() FROM courses course WHERE course.id=$1 AND course.project_id=project.id AND course.company_id=project.company_id RETURNING project.*`,[scope.courseId,title??null,description??null])
    if(title){
      await db.query(`UPDATE participants participant SET name=$2,updated_at=NOW() FROM courses course JOIN learning_project_teacher_agents pulse ON pulse.project_id=course.project_id AND pulse.company_id=course.company_id WHERE course.id=$1 AND participant.id=pulse.agent_id AND participant.company_id=pulse.company_id`,[scope.courseId,`Pulse · ${title}`.slice(0,80)])
    }
    return rows[0]
  }
  if(method==='set_learner_membership'){await setLearningCourseMembership(db,learningTransaction(db),{companyId:scope.companyId,courseId:scope.courseId,managerId:scope.teacherId,userId:textArg(args,'userId','user_id'),role:'learner',enabled:boolArg(args)});return {ok:true}}
  if(method==='set_room_binding'){const conversationId=textArg(args,'conversationId','conversation_id');const purpose=optionalText(args,'purpose');const enabled=args.enabled!==false&&Boolean(purpose);await bindLearningCourseRoom(db,{companyId:scope.companyId,courseId:scope.courseId,managerId:scope.teacherId,conversationId,enabled,...(enabled?{purpose:purpose as 'lab'|'discussion'}:{})});return {ok:true,enabled}}
  if(method==='configure_digest')return configureDigest(scope,args,db)
  if(method==='publish_objective'){await setLearningObjectiveStatus(db,{companyId:scope.companyId,courseId:scope.courseId,objectiveId:textArg(args,'objectiveId','objective_id'),teacherId:scope.teacherId,status:'published'});return {ok:true}}
  if(method==='archive_objective'){await setLearningObjectiveStatus(db,{companyId:scope.companyId,courseId:scope.courseId,objectiveId:textArg(args,'objectiveId','objective_id'),teacherId:scope.teacherId,status:'archived'});return {ok:true}}
  if(method==='publish_activity'){await publishLearningActivity(learningTransaction(db),{companyId:scope.companyId,courseId:scope.courseId,activityId:textArg(args,'activityId','activity_id'),teacherId:scope.teacherId});return {ok:true}}
  if(method==='close_activity'){await closeLearningActivity(db,{companyId:scope.companyId,courseId:scope.courseId,activityId:textArg(args,'activityId','activity_id'),teacherId:scope.teacherId});return {ok:true}}
  if(method==='set_course_status'){
    const status=textArg(args,'status')
    if(!['active','archived'].includes(status))throw new Error('status must be active or archived')
    const {rows}=await db.query(`UPDATE projects project SET status=$2,updated_at=NOW(),archived_at=CASE WHEN $2='archived' THEN NOW() ELSE NULL END FROM courses course WHERE course.id=$1 AND course.project_id=project.id AND course.company_id=project.company_id RETURNING project.*`,[scope.courseId,status])
    if(status==='archived')await closeTeacherRoomForCourse(scope.courseId,db)
    else await reactivateTeacherRoomForCourse(scope.courseId,db)
    return rows[0]
  }
  if(method==='set_teacher_membership'){const userId=textArg(args,'userId','user_id');const enabled=boolArg(args);await setLearningCourseMembership(db,learningTransaction(db),{companyId:scope.companyId,courseId:scope.courseId,managerId:scope.teacherId,userId,role:'teacher',enabled});await syncTeacherRoomMembers(scope.courseId,db);return {ok:true}}
  if(method==='review_evaluation'||method==='override_mastery'){await reviewLearningEvaluation(db,learningTransaction(db),inc,{companyId:scope.companyId,courseId:scope.courseId,evaluationId:textArg(args,'evaluationId','evaluation_id'),teacherId:scope.teacherId,decision:method==='override_mastery'?'accept':optionalText(args,'decision')==='reject'?'reject':'accept',reason:textArg(args,'reason'),...(args.overrideLevel!==undefined||args.override_level!==undefined?{overrideLevel:Number(args.overrideLevel??args.override_level)}:{})});return {ok:true}}
  throw new Error(`unsupported teacher action: ${method}`)
}
