import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { audit } from '../auth.js'
import { pool } from '../db/pool.js'
import { wukongClient } from '../im/wukong.js'
import type { ImChannelProfile } from '../im/types.js'
import { inc } from '../metrics.js'
import type { AgentWorkItem, HostAction } from '../agent-os/types.js'
import {
  bindCourseRoom,
  closeActivity,
  createObjectives,
  draftActivity,
  publishActivity,
  requireCourseRole,
  reviewEvaluation,
  setCourseMembership,
  setObjectiveStatus,
} from './service.js'
import type {
  LearningActivityType,
  LearningEvaluationMode,
  LearningRoomPurpose,
  TeacherAgentSummary,
  TeacherDigestSchedule,
  TeacherTurnContext,
} from './types.js'

type Queryable = Pick<PoolClient, 'query'> | typeof pool

const PULSE_PRESET_VERSION = 1
const PULSE_CAPABILITIES = ['teacher_admin'] as const
const PULSE_ROLE = '教学运营与学情汇总 · Teacher Operations'
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

function boolArg(args: Record<string, unknown>, fallback = true): boolean {
  return typeof args.enabled === 'boolean' ? args.enabled : fallback
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
  courseStatus: 'draft' | 'active' | 'archived'
  roomId: string
  roomStatus: 'active' | 'closed'
  agentId: string
  agentName: string
  teacherId?: string
  mode: 'teacher' | 'routine' | 'approval'
}

async function triggerAuthor(work: AgentWorkItem, db: Queryable): Promise<string | undefined> {
  if (work.reason === 'routine') return undefined
  const trigger = work.reason === 'resume' && work.triggerClientMsgNo.startsWith('approval:')
    ? (await db.query<{ actor_id: string | null }>(
        `SELECT COALESCE(resolved_by,requested_by) AS actor_id FROM agent_os_approvals WHERE id=$1 AND company_id=$2 AND agent_id=$3`,
        [work.triggerClientMsgNo.slice('approval:'.length), work.companyId, work.agentId],
      )).rows[0]?.actor_id
    : (await db.query<{ author_id: string }>(
        `SELECT author_id FROM messages WHERE conversation_id=$1 AND client_msg_no=$2 LIMIT 1`,
        [work.channelId, work.triggerClientMsgNo],
      )).rows[0]?.author_id
  return trigger || undefined
}

export async function resolveTeacherScope(work: AgentWorkItem, db: Queryable = pool): Promise<TeacherScope> {
  const { rows } = await db.query<{
    company_id:string;project_id:string;project_name:string;course_id:string;course_title:string
    course_status:'draft'|'active'|'archived';room_id:string;room_status:'active'|'closed';agent_id:string;agent_name:string;has_teacher:boolean
  }>(
    `SELECT pta.company_id,pta.project_id,p.name AS project_name,c.id AS course_id,c.title AS course_title,
            c.status AS course_status,tr.conversation_id AS room_id,tr.status AS room_status,
            pta.agent_id,pa.name AS agent_name,
            EXISTS(SELECT 1 FROM learning_course_memberships cm WHERE cm.course_id=c.id AND cm.role='teacher') AS has_teacher
       FROM learning_project_teacher_agents pta
       JOIN projects p ON p.id=pta.project_id AND p.company_id=pta.company_id
       JOIN learning_courses c ON c.project_id=pta.project_id AND c.company_id=pta.company_id
       JOIN learning_course_teacher_rooms tr ON tr.course_id=c.id
       JOIN participants pa ON pa.id=pta.agent_id AND pa.company_id=pta.company_id AND pa.departed_at IS NULL
      WHERE pta.company_id=$1 AND pta.agent_id=$2 AND tr.conversation_id=$3 LIMIT 1`,
    [work.companyId, work.agentId, work.channelId],
  )
  const row = rows[0]
  if (!row) { inc('learning.teacher_agent.authorization_denied', { reason: 'scope' }); throw new Error('teacher Agent is not registered for this room') }
  if (row.room_status !== 'active' || row.course_status === 'archived') throw new Error('teacher room is closed')
  if(work.reason==='routine'&&!row.has_teacher){
    await db.query(`UPDATE agent_routines SET status='paused',next_run_at=NULL,updated_at=NOW() WHERE company_id=$1 AND agent_id=$2 AND channel_id=$3 AND kind='teacher_project_digest'`,[work.companyId,work.agentId,work.channelId])
    throw new Error('teacher digest paused because the course has no teacher')
  }
  const teacherId = await triggerAuthor(work, db)
  if (work.reason !== 'routine') {
    if (!teacherId) throw new Error('teacher action requires a human trigger')
    await requireCourseRole(row.course_id, teacherId, 'teacher', db)
  }
  return {
    companyId:row.company_id,projectId:row.project_id,projectName:row.project_name,
    courseId:row.course_id,courseTitle:row.course_title,courseStatus:row.course_status,
    roomId:row.room_id,roomStatus:row.room_status,agentId:row.agent_id,agentName:row.agent_name,
    ...(teacherId?{teacherId}:{}),mode:work.reason==='routine'?'routine':work.reason==='resume'?'approval':'teacher',
  }
}

async function digestSchedule(scope: Pick<TeacherScope, 'companyId'|'agentId'|'roomId'>, db: Queryable = pool): Promise<TeacherDigestSchedule> {
  const { rows } = await db.query<{ schedule:Record<string,unknown>;timezone:string;status:string;next_run_at:string|null }>(
    `SELECT schedule,timezone,status,next_run_at FROM agent_routines
      WHERE company_id=$1 AND agent_id=$2 AND channel_id=$3 AND kind='teacher_project_digest' LIMIT 1`,
    [scope.companyId,scope.agentId,scope.roomId],
  )
  const row=rows[0]
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
  const [{rows:counts},digest]=await Promise.all([
    db.query<{learners:number;objectives:number;activities:number;pending_reviews:number}>(
      `SELECT
        (SELECT COUNT(DISTINCT user_id)::int FROM learning_course_memberships WHERE course_id=$1 AND role='learner') AS learners,
        (SELECT COUNT(*)::int FROM learning_objectives WHERE course_id=$1 AND status<>'archived') AS objectives,
        (SELECT COUNT(*)::int FROM learning_activities WHERE course_id=$1 AND status<>'closed') AS activities,
        (SELECT COUNT(*)::int FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id WHERE a.course_id=$1 AND e.status='pending') AS pending_reviews`,
      [scope.courseId],
    ),
    digestSchedule(scope,db),
  ])
  const count=counts[0]??{learners:0,objectives:0,activities:0,pending_reviews:0}
  return {
    agent:{id:scope.agentId,name:scope.agentName,projectId:scope.projectId},
    course:{id:scope.courseId,projectId:scope.projectId,title:scope.courseTitle,status:scope.courseStatus},
    room:{id:scope.roomId,status:scope.roomStatus},
    trigger:{mode:scope.mode,...(scope.teacherId?{teacherId:scope.teacherId}:{})},
    counts:{learners:Number(count.learners),objectives:Number(count.objectives),activities:Number(count.activities),pendingReviews:Number(count.pending_reviews)},
    digest,
  }
}

export async function ensureTeacherAgentForCourse(courseId: string, db: Queryable = pool): Promise<{agentId:string;roomId:string;created:boolean}> {
  const {rows:courseRows}=await db.query<{company_id:string;project_id:string;course_title:string;project_name:string}>(
    `SELECT c.company_id,c.project_id,c.title AS course_title,p.name AS project_name
       FROM learning_courses c JOIN projects p ON p.id=c.project_id AND p.company_id=c.company_id
      WHERE c.id=$1 AND c.status<>'archived' LIMIT 1`,[courseId],
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
     VALUES($1,$2,'agent',$3,$4,'P','#7756D8','avail','Project-scoped teacher operations Agent',$5::jsonb,$6::jsonb,$7,$8)
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
    `SELECT user_id FROM learning_course_memberships WHERE course_id=$1 AND role='teacher' ORDER BY user_id`,[courseId],
  )
  const members=[...teachers.map((row)=>row.user_id),resolvedAgentId]
  const title=`教师室｜${course.course_title}`.slice(0,80)
  const {rowCount}=await db.query(
    `INSERT INTO conversations(id,preset_key,kind,title,subtitle,topic,members,leader_id,pinned,tag,company_id,project_id)
     VALUES($1,$2,'group',$3,$4,'课程管理、学情汇总与教师审批',$5::jsonb,$6,TRUE,'teacher',$7,$8)
     ON CONFLICT(id) DO NOTHING`,
    [roomId,`teacher-room:${courseId}`,title,`teachers · ${teachers.length}`,JSON.stringify(members),resolvedAgentId,course.company_id,course.project_id],
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
    `INSERT INTO learning_course_teacher_rooms(course_id,conversation_id,status) VALUES($1,$2,'active')
     ON CONFLICT(course_id) DO UPDATE SET status='active',closed_at=NULL`,[courseId,roomId],
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
    `SELECT tr.conversation_id,pta.agent_id,c.title AS course_title FROM learning_course_teacher_rooms tr
      JOIN learning_courses c ON c.id=tr.course_id JOIN learning_project_teacher_agents pta ON pta.project_id=c.project_id
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
      JOIN learning_courses c ON c.id=tr.course_id JOIN learning_project_teacher_agents pta ON pta.project_id=c.project_id
     WHERE tr.course_id=$1`,[courseId],
  )
  if(!rows[0]||rows[0].status!=='active')return
  const {rows:teachers}=await db.query<{user_id:string}>(`SELECT user_id FROM learning_course_memberships WHERE course_id=$1 AND role='teacher' ORDER BY user_id`,[courseId])
  const members=[...teachers.map((row)=>row.user_id),rows[0].agent_id]
  await db.query(`UPDATE conversations SET members=$2::jsonb,subtitle=$3,updated_at=NOW() WHERE id=$1`,[rows[0].conversation_id,JSON.stringify(members),`teachers · ${teachers.length}`])
  const {rows:bindings}=await db.query<{profile:Record<string,unknown>}>(`UPDATE im_channel_bindings SET profile=profile||jsonb_build_object('members',$2::jsonb),updated_at=NOW() WHERE channel_id=$1 RETURNING profile`,[rows[0].conversation_id,JSON.stringify(members)])
  if(bindings[0]?.profile)await wukongClient().upsertChannel(bindings[0].profile as unknown as ImChannelProfile)
}

export async function closeTeacherRoomForCourse(courseId:string,db:Queryable=pool):Promise<void>{
  await db.query(`UPDATE learning_course_teacher_rooms SET status='closed',closed_at=NOW() WHERE course_id=$1 AND status='active'`,[courseId])
  await db.query(`UPDATE agent_routines r SET status='paused',next_run_at=NULL,updated_at=NOW()
    FROM learning_course_teacher_rooms tr WHERE tr.course_id=$1 AND r.channel_id=tr.conversation_id AND r.kind='teacher_project_digest'`,[courseId])
}

export async function backfillTeacherAgents():Promise<void>{
  const {rows}=await pool.query<{id:string}>(`SELECT id FROM learning_courses WHERE status<>'archived' ORDER BY created_at`)
  for(const row of rows){
    try{const result=await ensureTeacherAgentForCourse(row.id);if(result.created)await sendTeacherAgentWelcome(row.id)}
    catch(error){console.warn(`[learning:pulse] backfill failed for ${row.id}:`,error instanceof Error?error.message:String(error))}
  }
}

export async function getTeacherAgentSummary(courseId:string,teacherId:string,db:Queryable=pool):Promise<TeacherAgentSummary>{
  await requireCourseRole(courseId,teacherId,'teacher',db)
  const {rows}=await db.query<{agent_id:string;name:string;project_id:string;conversation_id:string;room_status:'active'|'closed';company_id:string;pending:number}>(
    `SELECT pta.agent_id,p.name,c.project_id,tr.conversation_id,tr.status AS room_status,c.company_id,
      (SELECT COUNT(*)::int FROM agent_os_approvals a WHERE a.channel_id=tr.conversation_id AND a.status='pending') AS pending
     FROM learning_courses c JOIN learning_project_teacher_agents pta ON pta.project_id=c.project_id
     JOIN participants p ON p.id=pta.agent_id AND p.company_id=pta.company_id
     JOIN learning_course_teacher_rooms tr ON tr.course_id=c.id WHERE c.id=$1`,[courseId],
  )
  const row=rows[0];if(!row)throw new Error('teacher Agent not provisioned')
  return {agentId:row.agent_id,displayName:row.name,projectId:row.project_id,courseId,roomId:row.conversation_id,roomStatus:row.room_status,
    digest:await digestSchedule({companyId:row.company_id,agentId:row.agent_id,roomId:row.conversation_id},db),pendingApprovals:Number(row.pending)}
}

async function overview(scope:TeacherScope,windowDays:number,db:Queryable):Promise<unknown>{
  const days=Math.max(1,Math.min(90,Math.trunc(windowDays||30)))
  const [{rows:distribution},{rows:mission},{rows:activity},{rows:attention},{rows:coverage}]=await Promise.all([
    db.query(`WITH totals AS (
      SELECT (SELECT COUNT(DISTINCT user_id) FROM learning_course_memberships WHERE course_id=$1 AND role='learner')*
             (SELECT COUNT(*) FROM learning_objectives WHERE course_id=$1 AND status<>'archived') AS possible
    ),levels AS(SELECT generate_series(0,4) AS level)
    SELECT levels.level,CASE WHEN levels.level=0 THEN GREATEST(totals.possible-COUNT(m.objective_id) FILTER(WHERE m.level<>0),0)::int
      ELSE COUNT(m.objective_id) FILTER(WHERE m.level=levels.level)::int END AS objective_states
    FROM levels CROSS JOIN totals LEFT JOIN learning_mastery m ON m.course_id=$1 GROUP BY levels.level,totals.possible ORDER BY levels.level`,[scope.courseId]),
    db.query(`SELECT status,COUNT(*)::int AS count FROM learning_missions WHERE course_id=$1 GROUP BY status ORDER BY status`,[scope.courseId]),
    db.query(`SELECT
      COUNT(DISTINCT a.id) FILTER(WHERE a.submitted_at>=NOW()-($2::int*INTERVAL '1 day'))::int AS attempts,
      COUNT(DISTINCT e.id) FILTER(WHERE e.status='pending')::int AS pending_reviews,
      COUNT(DISTINCT e.id) FILTER(WHERE e.status='accepted')::int AS accepted_evaluations,
      COUNT(DISTINCT e.id) FILTER(WHERE e.status='rejected')::int AS rejected_evaluations
      FROM learning_attempts a LEFT JOIN learning_evaluations e ON e.attempt_id=a.id WHERE a.course_id=$1`,[scope.courseId,days]),
    db.query(`SELECT cm.user_id,u.display_name,
      COUNT(DISTINCT m.objective_id) FILTER(WHERE m.next_review_at<=NOW())::int AS due_reviews,
      COUNT(DISTINCT m.objective_id) FILTER(WHERE m.status='needs_review')::int AS needs_review,
      COUNT(DISTINCT lm.id) FILTER(WHERE lm.status='paused')::int AS paused_missions
      FROM learning_course_memberships cm JOIN users u ON u.id=cm.user_id
      LEFT JOIN learning_mastery m ON m.course_id=cm.course_id AND m.learner_id=cm.user_id
      LEFT JOIN learning_missions lm ON lm.course_id=cm.course_id AND lm.learner_id=cm.user_id
      WHERE cm.course_id=$1 AND cm.role='learner' GROUP BY cm.user_id,u.display_name
      HAVING COUNT(DISTINCT m.objective_id) FILTER(WHERE m.next_review_at<=NOW())>0
          OR COUNT(DISTINCT m.objective_id) FILTER(WHERE m.status='needs_review')>0
          OR COUNT(DISTINCT lm.id) FILTER(WHERE lm.status='paused')>0
      ORDER BY needs_review DESC,due_reviews DESC LIMIT 20`,[scope.courseId]),
    db.query(`SELECT
      (SELECT COUNT(DISTINCT user_id)::int FROM learning_course_memberships WHERE course_id=$1 AND role='learner') AS learners,
      COUNT(DISTINCT a.learner_id)::int AS learners_with_evidence,
      COUNT(DISTINCT a.id)::int AS verified_attempts,
      COUNT(DISTINCT m.learner_id||':'||m.objective_id) FILTER(WHERE m.next_review_at<=NOW())::int AS due_reviews
      FROM learning_attempts a FULL JOIN learning_mastery m ON m.course_id=a.course_id AND m.learner_id=a.learner_id WHERE COALESCE(a.course_id,m.course_id)=$1`,[scope.courseId]),
  ])
  inc('learning.teacher_agent.summary_generated')
  const attentionWithReasons=attention.map((item)=>{
    const row=object(item);const reasons:string[]=[]
    if(Number(row.due_reviews)>0)reasons.push('due_review')
    if(Number(row.needs_review)>0)reasons.push('needs_review')
    if(Number(row.paused_missions)>0)reasons.push('paused_mission')
    return {...row,reasons}
  })
  return {generatedAt:new Date().toISOString(),windowDays:days,course:{id:scope.courseId,title:scope.courseTitle},masteryDistribution:distribution,missions:mission,activity:activity[0]??{},evidenceCoverage:coverage[0]??{},attention:attentionWithReasons}
}

async function listLearners(scope:TeacherScope,attentionOnly:boolean,db:Queryable):Promise<unknown[]>{
  const {rows}=await db.query(`SELECT cm.user_id,u.display_name,u.email,
    COALESCE(AVG(m.level),0)::float AS average_level,
    COUNT(DISTINCT m.objective_id) FILTER(WHERE m.level>=3)::int AS verified_objectives,
    COUNT(DISTINCT m.objective_id) FILTER(WHERE m.next_review_at<=NOW())::int AS due_reviews,
    COUNT(DISTINCT m.objective_id) FILTER(WHERE m.status='needs_review')::int AS needs_review,
    COUNT(DISTINCT lm.id) FILTER(WHERE lm.status='paused')::int AS paused_missions
    FROM learning_course_memberships cm JOIN users u ON u.id=cm.user_id
    LEFT JOIN learning_mastery m ON m.course_id=cm.course_id AND m.learner_id=cm.user_id
    LEFT JOIN learning_missions lm ON lm.course_id=cm.course_id AND lm.learner_id=cm.user_id
    WHERE cm.course_id=$1 AND cm.role='learner' GROUP BY cm.user_id,u.display_name,u.email
    HAVING NOT $2::boolean OR COUNT(DISTINCT m.objective_id) FILTER(WHERE m.next_review_at<=NOW())>0
      OR COUNT(DISTINCT m.objective_id) FILTER(WHERE m.status='needs_review')>0 OR COUNT(DISTINCT lm.id) FILTER(WHERE lm.status='paused')>0
    ORDER BY needs_review DESC,due_reviews DESC,u.display_name LIMIT 100`,[scope.courseId,attentionOnly])
  return rows.map((item)=>{
    const row=object(item);const attentionReasons:string[]=[]
    if(Number(row.due_reviews)>0)attentionReasons.push('due_review')
    if(Number(row.needs_review)>0)attentionReasons.push('needs_review')
    if(Number(row.paused_missions)>0)attentionReasons.push('paused_mission')
    return {...row,attentionReasons}
  })
}

async function learnerDetail(scope:TeacherScope,learnerId:string,db:Queryable):Promise<unknown>{
  const {rows:member}=await db.query<{display_name:string;email:string}>(`SELECT u.display_name,u.email FROM learning_course_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.course_id=$1 AND cm.user_id=$2 AND cm.role='learner'`,[scope.courseId,learnerId])
  if(!member[0])throw new Error('learner is outside the current course')
  const [mastery,missions,attempts]=await Promise.all([
    db.query(`SELECT m.objective_id,o.title,m.level,m.status,m.next_review_at,m.review_interval_days FROM learning_mastery m JOIN learning_objectives o ON o.id=m.objective_id WHERE m.course_id=$1 AND m.learner_id=$2 ORDER BY o.position LIMIT 100`,[scope.courseId,learnerId]),
    db.query(`SELECT id,goal,success_criteria,status,updated_at FROM learning_missions WHERE course_id=$1 AND learner_id=$2 ORDER BY updated_at DESC LIMIT 20`,[scope.courseId,learnerId]),
    db.query(`SELECT a.id,a.activity_id,a.mission_step_id,a.assistance,a.status,a.submitted_at,e.demonstrated_level,e.confidence,e.status AS evaluation_status,e.feedback FROM learning_attempts a LEFT JOIN LATERAL(SELECT * FROM learning_evaluations e WHERE e.attempt_id=a.id ORDER BY e.created_at DESC LIMIT 1)e ON TRUE WHERE a.course_id=$1 AND a.learner_id=$2 ORDER BY a.submitted_at DESC LIMIT 20`,[scope.courseId,learnerId]),
  ])
  inc('learning.teacher_agent.learner_drilldown')
  return {learner:{id:learnerId,...member[0]},mastery:mastery.rows,missions:missions.rows,attempts:attempts.rows}
}

async function attemptDetail(scope:TeacherScope,attemptId:string,db:Queryable):Promise<unknown>{
  const {rows}=await db.query(`SELECT a.id,a.learner_id,a.activity_id,a.mission_step_id,a.assistance,a.status,a.submitted_at,a.evidence,
    COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'level',e.demonstrated_level,'confidence',e.confidence,'status',e.status,'feedback',e.feedback)) FILTER(WHERE e.id IS NOT NULL),'[]'::jsonb) AS evaluations
    FROM learning_attempts a LEFT JOIN learning_evaluations e ON e.attempt_id=a.id WHERE a.id=$1 AND a.course_id=$2 GROUP BY a.id`,[attemptId,scope.courseId])
  if(!rows[0])throw new Error('attempt is outside the current course')
  await audit({kind:'teacher_agent_attempt_access',userId:scope.teacherId,companyId:scope.companyId,detail:{courseId:scope.courseId,attemptId,agentId:scope.agentId}})
  inc('learning.teacher_agent.evidence_accessed')
  return rows[0]
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
    VALUES($1,$2,$3,$4,'teacher_project_digest','Project 学情摘要','Generate a bounded aggregate teacher digest with loop.teacher.overview. Do not read raw attempts or perform writes.',$5::jsonb,$6,'active',$7,$8,$8)
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
  let entityId:string|undefined;let currentState:unknown;let currentVersion:unknown
  if(method.includes('objective')){entityId=textArg(args,'objectiveId','objective_id');const {rows}=await db.query(`SELECT status,updated_at FROM learning_objectives WHERE id=$1 AND course_id=$2`,[entityId,scope.courseId]);if(!rows[0])throw new Error('objective is outside the current course');currentState=rows[0].status;currentVersion=versionToken(rows[0].updated_at)}
  else if(method.includes('activity')){entityId=textArg(args,'activityId','activity_id');const {rows}=await db.query(`SELECT status,updated_at FROM learning_activities WHERE id=$1 AND course_id=$2`,[entityId,scope.courseId]);if(!rows[0])throw new Error('activity is outside the current course');currentState=rows[0].status;currentVersion=versionToken(rows[0].updated_at)}
  else if(method==='set_course_status'){entityId=scope.courseId;const {rows}=await db.query(`SELECT status,updated_at FROM learning_courses WHERE id=$1`,[scope.courseId]);currentState=rows[0]?.status;currentVersion=versionToken(rows[0]?.updated_at)}
  else if(method==='set_teacher_membership'){entityId=textArg(args,'userId','user_id');const {rows}=await db.query(`SELECT EXISTS(SELECT 1 FROM learning_course_memberships WHERE course_id=$1 AND user_id=$2 AND role='teacher') AS enabled`,[scope.courseId,entityId]);currentState=Boolean(rows[0]?.enabled);currentVersion=currentState}
  else {entityId=textArg(args,'evaluationId','evaluation_id');const {rows}=await db.query(`SELECT e.status FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id WHERE e.id=$1 AND a.course_id=$2`,[entityId,scope.courseId]);if(!rows[0])throw new Error('evaluation is outside the current course');currentState=rows[0].status;currentVersion=currentState}
  return {requestedBy:scope.teacherId,summary:`${scope.agentName} 请求教师确认：${method}`,
    scope:{projectId:scope.projectId,courseId:scope.courseId,roomId:scope.roomId,risk:method.includes('evaluation')||method==='override_mastery'?'learning_evaluation':'course_management'},
    preview:{method,entityId,currentState,currentVersion,args}}
}

export async function assertTeacherApprovalFresh(input:{channelId:string;companyId:string;action:string;preview:Record<string,unknown>},db:Queryable=pool):Promise<void>{
  if(!input.action.startsWith('teacher.'))return
  const entityId=String(input.preview.entityId??'');const expected=String(input.preview.currentVersion??'')
  const method=input.action.slice('teacher.'.length);let current=''
  if(method.includes('objective'))current=versionToken((await db.query(`SELECT o.updated_at FROM learning_objectives o JOIN learning_course_teacher_rooms tr ON tr.course_id=o.course_id WHERE o.id=$1 AND tr.conversation_id=$2`,[entityId,input.channelId])).rows[0]?.updated_at)
  else if(method.includes('activity'))current=versionToken((await db.query(`SELECT a.updated_at FROM learning_activities a JOIN learning_course_teacher_rooms tr ON tr.course_id=a.course_id WHERE a.id=$1 AND tr.conversation_id=$2`,[entityId,input.channelId])).rows[0]?.updated_at)
  else if(method==='set_course_status')current=versionToken((await db.query(`SELECT c.updated_at FROM learning_courses c JOIN learning_course_teacher_rooms tr ON tr.course_id=c.id WHERE c.id=$1 AND tr.conversation_id=$2`,[entityId,input.channelId])).rows[0]?.updated_at)
  else if(method==='set_teacher_membership')current=String(Boolean((await db.query(`SELECT 1 FROM learning_course_memberships cm JOIN learning_course_teacher_rooms tr ON tr.course_id=cm.course_id WHERE tr.conversation_id=$1 AND cm.user_id=$2 AND cm.role='teacher'`,[input.channelId,entityId])).rows[0]))
  else current=String((await db.query(`SELECT e.status FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id JOIN learning_course_teacher_rooms tr ON tr.course_id=a.course_id WHERE e.id=$1 AND tr.conversation_id=$2`,[entityId,input.channelId])).rows[0]?.status??'')
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
  if(method==='list_objectives')return (await db.query(`SELECT o.*,COALESCE(jsonb_agg(d.prerequisite_objective_id) FILTER(WHERE d.prerequisite_objective_id IS NOT NULL),'[]'::jsonb) AS prerequisite_ids FROM learning_objectives o LEFT JOIN learning_objective_dependencies d ON d.objective_id=o.id WHERE o.course_id=$1 GROUP BY o.id ORDER BY o.position`,[scope.courseId])).rows
  if(method==='list_activities')return (await db.query(`SELECT * FROM learning_activities WHERE course_id=$1 ORDER BY created_at DESC`,[scope.courseId])).rows
  if(method==='list_reviews')return (await db.query(`SELECT e.*,a.learner_id,a.activity_id FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id WHERE a.course_id=$1 AND e.status='pending' ORDER BY e.created_at LIMIT 100`,[scope.courseId])).rows
  if(method==='list_rooms')return (await db.query(`SELECT c.id AS conversation_id,c.title,r.purpose,(r.course_id=$1) AS bound
    FROM conversations c JOIN learning_courses lc ON lc.project_id=c.project_id AND lc.company_id=c.company_id AND lc.id=$1
    LEFT JOIN learning_course_rooms r ON r.conversation_id=c.id
    WHERE c.kind='group' AND NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr WHERE tr.conversation_id=c.id)
      AND (r.course_id IS NULL OR r.course_id=$1) ORDER BY c.updated_at DESC LIMIT 100`,[scope.courseId])).rows
  if(method==='get_digest_schedule')return digestSchedule(scope,db)
  if(!scope.teacherId)throw new Error('teacher management action requires a teacher trigger')
  if(method==='draft_objectives'){
    const values=Array.isArray(args.objectives)?args.objectives.map(object).map((item)=>{
      const prerequisites=item.prerequisiteIds??item.prerequisite_ids
      return {title:textArg(item,'title'),successCriteria:textArg(item,'successCriteria','success_criteria'),targetLevel:Number(item.targetLevel??item.target_level??3),prerequisiteIds:Array.isArray(prerequisites)?prerequisites.map(String):[]}
    }):[]
    return createObjectives({courseId:scope.courseId,actorId:scope.teacherId,actorKind:'teacher',objectives:values},db)
  }
  if(method==='draft_activity'){
    const objectiveIds=args.objectiveIds??args.objective_ids
    return draftActivity({courseId:scope.courseId,actorId:scope.teacherId,title:textArg(args,'title'),instructions:textArg(args,'instructions'),type:textArg(args,'type') as LearningActivityType,evaluationMode:(optionalText(args,'evaluationMode','evaluation_mode')??'teacher_required') as LearningEvaluationMode,targetLevel:Number(args.targetLevel??args.target_level??2),rubric:Array.isArray(args.rubric)?args.rubric:[],objectiveIds:Array.isArray(objectiveIds)?objectiveIds.map(String):[],...(optionalText(args,'dueAt','due_at')?{dueAt:optionalText(args,'dueAt','due_at')}:{})},db)
  }
  if(method==='update_course'){const title=optionalText(args,'title');const description=optionalText(args,'description');if(!title&&!description)throw new Error('title or description is required');const {rows}=await db.query(`UPDATE learning_courses SET title=COALESCE($2,title),description=COALESCE($3,description),updated_at=NOW() WHERE id=$1 RETURNING *`,[scope.courseId,title??null,description??null]);return rows[0]}
  if(method==='set_learner_membership'){await setCourseMembership({courseId:scope.courseId,teacherId:scope.teacherId,userId:textArg(args,'userId','user_id'),role:'learner',enabled:boolArg(args)},db);return {ok:true}}
  if(method==='set_room_binding'){const conversationId=textArg(args,'conversationId','conversation_id');const purpose=optionalText(args,'purpose');if(args.enabled===false||!purpose){await db.query(`DELETE FROM learning_course_rooms WHERE course_id=$1 AND conversation_id=$2`,[scope.courseId,conversationId]);return {ok:true,enabled:false}};await bindCourseRoom({courseId:scope.courseId,teacherId:scope.teacherId,conversationId,purpose:purpose as LearningRoomPurpose},db);return {ok:true,enabled:true}}
  if(method==='configure_digest')return configureDigest(scope,args,db)
  if(method==='publish_objective'){await setObjectiveStatus(scope.courseId,textArg(args,'objectiveId','objective_id'),scope.teacherId,'published',db);return {ok:true}}
  if(method==='archive_objective'){await setObjectiveStatus(scope.courseId,textArg(args,'objectiveId','objective_id'),scope.teacherId,'archived',db);return {ok:true}}
  if(method==='publish_activity'){await publishActivity(scope.courseId,textArg(args,'activityId','activity_id'),scope.teacherId,db);return {ok:true}}
  if(method==='close_activity'){await closeActivity(scope.courseId,textArg(args,'activityId','activity_id'),scope.teacherId,db);return {ok:true}}
  if(method==='set_course_status'){
    const status=textArg(args,'status')
    if(!['active','archived'].includes(status))throw new Error('status must be active or archived')
    if(scope.courseStatus==='archived'&&status==='active')throw new Error('archived courses cannot be reactivated; create the next course instead')
    const {rows}=await db.query(`UPDATE learning_courses SET status=$2,updated_at=NOW(),archived_at=CASE WHEN $2='archived' THEN NOW() ELSE archived_at END WHERE id=$1 RETURNING *`,[scope.courseId,status])
    if(status==='archived')await closeTeacherRoomForCourse(scope.courseId,db)
    return rows[0]
  }
  if(method==='set_teacher_membership'){const userId=textArg(args,'userId','user_id');const enabled=boolArg(args);if(!enabled){const {rows}=await db.query<{count:number}>(`SELECT COUNT(*)::int AS count FROM learning_course_memberships WHERE course_id=$1 AND role='teacher'`,[scope.courseId]);if(Number(rows[0]?.count)<=1)throw new Error('cannot remove the final course teacher')};await setCourseMembership({courseId:scope.courseId,teacherId:scope.teacherId,userId,role:'teacher',enabled},db);return {ok:true}}
  if(method==='review_evaluation'||method==='override_mastery'){await reviewEvaluation({courseId:scope.courseId,evaluationId:textArg(args,'evaluationId','evaluation_id'),teacherId:scope.teacherId,decision:method==='override_mastery'?'accept':optionalText(args,'decision')==='reject'?'reject':'accept',reason:textArg(args,'reason'),...(args.overrideLevel!==undefined||args.override_level!==undefined?{overrideLevel:Number(args.overrideLevel??args.override_level)}:{})},db);return {ok:true}}
  throw new Error(`unsupported teacher action: ${method}`)
}
