import type { LearningActivity, LearningCourse, LearningDashboard, LearningObjective, TeacherAgentSummary } from '@/types'
import { useMessages } from '@/stores/messages'
import { MOCK_TEACHER_ROOM_ID } from './mockLearningImFixtures'

// Development-only in-memory implementation of the production
// /api/learning/* contract. Every fixture below has a durable production table
// and route; this file does not introduce preview-only capabilities.
const now = new Date()
const iso = (dayOffset: number, hour = 19, minute = 0) => {
  const value = new Date(now)
  value.setDate(value.getDate() + dayOffset)
  value.setHours(hour, minute, 0, 0)
  return value.toISOString()
}

const courseId = 'mock-course-linear-algebra'

let teacherAgent:TeacherAgentSummary={
  agentId:'mock-pulse-research',displayName:'Pulse · 研究实验室',projectId:'mock-research',courseId,
  roomId:MOCK_TEACHER_ROOM_ID,roomStatus:'active',pendingApprovals:1,
  digest:{frequency:'weekly',weekday:'monday',localTime:'08:30',timezone:'Asia/Shanghai',status:'active',nextRunAt:iso(5,8,30)},
}

let course: LearningCourse = {
  id: courseId,
  companyId: 'mock-workspace',
  projectId: 'mock-research',
  title: '线性代数：从概念到迁移项目',
  description: '通过清晰的学习任务、分层练习、证据评价和间隔复习掌握线性代数。',
  status: 'active',
  roles: ['teacher', 'learner'],
  roomCount: 2,
  objectiveCount: 4,
  learnerCount: 2,
  createdAt: iso(-28),
  updatedAt: iso(0),
}

let objectives: LearningObjective[] = [
  { id: 'obj-vector-space', courseId, title: '向量空间与子空间', successCriteria: '能独立判断一个集合是否构成子空间，并逐条验证封闭性。', targetLevel: 3, position: 1, status: 'published', prerequisiteIds: [] },
  { id: 'obj-linear-map', courseId, title: '线性变换与矩阵表示', successCriteria: '能在不同基下写出线性变换矩阵并解释每一列的含义。', targetLevel: 3, position: 2, status: 'published', prerequisiteIds: ['obj-vector-space'] },
  { id: 'obj-eigen', courseId, title: '特征值、特征向量与对角化', successCriteria: '能判断可对角化条件，并用特征分解解释重复应用的长期行为。', targetLevel: 3, position: 3, status: 'published', prerequisiteIds: ['obj-linear-map'] },
  { id: 'obj-transfer', courseId, title: '迁移：用谱方法分析真实系统', successCriteria: '能把特征分解迁移到一个新数据或动力系统，并说明模型限制。', targetLevel: 4, position: 4, status: 'draft', prerequisiteIds: ['obj-eigen'] },
]

let activities: LearningActivity[] = [
  { id: 'activity-subspace', courseId, title: '子空间判断：三组反例', instructions: '逐组判断是否为子空间；每个结论必须给出封闭性证据或反例。', type: 'practice', status: 'published', evaluationMode: 'agent_formative', targetLevel: 3, rubric: [{ criterion: '封闭性验证' }, { criterion: '反例有效性' }], objectiveIds: ['obj-vector-space'], dueAt: iso(0) },
  { id: 'activity-change-basis', courseId, title: '换基与矩阵表示检查', instructions: '在两组基下写出同一线性变换的矩阵，并用一个向量验证结果一致。', type: 'assessment', status: 'published', evaluationMode: 'teacher_required', targetLevel: 3, rubric: [{ criterion: '换基过程' }, { criterion: '独立验证' }], objectiveIds: ['obj-linear-map'], dueAt: iso(2) },
  { id: 'activity-markov', courseId, title: '迁移项目：马尔可夫链长期状态', instructions: '选择一个新的转移矩阵，用谱分解解释长期状态并讨论假设。', type: 'project', status: 'draft', evaluationMode: 'teacher_required', targetLevel: 4, rubric: [{ criterion: '迁移情境' }, { criterion: '谱方法' }, { criterion: '限制反思' }], objectiveIds: ['obj-transfer'], dueAt: iso(14) },
  { id: 'activity-recall', courseId, title: '向量空间间隔复习', instructions: '不看笔记，解释子空间判定的三个条件并各举一例。', type: 'review', status: 'closed', evaluationMode: 'agent_formative', targetLevel: 2, rubric: [{ criterion: '准确回忆' }], objectiveIds: ['obj-vector-space'] },
]

let missions = [{
  id: 'mission-diagonalization', courseId, learnerId: 'mock-me', conversationId: 'mock-study-room',
  triggerClientMsgNo: 'mock-study-goal', goal: '本周能独立判断矩阵是否可对角化，并完成一次新情境迁移',
  successCriteria: '两道不同活动独立完成达到 L3；迁移项目由教师确认后达到 L4。',missionKind:'study',coordinatorAgentId:'mock-nova',coordinatorName:'Nova', status: 'active',
  steps: [
    { id: 'step-learn', type: 'learn', description: '用几何语言解释特征向量与不变方向', successCriteria: '能给出定义、图像直觉和一个反例', status: 'completed', position: 0, outcome: 'Sage 的概念检查通过',completionReportId:'mock-report-sage' },
    { id: 'step-practice', type: 'practice', description: '完成三类矩阵的可对角化判断', successCriteria: '每题写出代数重数与几何重数', status: 'in_progress', position: 1 },
    { id: 'step-check', type: 'check', description: '独立完成换基考核', successCriteria: '无提示完成并用向量回代验证', status: 'open', position: 2 },
    { id: 'step-reflect', type: 'reflect', description: '总结判断流程和最容易混淆的条件', successCriteria: '写出可复用检查清单与一个错因', status: 'open', position: 3 },
  ], createdAt: iso(-2), updatedAt: iso(0),
},{id:'mission-markov-project',courseId,learnerId:'mock-me',conversationId:'mock-lab-room',triggerClientMsgNo:'mock-lab-goal',goal:'完成马尔可夫链迁移项目',successCriteria:'实验可复现并经独立验证',missionKind:'project',coordinatorAgentId:'mock-forge',coordinatorName:'Forge',status:'active',steps:[
  {id:'step-project-build',type:'practice',description:'构造新转移矩阵并运行可复现实验',successCriteria:'提交矩阵、代码、输出与误差',status:'completed',position:0,outcome:'Forge 报告已提交',completionReportId:'mock-report-forge'},
  {id:'step-project-check',type:'check',description:'由独立复核角色检查反例和适用条件',successCriteria:'Trace 提交复核结论与反证检查',status:'completed',position:1,outcome:'Trace 支持局部结论并限定适用范围',completionReportId:'mock-report-trace'},
  {id:'step-project-reflect',type:'reflect',description:'说明该方法不能迁移到哪些周期链',successCriteria:'保留至少一个反例和修正后的结论',status:'in_progress',position:2},
],createdAt:iso(-2),updatedAt:iso(0)},
{id:'mission-source-reading',courseId,learnerId:'mock-me',conversationId:'mock-discussion-room',triggerClientMsgNo:'mock-reading-goal',goal:'核对教材中的可对角化条件',successCriteria:'来源、推断与反例分开记录',missionKind:'research',coordinatorAgentId:'mock-scout',coordinatorName:'Scout',status:'active',steps:[
  {id:'step-research-read',type:'learn',description:'定位教材原始命题及前置条件',successCriteria:'记录来源位置，不把推断写成原文',status:'completed',position:0,outcome:'Scout 来源报告已提交',completionReportId:'mock-report-scout'},
  {id:'step-research-check',type:'check',description:'检查不可约、非周期条件是否被遗漏',successCriteria:'列出支持证据和一个反例',status:'in_progress',position:1},
  {id:'step-research-reflect',type:'reflect',description:'整理来源、推断和未知项',successCriteria:'三类内容分栏且引用可追溯',status:'open',position:2},
],createdAt:iso(-3),updatedAt:iso(-1)}]

let evidence: Array<Record<string, unknown>> = [
  { id: 'attempt-3', activity_id: 'activity-change-basis', learner_id: 'mock-me', assistance: 'none', demonstrated_level: 3, feedback: '换基矩阵正确；回代验证完整。由于这是考核活动，当前进入教师审核队列。', confidence: 0.91, status: 'pending', created_at: iso(-1, 20) },
  { id: 'attempt-2', activity_id: 'activity-subspace', learner_id: 'mock-me', assistance: 'none', demonstrated_level: 3, feedback: '第二个独立活动证据成立，向量空间目标达到 L3。', confidence: 0.88, status: 'accepted', created_at: iso(-4, 19) },
  { id: 'attempt-1', activity_id: 'activity-subspace', learner_id: 'mock-me', assistance: 'hint', demonstrated_level: 2, feedback: '在提示下找到加法封闭性的反例；提示证据最高支持 L2。', confidence: 0.82, status: 'accepted', created_at: iso(-8, 18) },
]

let reviews: Array<Record<string, unknown>> = [
  { id: 'evaluation-change-basis', attempt_id: 'attempt-3', learner_id: 'mock-me', activity_title: '换基与矩阵表示检查', demonstrated_level: 3, confidence: 0.91, feedback: '独立完成且验证充分，等待教师确认考核结果。',source_report_id:'mock-report-forge',verifier_report_id:'mock-report-trace',builder_agent_id:'mock-forge',verifier_agent_id:'mock-trace',verifier_verdict:'supported',status: 'pending' },
  { id: 'evaluation-transfer', attempt_id: 'attempt-transfer', learner_id: 'mock-learner-2', activity_title: '迁移项目：马尔可夫链长期状态', demonstrated_level: 4, confidence: 0.86, feedback: '具备迁移证据，但 L4 必须由教师确认。',source_report_id:'mock-report-forge',verifier_report_id:null,builder_agent_id:'mock-forge',verifier_agent_id:null,verifier_verdict:null,status: 'pending' },
]

const progress = [
  { user_id: 'mock-me', display_name: '林曦', email: 'dev@localhost', attempts: 3, due_objectives: 2, average_level: 2.25 },
  { user_id: 'mock-learner-2', display_name: '陈默', email: 'chenmo@localhost', attempts: 5, due_objectives: 1, average_level: 2.75 },
]

let preferences: Record<string, unknown> = {
  course_id: courseId, in_app_enabled: true, push_enabled: false, email_enabled: false,
  timezone: 'Asia/Shanghai', preferred_time: '19:00', quiet_start: '22:00', quiet_end: '08:00',
}

const deliveries = [
  { id: 'delivery-1', kind: 'review_due', channel: 'in_app', status: 'sent', digest_date: iso(0).slice(0, 10), sent_at: iso(0, 9) },
  { id: 'delivery-2', kind: 'teacher_review', channel: 'in_app', status: 'sent', digest_date: iso(-1).slice(0, 10), sent_at: iso(-1, 19) },
  { id: 'delivery-3', kind: 'review_due', channel: 'email', status: 'failed', digest_date: iso(-2).slice(0, 10), last_error: 'email not subscribed' },
]

function dashboard(): LearningDashboard {
  return {
    courses: [course],
    due: [
      { course_id: courseId, objective_id: 'obj-eigen', title: '特征值、特征向量与对角化', level: 1, status: 'learning', next_review_at: iso(0, 9) },
      { course_id: courseId, objective_id: 'obj-linear-map', title: '线性变换与矩阵表示', level: 2, status: 'needs_review', next_review_at: iso(0, 9) },
    ],
    mastery: [
      { course_id: courseId, objective_id: 'obj-vector-space', title: '向量空间与子空间', level: 3, status: 'verified', next_review_at: iso(7), review_interval_days: 7 },
      { course_id: courseId, objective_id: 'obj-linear-map', title: '线性变换与矩阵表示', level: 2, status: 'needs_review', next_review_at: iso(0), review_interval_days: 3 },
      { course_id: courseId, objective_id: 'obj-eigen', title: '特征值、特征向量与对角化', level: 1, status: 'learning', next_review_at: iso(0), review_interval_days: 1 },
      { course_id: courseId, objective_id: 'obj-transfer', title: '迁移：用谱方法分析真实系统', level: 0, status: 'learning', next_review_at: null, review_interval_days: 1 },
    ],
    pendingReviews: reviews.length,
  }
}

function body(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== 'string' || !init.body) return {}
  return JSON.parse(init.body) as Record<string, unknown>
}

export async function mockLearningHttp<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase()
  const url = new URL(path, 'http://mock.local')
  const parts = url.pathname.split('/').filter(Boolean)
  const data = body(init)
  let result: unknown

  if (method === 'GET' && url.pathname === '/learning/dashboard') result = dashboard()
  else if(method==='POST'&&parts[0]==='im'&&parts[1]==='approvals'&&parts[2]==='mock-pulse-publish'&&parts[3]==='resolve'){
    const approved=data.approved===true
    teacherAgent={...teacherAgent,pendingApprovals:0}
    if(approved)objectives=objectives.map((item)=>item.id==='obj-transfer'?{...item,status:'published'}:item)
    useMessages.setState((state)=>({byConvo:{...state.byConvo,[MOCK_TEACHER_ROOM_ID]:(state.byConvo[MOCK_TEACHER_ROOM_ID]??[]).map((message)=>message.approval?.id==='mock-pulse-publish'?{...message,approval:{...message.approval,status:approved?'approved':'rejected',resolvedAt:new Date().toISOString(),resolvedBy:'mock-me'}}:message)}}))
    result={ok:true,approved,result:approved?{ok:true}:undefined,error:null}
  }
  else if (method === 'GET' && url.pathname === '/learning/courses') result = [course]
  else if (method === 'POST' && url.pathname === '/learning/courses') {
    course = { ...course, id: `mock-course-${Date.now()}`, projectId: String(data.projectId), title: String(data.title), description: String(data.description ?? ''), roles: data.roles as LearningCourse['roles'], status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    result = course
  } else if (parts[0] === 'learning' && parts[1] === 'courses' && parts[2] === course.id) {
    if (method === 'PATCH' && parts.length === 3) { course = { ...course, ...data, updatedAt: new Date().toISOString() } as LearningCourse; result = course }
    else if(method==='GET'&&parts[3]==='teacher-agent')result=teacherAgent
    else if (method === 'GET' && parts[3] === 'objectives') result = objectives
    else if (method === 'POST' && parts[3] === 'objectives' && parts.length === 4) {
      const created = (data.objectives as Array<Record<string, unknown>>).map((item, index): LearningObjective => ({ id: `mock-objective-${Date.now()}-${index}`, courseId, title: String(item.title), successCriteria: String(item.successCriteria), targetLevel: Number(item.targetLevel ?? 3) as 1 | 2 | 3 | 4, position: objectives.length + index + 1, status: 'draft', prerequisiteIds: (item.prerequisiteIds as string[] | undefined) ?? [] }))
      objectives = [...objectives, ...created]; course = { ...course, objectiveCount: objectives.length }; result = created
    } else if (method === 'POST' && parts[3] === 'objectives' && parts[5] === 'status') {
      objectives = objectives.map((item) => item.id === parts[4] ? { ...item, status: String(data.status) as LearningObjective['status'] } : item); result = { ok: true }
    } else if (method === 'GET' && parts[3] === 'activities') result = activities
    else if (method === 'POST' && parts[3] === 'activities' && parts.length === 4) {
      const created: LearningActivity = { ...(data as unknown as Omit<LearningActivity, 'id' | 'courseId' | 'status'>), id: `mock-activity-${Date.now()}`, courseId, status: 'draft' }
      activities = [created, ...activities]; result = created
    } else if (method === 'POST' && parts[3] === 'activities' && parts[5] === 'publish') {
      activities = activities.map((item) => item.id === parts[4] ? { ...item, status: 'published' } : item); result = { ok: true }
    } else if (method === 'POST' && parts[3] === 'activities' && parts[5] === 'close') {
      activities = activities.map((item) => item.id === parts[4] ? { ...item, status: 'closed' } : item); result = { ok: true }
    } else if (method === 'POST' && parts[3] === 'activities' && parts[5] === 'submit') {
      const id = `mock-attempt-${Date.now()}`
      evidence = [{ id, activity_id: parts[4], learner_id: 'mock-me', assistance: data.assistance ?? 'none', demonstrated_level: null, feedback: null, status: 'pending', created_at: new Date().toISOString() }, ...evidence]
      result = { attemptId: id }
    } else if (method === 'GET' && parts[3] === 'missions') result = missions
    else if(method==='PATCH'&&parts[3]==='missions'&&parts[5]==='coordinator') { missions=missions.map((mission)=>mission.id===parts[4]?{...mission,coordinatorAgentId:String(data.agentId),coordinatorName:String(data.agentId).replace('mock-','')}:mission);result=missions.find((mission)=>mission.id===parts[4]) }
    else if (method === 'GET' && parts[3] === 'evidence') result = evidence
    else if (method === 'GET' && parts[3] === 'reviews') result = reviews
    else if (method === 'GET' && parts[3] === 'progress') result = progress
    else if (method === 'POST' && parts[3] === 'reviews' && parts.length === 5) {
      reviews = reviews.filter((item) => item.id !== parts[4]); result = { ok: true, decision: data.decision }
    } else if (method === 'PUT' && (parts[3] === 'rooms' || parts[3] === 'members')) result = { ok: true }
  } else if (method === 'GET' && url.pathname === '/learning/notification-preferences') result = preferences
  else if (method === 'PUT' && url.pathname === '/learning/notification-preferences') {
    preferences = { ...preferences, course_id: data.courseId ?? courseId, in_app_enabled: data.inAppEnabled, push_enabled: data.pushEnabled, email_enabled: data.emailEnabled, timezone: data.timezone, preferred_time: data.preferredTime, quiet_start: data.quietStart ?? null, quiet_end: data.quietEnd ?? null }
    result = preferences
  } else if (method === 'GET' && url.pathname === '/learning/deliveries') result = deliveries

  if (result === undefined) throw new Error(`mock learning route is not implemented because no matching production route exists: ${method} ${path}`)
  await Promise.resolve()
  return result as T
}
