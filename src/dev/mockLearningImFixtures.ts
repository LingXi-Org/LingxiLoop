import type { AgentCapability, Conversation, Message, Participant } from '@/types'

export const MOCK_USER_ID = 'mock-me'
export const MOCK_STUDY_ROOM_ID = 'mock-study-room'
export const MOCK_LAB_ROOM_ID = 'mock-learning-lab'
export const MOCK_DISCUSSION_ROOM_ID = 'mock-course-discussion'
export const MOCK_LEARNING_CANVAS_ID = 'mock-learning-canvas'
export const MOCK_TEACHER_ROOM_ID = 'mock-teacher-room-linear-algebra'
export const MOCK_PULSE_ID = 'mock-pulse-research'

const now = new Date()
export const isoMinutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()
const timeMinutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)
  .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })

const capabilityByAgent:Record<'nova'|'sage'|'milo'|'trace'|'scout'|'forge',AgentCapability[]>={
  nova:['canvas','knowledge','learning'],sage:['canvas','knowledge','learning'],milo:['canvas','knowledge','learning'],trace:['canvas','knowledge','learning'],
  scout:['canvas','web','documents','files','knowledge','learning'],forge:['canvas','documents','files','learning'],
}

export const learningParticipants: Participant[] = [
  {
    id: MOCK_USER_ID, kind: 'human', name: '林曦', initial: '林',
    avatarBg: 'linear-gradient(135deg, #60a5fa, #2563eb)', status: 'avail',
    bio: 'LingxiLoop 本地学习者', email: 'dev@localhost',
  },
  {
    id: 'mock-nova', kind: 'agent', name: 'Nova', role: '学习协调与规划 · Learning Coordinator', initial: 'N',
    avatarBg: 'linear-gradient(135deg, #a78bfa, #7c3aed)', status: 'working', statusUpdatedAt: isoMinutesAgo(1),
    bio: '维护 Mission 任务板，协调专业角色并汇总经过复核的结论。', tools: ['ipython'], capabilities:capabilityByAgent.nova,
  },
  {
    id: 'mock-sage', kind: 'agent', name: 'Sage', role: '概念导师 · Concept Tutor', initial: 'S',
    avatarBg: 'linear-gradient(135deg, #fb923c, #ea580c)', status: 'avail',
    bio: '从诊断问题出发，连接直觉、定义、例子与反例。', tools: ['ipython'], capabilities:capabilityByAgent.sage,
  },
  {
    id: 'mock-milo', kind: 'agent', name: 'Milo', role: '解题陪练 · Problem Coach', initial: 'M',
    avatarBg: 'linear-gradient(135deg, #2dd4bf, #0f766e)', status: 'working', statusUpdatedAt: isoMinutesAgo(2),
    bio: '用最小提示、独立检查和变式练习建立可迁移能力。', tools: ['ipython'], capabilities:capabilityByAgent.milo,
  },
  {
    id: 'mock-trace', kind: 'agent', name: 'Trace', role: '错因诊断 · Learning Diagnostician', initial: 'T',
    avatarBg: 'linear-gradient(135deg, #f87171, #b91c1c)', status: 'thinking', statusUpdatedAt: isoMinutesAgo(1),
    bio: '独立复核学习证据，寻找反例并给出校准后的诊断。', tools: ['ipython'], capabilities:capabilityByAgent.trace,
  },
  {
    id: 'mock-scout', kind: 'agent', name: 'Scout', role: '阅读研究 · Research Guide', initial: 'S',
    avatarBg: 'linear-gradient(135deg, #60a5fa, #1d4ed8)', status: 'avail',
    bio: '阅读真实资料，区分检索事实、推断与不确定性。', tools: ['ipython'], capabilities:capabilityByAgent.scout,
  },
  {
    id: 'mock-forge', kind: 'agent', name: 'Forge', role: '实践导师 · Practice Mentor', initial: 'F',
    avatarBg: 'linear-gradient(135deg, #4ade80, #15803d)', status: 'working', statusUpdatedAt: isoMinutesAgo(2),
    bio: '用可复现实验和项目验证理解并形成迁移证据。', tools: ['ipython'], capabilities:capabilityByAgent.forge,
  },
  {
    id:MOCK_PULSE_ID,kind:'agent',name:'Pulse · 研究实验室',role:'教学运营与学情汇总 · Teacher Operations',initial:'P',
    avatarBg:'linear-gradient(135deg, #8b5cf6, #5b21b6)',status:'waiting',bio:'Project 级教师专用智能体；聚合学情并将关键管理操作提交审批。',
    tools:['ipython'],capabilities:['teacher_admin'],managed:true,projectId:'mock-research',presetKey:'teacher-agent:mock-research',email:null,
  },
]

export const learningConversations: Conversation[] = [
  {
    id: MOCK_STUDY_ROOM_ID, kind: 'group', title: 'Study Room｜学习室', subtitle: 'Nova、Sage、Milo、Trace',
    topic: '线性代数课程 · study', members: [MOCK_USER_ID, 'mock-nova', 'mock-sage', 'mock-milo', 'mock-trace'],
    leaderId: 'mock-nova', pinned: true, unread: 1, lastAt: timeMinutesAgo(1), lastAtIso: isoMinutesAgo(1),
    preview: 'Nova：Mission 已通过规划门，正在执行 2/4。', tag: 'team',
  },
  {
    id: MOCK_LAB_ROOM_ID, kind: 'group', title: 'Lab｜实践工坊', subtitle: 'Forge、Scout、Sage',
    topic: '线性代数迁移项目 · lab', members: [MOCK_USER_ID, 'mock-forge', 'mock-scout', 'mock-sage'],
    leaderId: 'mock-forge', pinned: true, unread: 0, lastAt: timeMinutesAgo(12), lastAtIso: isoMinutesAgo(12),
    preview: 'Forge：迁移项目 Canvas 已汇聚实验和来源报告。', tag: 'team',
  },
  {
    id: MOCK_DISCUSSION_ROOM_ID, kind: 'group', title: '线性代数课程讨论', subtitle: '课程成员与教学智能体',
    topic: '课程问答与资料讨论 · discussion', members: [MOCK_USER_ID, 'mock-nova', 'mock-sage', 'mock-scout', 'mock-trace'],
    leaderId: 'mock-sage', pinned: false, unread: 0, lastAt: timeMinutesAgo(46), lastAtIso: isoMinutesAgo(46),
    preview: 'Scout：教材结论与课程量规已经对齐。', tag: 'team',
  },
  {
    id: 'mock-nova-learning-dm', kind: 'direct', title: 'Nova', subtitle: '学习协调与规划',
    members: [MOCK_USER_ID, 'mock-nova'], leaderId: 'mock-nova', unread: 0,
    lastAt: timeMinutesAgo(90), lastAtIso: isoMinutesAgo(90), preview: '今晚只安排一次 8 分钟复习。', tag: 'human',
  },
  {
    id:MOCK_TEACHER_ROOM_ID,kind:'group',title:'教师室｜线性代数：从概念到迁移项目',subtitle:'teachers · 1',
    topic:'课程管理、学情汇总与教师审批',members:[MOCK_USER_ID,MOCK_PULSE_ID],leaderId:MOCK_PULSE_ID,pinned:true,unread:1,
    lastAt:timeMinutesAgo(4),lastAtIso:isoMinutesAgo(4),preview:'Pulse：发布迁移目标需要教师确认。',tag:'teacher',
  },
]

function message(input: Message & { sequence: number }): Message { return input }

export const learningMessages: Record<string, Message[]> = {
  [MOCK_STUDY_ROOM_ID]: [
    message({ id: 'mock-study-goal', conversationId: MOCK_STUDY_ROOM_ID, authorId: MOCK_USER_ID, kind: 'text', body: '我想在本周真正掌握矩阵可对角化，并能用到一个新问题里。', at: timeMinutesAgo(36), createdAt: isoMinutesAgo(36), sequence: 1 }),
    message({ id: 'mock-study-plan', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-nova', kind: 'text', body: '我先只做规划：把目标拆成概念、练习、独立检查和反思四个可验证步骤；规划门通过后再让 Sage、Milo 和 Trace 分工。', at: timeMinutesAgo(34), createdAt: isoMinutesAgo(34), sequence: 2 }),
    message({ id: 'mock-study-mission-card', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-nova', kind: 'learning_mission', body: '本周能独立判断矩阵是否可对角化，并完成一次新情境迁移', at: timeMinutesAgo(33), createdAt: isoMinutesAgo(33), sequence: 3, learningMission: { missionId: 'mission-diagonalization', courseId: 'mock-course-linear-algebra', goal: '本周能独立判断矩阵是否可对角化，并完成一次新情境迁移', successCriteria: '两道不同活动独立完成达到 L3；迁移项目由教师确认后达到 L4。', status: 'active' } }),
    message({ id: 'mock-study-sage', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-sage', kind: 'text', body: '先做一个诊断：如果一个向量经过矩阵作用后方向不变，但长度可能变化，你会怎样用等式表达？', at: timeMinutesAgo(29), createdAt: isoMinutesAgo(29), sequence: 4 }),
    message({ id: 'mock-study-answer', conversationId: MOCK_STUDY_ROOM_ID, authorId: MOCK_USER_ID, kind: 'text', body: '应该是 Av=λv，其中 v 不能是零向量。', at: timeMinutesAgo(26), createdAt: isoMinutesAgo(26), sequence: 5 }),
    message({ id: 'mock-study-trace', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-trace', kind: 'text', body: '独立复核：定义准确；但这只支持“识别特征向量关系”，还不能证明可对角化。下一步要检查是否存在足够多线性无关的特征向量。', at: timeMinutesAgo(22), createdAt: isoMinutesAgo(22), sequence: 6 }),
  ],
  [MOCK_LAB_ROOM_ID]: [
    message({ id: 'mock-lab-request', conversationId: MOCK_LAB_ROOM_ID, authorId: MOCK_USER_ID, kind: 'text', body: '我想把对角化用到 Markov 链长期状态分析里，做成迁移项目。', at: timeMinutesAgo(24), createdAt: isoMinutesAgo(24), sequence: 1 }),
    message({ id: 'mock-lab-canvas', conversationId: MOCK_LAB_ROOM_ID, authorId: 'mock-forge', kind: 'canvas', body: '', at: timeMinutesAgo(20), createdAt: isoMinutesAgo(20), sequence: 2, canvas: { canvasId: MOCK_LEARNING_CANVAS_ID, title: '可对角化迁移项目', goal: '用可复现实验解释 Markov 链长期状态，并保留来源与验证证据。', status: 'completed', members: [
      { agentId: 'mock-forge', assignment: '实现并验证数值实验', color: '#15803d', status: 'completed' },
      { agentId: 'mock-scout', assignment: '核对教材来源与适用条件', color: '#1d4ed8', status: 'completed' },
      { agentId: 'mock-trace', assignment: '独立复核迁移结论', color: '#b91c1c', status: 'completed' },
    ], frameCount: 3 } }),
    message({ id: 'mock-lab-report', conversationId: MOCK_LAB_ROOM_ID, authorId: 'mock-forge', kind: 'text', body: 'Reporter 已汇聚 Scout、Forge 与 Trace 的结构化报告并保留周期链反例；L4 仍等待教师确认。', at: timeMinutesAgo(12), createdAt: isoMinutesAgo(12), sequence: 3 }),
  ],
  [MOCK_DISCUSSION_ROOM_ID]: [
    message({ id: 'mock-discussion-question', conversationId: MOCK_DISCUSSION_ROOM_ID, authorId: MOCK_USER_ID, kind: 'text', body: '“有 n 个特征值”是否就一定能对角化？', at: timeMinutesAgo(52), createdAt: isoMinutesAgo(52), sequence: 1 }),
    message({ id: 'mock-discussion-source', conversationId: MOCK_DISCUSSION_ROOM_ID, authorId: 'mock-scout', kind: 'text', body: '要区分“按代数重数计有 n 个根”和“有 n 个线性无关特征向量”。教材给出的充分必要条件是后者 [S1]。', citations: [{ sourceId: 'mock-linear-algebra-text', sourceTitle: '线性代数课程讲义：特征分解', chunkId: 'diagonalization-theorem', excerpt: 'n 阶矩阵可对角化，当且仅当存在 n 个线性无关的特征向量。', position: 1, marker: 'S1' }], at: timeMinutesAgo(46), createdAt: isoMinutesAgo(46), sequence: 2 }),
  ],
  'mock-nova-learning-dm': [
    message({ id: 'mock-nova-review', conversationId: 'mock-nova-learning-dm', authorId: 'mock-nova', kind: 'text', body: '你今天有两项目标到期。考虑安静时段，我把它们合并成一次 8 分钟复习；Lab 和私聊都不会自动创建 Mission。', at: timeMinutesAgo(90), createdAt: isoMinutesAgo(90), sequence: 1 }),
  ],
  [MOCK_TEACHER_ROOM_ID]: [
    message({id:'mock-pulse-welcome',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'system',body:'Pulse 已就绪：我可以汇总本课程学情、管理草稿与成员，并把关键变更提交给教师审批。',at:timeMinutesAgo(70),createdAt:isoMinutesAgo(70),sequence:1}),
    message({id:'mock-pulse-overview-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'汇总最近 30 天的班级学习情况，只列确定性关注原因。',at:timeMinutesAgo(45),createdAt:isoMinutesAgo(45),sequence:2}),
    message({id:'mock-pulse-overview',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'text',body:'观察\n- 2 名学习者，4 个目标；有证据学习者 2/2，共 8 次已验证尝试。\n- 掌握分布：L0 1、L1 1、L2 2、L3 3、L4 0。\n- Mission：active 3；到期复习 3；待审核 2。\n\n确定性关注名单\n- 林曦：due_review（2）、needs_review（1）\n- 陈默：due_review（1）、paused_mission（1）\n\n未读取任何原始答案。下一步可指定一名学习者钻取，或打开待审核队列。',at:timeMinutesAgo(42),createdAt:isoMinutesAgo(42),sequence:3}),
    message({id:'mock-pulse-learner-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'钻取陈默，但先不要读取原始答案。',at:timeMinutesAgo(30),createdAt:isoMinutesAgo(30),sequence:4}),
    message({id:'mock-pulse-learner',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'text',body:'陈默（learner_id=mock-learner-2）\n- 目标：2 项达到 L3，1 项 L2 needs_review。\n- Mission：1 active，1 paused；暂停原因来自持久化状态，不是风险推断。\n- 最近尝试：attempt-transfer（project，none，pending teacher review）；attempt-eigen-2（practice，none，accepted）。\n- 评价反馈摘要：迁移证据结构完整，但 L4 尚未教师确认。\n\n未调用 get_attempt，因此未读取原始作答。',at:timeMinutesAgo(28),createdAt:isoMinutesAgo(28),sequence:5}),
    message({id:'mock-pulse-publish-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'发布“迁移：用谱方法分析真实系统”目标。',at:timeMinutesAgo(6),createdAt:isoMinutesAgo(6),sequence:6}),
    message({id:'approval-mock-pulse-publish',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'approval',body:'Pulse · 研究实验室 请求教师确认：publish_objective',approval:{id:'mock-pulse-publish',agentId:MOCK_PULSE_ID,kind:'course_management',summary:'发布目标“迁移：用谱方法分析真实系统”',status:'pending',payload:{action:'teacher.publish_objective',args:{objectiveId:'obj-transfer'}},requestedAt:isoMinutesAgo(4),requestedBy:MOCK_USER_ID,scope:{projectId:'mock-research',courseId:'mock-course-linear-algebra',roomId:MOCK_TEACHER_ROOM_ID,risk:'course_management'},preview:{method:'publish_objective',entityId:'obj-transfer',currentState:'draft',nextState:'published'}},at:timeMinutesAgo(4),createdAt:isoMinutesAgo(4),sequence:7}),
  ],
}
