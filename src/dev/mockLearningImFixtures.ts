import type { AgentCapability, Conversation, ImReadReceiptAdvance, Message, Participant } from '@/types'

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
    id: 'mock-learner-2', kind: 'human', name: '陈默', initial: '陈',
    avatarBg: 'linear-gradient(135deg, #34d399, #047857)', status: 'avail',
    bio: '线性代数课程学习者', email: 'chenmo@localhost',
  },
  {
    id: 'mock-nova', kind: 'agent', name: 'Nova', role: '学习规划与协调', initial: 'N',
    avatarBg: 'linear-gradient(135deg, #a78bfa, #7c3aed)', status: 'working', statusUpdatedAt: isoMinutesAgo(1),
    bio: '维护学习任务板，协调专业角色并汇总经过复核的结论。', tools: ['ipython'], capabilities:capabilityByAgent.nova,
  },
  {
    id: 'mock-sage', kind: 'agent', name: 'Sage', role: '概念导师', initial: 'S',
    avatarBg: 'linear-gradient(135deg, #fb923c, #ea580c)', status: 'avail',
    bio: '从诊断问题出发，连接直觉、定义、例子与反例。', tools: ['ipython'], capabilities:capabilityByAgent.sage,
  },
  {
    id: 'mock-milo', kind: 'agent', name: 'Milo', role: '解题陪练', initial: 'M',
    avatarBg: 'linear-gradient(135deg, #2dd4bf, #0f766e)', status: 'working', statusUpdatedAt: isoMinutesAgo(2),
    bio: '用最小提示、独立检查和变式练习建立可迁移能力。', tools: ['ipython'], capabilities:capabilityByAgent.milo,
  },
  {
    id: 'mock-trace', kind: 'agent', name: 'Trace', role: '错因诊断与证据复核', initial: 'T',
    avatarBg: 'linear-gradient(135deg, #f87171, #b91c1c)', status: 'thinking', statusUpdatedAt: isoMinutesAgo(1),
    bio: '独立复核学习证据，寻找反例并给出校准后的诊断。', tools: ['ipython'], capabilities:capabilityByAgent.trace,
  },
  {
    id: 'mock-scout', kind: 'agent', name: 'Scout', role: '阅读与资料研究', initial: 'S',
    avatarBg: 'linear-gradient(135deg, #60a5fa, #1d4ed8)', status: 'avail',
    bio: '阅读真实资料，区分检索事实、推断与不确定性。', tools: ['ipython'], capabilities:capabilityByAgent.scout,
  },
  {
    id: 'mock-forge', kind: 'agent', name: 'Forge', role: '实践与项目导师', initial: 'F',
    avatarBg: 'linear-gradient(135deg, #4ade80, #15803d)', status: 'working', statusUpdatedAt: isoMinutesAgo(2),
    bio: '用可复现实验和项目验证理解并形成迁移证据。', tools: ['ipython'], capabilities:capabilityByAgent.forge,
  },
  {
    id:MOCK_PULSE_ID,kind:'agent',name:'Pulse · 研究实验室',role:'教学运营与学情汇总',initial:'P',
    avatarBg:'linear-gradient(135deg, #8b5cf6, #5b21b6)',status:'waiting',bio:'项目级教师专用智能体；汇总课程学情，并将关键管理操作提交教师审批。',
    tools:['ipython'],capabilities:['teacher_admin'],managed:true,projectId:'mock-research',presetKey:'teacher-agent:mock-research',email:null,
  },
]

export const learningConversations: Conversation[] = [
  {
    id: MOCK_STUDY_ROOM_ID, kind: 'group', title: '学习室｜线性代数', subtitle: 'Nova、Sage、Milo、Trace',
    topic: '线性代数课程学习', members: [MOCK_USER_ID, 'mock-nova', 'mock-sage', 'mock-milo', 'mock-trace'],
    leaderId: 'mock-nova', pinned: true, unread: 1, lastAt: timeMinutesAgo(1), lastAtIso: isoMinutesAgo(1),
    preview: 'Nova：学习任务已通过规划检查，正在执行第 2/4 步。', tag: 'team',
  },
  {
    id: MOCK_LAB_ROOM_ID, kind: 'group', title: '实践工坊｜迁移项目', subtitle: 'Forge、Scout、Sage',
    topic: '线性代数迁移项目', members: [MOCK_USER_ID, 'mock-forge', 'mock-scout', 'mock-sage'],
    leaderId: 'mock-forge', pinned: true, unread: 0, lastAt: timeMinutesAgo(12), lastAtIso: isoMinutesAgo(12),
    preview: 'Forge：迁移项目协作画布已汇聚实验与来源报告。', tag: 'team',
  },
  {
    id: MOCK_DISCUSSION_ROOM_ID, kind: 'group', title: '线性代数课程讨论', subtitle: '课程成员与教学智能体',
    topic: '课程问答与资料讨论', members: [MOCK_USER_ID, 'mock-nova', 'mock-sage', 'mock-scout', 'mock-trace'],
    leaderId: 'mock-sage', pinned: false, unread: 0, lastAt: timeMinutesAgo(46), lastAtIso: isoMinutesAgo(46),
    preview: 'Scout：教材结论与课程量规已经对齐。', tag: 'team',
  },
  {
    id: 'mock-nova-learning-dm', kind: 'direct', title: 'Nova', subtitle: '学习协调与规划',
    members: [MOCK_USER_ID, 'mock-nova'], leaderId: 'mock-nova', unread: 0,
    lastAt: timeMinutesAgo(90), lastAtIso: isoMinutesAgo(90), preview: '今晚只安排一次 8 分钟复习。', tag: 'human',
  },
  {
    id:MOCK_TEACHER_ROOM_ID,kind:'group',title:'教师室｜线性代数：从概念到迁移项目',subtitle:'教师 · 1',
    topic:'课程管理、学情汇总与教师审批',members:[MOCK_USER_ID,MOCK_PULSE_ID],leaderId:MOCK_PULSE_ID,pinned:true,unread:1,
    lastAt:timeMinutesAgo(6),lastAtIso:isoMinutesAgo(6),preview:'Pulse：发布迁移目标需要教师确认。',tag:'teacher',
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
    message({ id: 'mock-study-reasoning', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-sage', kind: 'thought', body: '先区分必要条件与充分条件，再用反例检查“有 n 个根”是否足够。', at: timeMinutesAgo(20), createdAt: isoMinutesAgo(20), sequence: 7 }),
    message({ id: 'mock-study-tool', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-scout', kind: 'tool', body: '', tool: { name: 'knowledge.search', arg: '可对角化 充分必要条件', status: 'completed', detail: '检索到 3 个课程知识片段，并完成来源去重。', icon: 'db' }, at: timeMinutesAgo(18), createdAt: isoMinutesAgo(18), sequence: 8 }),
    message({ id: 'mock-study-poll', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-nova', kind: 'poll', body: '', poll: { question: '下一步先练哪一种判断？', mode: 'single', options: [{ id: 'eigenvectors', text: '线性无关特征向量' }, { id: 'multiplicity', text: '代数/几何重数' }, { id: 'counterexample', text: '构造反例' }], expiresAt: null, closedAt: null, closedReason: null }, pollTallies: [{ optionId: 'eigenvectors', count: 2, voterIds: [MOCK_USER_ID, 'mock-sage'] }, { optionId: 'multiplicity', count: 1, voterIds: ['mock-trace'] }, { optionId: 'counterexample', count: 0, voterIds: [] }], at: timeMinutesAgo(16), createdAt: isoMinutesAgo(16), sequence: 9 }),
    message({ id: 'mock-study-handoff', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-nova', kind: 'handoff', body: '', handoff: { id: 'handoff-diagonalization', fromAgentId: 'mock-nova', toAgentId: 'mock-milo', title: '生成两道渐进练习', status: 'working', note: '保留一道 Jordan 块反例。', sharedPaths: ['course/linear-algebra/diagonalization.md'], browserTargets: [] }, at: timeMinutesAgo(14), createdAt: isoMinutesAgo(14), sequence: 10 }),
    message({ id: 'mock-study-image', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-milo', kind: 'attachment', body: '特征向量方向示意图', attachment: { name: 'eigenvector-map.png', kind: 'img', url: '/icon.png', mime: 'image/png', size: 18432 }, at: timeMinutesAgo(12), createdAt: isoMinutesAgo(12), sequence: 11 }),
    message({ id: 'mock-study-pdf', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-scout', kind: 'attachment', body: '', attachment: { name: 'diagonalization-notes.pdf', kind: 'pdf', url: '/mock/grok-preview.pdf', mime: 'application/pdf', size: 55296 }, at: timeMinutesAgo(11), createdAt: isoMinutesAgo(11), sequence: 12 }),
    message({ id: 'mock-study-mail-out', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-nova', kind: 'email', body: '本周学习摘要已经整理完毕，附件包含练习清单。', email: { subject: '线性代数本周学习摘要', from: 'nova@local.learning', to: ['dev@localhost'], cc: [], direction: 'out', transportStatus: 'sent' }, at: timeMinutesAgo(10), createdAt: isoMinutesAgo(10), sequence: 13 }),
    message({ id: 'mock-study-mail-in', conversationId: MOCK_STUDY_ROOM_ID, authorId: MOCK_USER_ID, kind: 'email', body: '收到，我会先完成反例练习。', email: { subject: 'Re: 线性代数本周学习摘要', from: 'dev@localhost', to: ['nova@local.learning'], cc: [], direction: 'in', transportStatus: 'received' }, at: timeMinutesAgo(9), createdAt: isoMinutesAgo(9), sequence: 14 }),
    message({ id: 'mock-study-code', conversationId: MOCK_STUDY_ROOM_ID, authorId: 'mock-milo', kind: 'text', body: '可以用下面的最小检查验证特征向量：\n```python\nimport numpy as np\nnp.allclose(A @ v, lam * v)\n```\n更多说明见 https://en.wikipedia.org/wiki/Diagonalizable_matrix', at: timeMinutesAgo(7), createdAt: isoMinutesAgo(7), sequence: 15 }),
  ],
  [MOCK_LAB_ROOM_ID]: [
    message({ id: 'mock-lab-request', conversationId: MOCK_LAB_ROOM_ID, authorId: MOCK_USER_ID, kind: 'text', body: '我想把对角化用到马尔可夫链长期状态分析里，做成迁移项目。', at: timeMinutesAgo(24), createdAt: isoMinutesAgo(24), sequence: 1 }),
    message({ id: 'mock-lab-canvas', conversationId: MOCK_LAB_ROOM_ID, authorId: 'mock-forge', kind: 'canvas', body: '', at: timeMinutesAgo(20), createdAt: isoMinutesAgo(20), sequence: 2, canvas: { canvasId: MOCK_LEARNING_CANVAS_ID, title: '可对角化迁移项目', goal: '用可复现实验解释马尔可夫链长期状态，并保留来源与验证证据。', status: 'completed', members: [
      { agentId: 'mock-forge', assignment: '实现并验证数值实验', color: '#15803d', status: 'completed' },
      { agentId: 'mock-scout', assignment: '核对教材来源与适用条件', color: '#1d4ed8', status: 'completed' },
      { agentId: 'mock-trace', assignment: '独立复核迁移结论', color: '#b91c1c', status: 'completed' },
    ], frameCount: 3 } }),
    message({ id: 'mock-lab-report', conversationId: MOCK_LAB_ROOM_ID, authorId: 'mock-forge', kind: 'text', body: '汇总角色已整合 Scout、Forge 与 Trace 的结构化报告，并保留周期链反例；等级 4 仍需教师确认。', at: timeMinutesAgo(12), createdAt: isoMinutesAgo(12), sequence: 3 }),
  ],
  [MOCK_DISCUSSION_ROOM_ID]: [
    message({ id: 'mock-discussion-question', conversationId: MOCK_DISCUSSION_ROOM_ID, authorId: MOCK_USER_ID, kind: 'text', body: '“有 n 个特征值”是否就一定能对角化？', at: timeMinutesAgo(52), createdAt: isoMinutesAgo(52), sequence: 1 }),
    message({ id: 'mock-discussion-source', conversationId: MOCK_DISCUSSION_ROOM_ID, authorId: 'mock-scout', kind: 'text', body: '要区分“按代数重数计有 n 个根”和“有 n 个线性无关特征向量”。教材给出的充分必要条件是后者 [S1]。', citations: [{ sourceId: 'mock-linear-algebra-text', sourceTitle: '线性代数课程讲义：特征分解', chunkId: 'diagonalization-theorem', excerpt: 'n 阶矩阵可对角化，当且仅当存在 n 个线性无关的特征向量。', position: 1, marker: 'S1' }], at: timeMinutesAgo(46), createdAt: isoMinutesAgo(46), sequence: 2 }),
  ],
  'mock-nova-learning-dm': [
    message({ id: 'mock-nova-review', conversationId: 'mock-nova-learning-dm', authorId: 'mock-nova', kind: 'text', body: '你今天有两项目标到期。考虑到安静时段，我把它们合并成一次 8 分钟复习；实践工坊和私聊都不会自动创建持续学习任务。', at: timeMinutesAgo(90), createdAt: isoMinutesAgo(90), sequence: 1 }),
  ],
  [MOCK_TEACHER_ROOM_ID]: [
    message({id:'mock-pulse-welcome',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'system',body:'Pulse 已就绪：我可以汇总本课程学情、管理草稿与成员，并把关键变更提交给教师审批。我不会进入学习室或联系学生。',at:timeMinutesAgo(110),createdAt:isoMinutesAgo(110),sequence:1}),
    message({id:'mock-pulse-overview-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'请汇总最近 30 天的班级学习情况，只列有明确数据依据的关注原因。',at:timeMinutesAgo(98),createdAt:isoMinutesAgo(98),sequence:2}),
    message({id:'mock-pulse-overview',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'text',body:'班级概览\n- 共有 2 名学习者、4 项学习目标；2 名学习者均已有有效证据，共记录 8 次已验证尝试。\n- 掌握分布：尚无证据 1 项、能识别或回忆 1 项、能在提示下完成 2 项、能独立完成 3 项、迁移应用 0 项。\n- 持续学习任务：3 项进行中；3 项复习已到期；2 项评价等待审核。\n\n需要关注\n- 林曦：2 项复习已到期，1 项新证据待复核。\n- 陈默：1 项复习已到期，1 项持续学习任务已暂停。\n\n以上原因全部来自已保存的课程状态，没有使用模型推测，也没有读取原始作答。你可以指定一名学生继续查看，或让我打开待审核队列。',at:timeMinutesAgo(95),createdAt:isoMinutesAgo(95),sequence:3}),
    message({id:'mock-pulse-learner-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'查看陈默的学习情况，但暂时不要读取他的原始作答。',at:timeMinutesAgo(82),createdAt:isoMinutesAgo(82),sequence:4}),
    message({id:'mock-pulse-learner',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'text',body:'陈默\n- 学习目标：2 项已能独立完成，1 项处于“提示下完成且新证据待复核”。\n- 持续学习任务：1 项进行中，1 项已暂停；暂停是系统中已保存的任务状态，不是风险推断。\n- 最近两次尝试：迁移项目作答等待教师审核；特征值练习已被采纳。\n- 评价摘要：迁移证据结构完整，但等级 4 必须由教师确认。\n\n本次只读取了尝试元数据与评价摘要，没有读取原始作答。',at:timeMinutesAgo(79),createdAt:isoMinutesAgo(79),sequence:5}),
    message({id:'mock-pulse-attempt-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'读取陈默那条迁移项目尝试的原始作答，我要核对结论。',at:timeMinutesAgo(68),createdAt:isoMinutesAgo(68),sequence:6}),
    message({id:'mock-pulse-attempt',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'text',body:'已读取指定的单条尝试，并写入证据访问审计。\n\n原始作答\n“我用三个不同初始分布重复迭代转移矩阵，结果都收敛到 [0.6, 0.4]。但二状态周期链没有极限，因此不能把这个结论推广到所有马尔可夫链。”\n\n记录编号：attempt-transfer · 提交方式：独立完成 · 当前状态：等待教师审核。',at:timeMinutesAgo(65),createdAt:isoMinutesAgo(65),sequence:7}),
    message({id:'mock-pulse-digest-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'以后每周一早上 8:30 在这个教师室发送班级摘要，使用上海时区。',at:timeMinutesAgo(52),createdAt:isoMinutesAgo(52),sequence:8}),
    message({id:'mock-pulse-digest',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'text',body:'定时摘要已直接配置完成。\n- 频率：每周一\n- 时间：08:30\n- 时区：Asia/Shanghai\n- 发送位置：当前共享教师室\n\n摘要只读取班级聚合数据，不读取原始答案，也不会发送给学生、推送或邮件。',at:timeMinutesAgo(49),createdAt:isoMinutesAgo(49),sequence:9}),
    message({id:'mock-pulse-draft-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'把马尔可夫链迁移项目整理成活动草稿，先不要发布。',at:timeMinutesAgo(33),createdAt:isoMinutesAgo(33),sequence:10}),
    message({id:'mock-pulse-draft',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'text',body:'活动草稿已保存：\n“迁移项目：马尔可夫链长期状态”\n\n目标等级为 L4，评价方式为教师审核；量规包含迁移情境、谱方法和限制反思。当前仍是草稿，没有向学生发布。',at:timeMinutesAgo(30),createdAt:isoMinutesAgo(30),sequence:11}),
    message({id:'mock-pulse-publish-request',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_USER_ID,kind:'text',body:'发布“迁移：用谱方法分析真实系统”这个学习目标。',at:timeMinutesAgo(8),createdAt:isoMinutesAgo(8),sequence:12}),
    message({id:'approval-mock-pulse-publish',conversationId:MOCK_TEACHER_ROOM_ID,authorId:MOCK_PULSE_ID,kind:'approval',body:'发布学习目标需要教师确认。',approval:{id:'mock-pulse-publish',agentId:MOCK_PULSE_ID,kind:'course_management',summary:'发布学习目标“迁移：用谱方法分析真实系统”',status:'pending',payload:{action:'teacher.publish_objective',args:{objectiveId:'obj-transfer'}},requestedAt:isoMinutesAgo(6),requestedBy:MOCK_USER_ID,scope:{projectId:'mock-research',courseId:'mock-course-linear-algebra',roomId:MOCK_TEACHER_ROOM_ID,risk:'course_management'},preview:{method:'publish_objective',entityId:'obj-transfer',entityLabel:'迁移：用谱方法分析真实系统',currentState:'draft',nextState:'published'}},at:timeMinutesAgo(6),createdAt:isoMinutesAgo(6),sequence:13}),
  ],
}

export const learningReadReceipts: Record<string, ImReadReceiptAdvance[]> = {
  [MOCK_STUDY_ROOM_ID]: [
    { channelId: MOCK_STUDY_ROOM_ID, readerId: 'mock-nova', previousReadSeq: 0, readThroughSeq: 14, readAt: isoMinutesAgo(5) },
    { channelId: MOCK_STUDY_ROOM_ID, readerId: 'mock-sage', previousReadSeq: 0, readThroughSeq: 13, readAt: isoMinutesAgo(4) },
    { channelId: MOCK_STUDY_ROOM_ID, readerId: 'mock-milo', previousReadSeq: 0, readThroughSeq: 12, readAt: isoMinutesAgo(3) },
  ],
  [MOCK_TEACHER_ROOM_ID]: [
    { channelId: MOCK_TEACHER_ROOM_ID, readerId: MOCK_PULSE_ID, previousReadSeq: 0, readThroughSeq: 12, readAt: isoMinutesAgo(5) },
  ],
}
