import { useParticipants } from '@/features/agents/state'
import type { CanvasFrame, CanvasSnapshot, CanvasWorkspaceSummary } from '@/features/canvas/contracts'
import { useCanvas } from '@/features/canvas/state'
import { type ActiveAgentRun, mergeCanonicalMessages, replaceMessageReactions, updateConversation, useChatThreadStore } from '@/features/chat/runtime/store'
import { messagesApi } from '@/features/chat/api'
import { lingxiIm } from '@/lib/im/wukong'
import { applyRunSnapshot } from '@/features/chat/runtime/run-updates'
import { useConversations } from '@/features/conversations/store'
import type { KnowledgeSource } from '@/features/knowledge/contracts'
import { useKnowledgeSources } from '@/features/knowledge/state'
import { useWorkspace } from '@/features/knowledge/workspace'
import { learningApi } from '@/features/learning/api'
import type {
  LearnerLearningOverview,
  LearningActivity,
  LearningDashboard,
  LearningEvidence,
  LearningMission,
  LearningObjective,
  LearningSpace,
} from '@/features/learning/contracts'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useSurface } from '@/stores/surface'
import { convertEnvelope } from '@/features/chat/runtime/converter'
import { createNativeMessage, userMessageSchema } from '@/lib/nativeMessage'
import type { AgentRunSnapshot } from '@/lib/agentRunSnapshot'
import { createRunView } from '@lyyzka/lingxios/ui'
import { harnessApi } from '@/features/chat/runtime/harness-api'
import type { Conversation, Participant, WorkspaceSummary } from '@/types'
import '@/styles/globals.css'
import { ws } from '@/api/core/realtime'
ws.connect = async () => undefined

const NOW = '2026-09-03T08:30:00.000Z'
const COMPANY_ID = 'company-audit'
const PROJECT_ID = 'workspace-personal'
const CONVERSATION_ID = 'conversation-research'
const CANVAS_ID = 'canvas-research'

const participants: Record<string, Participant> = {
  me: { id: 'me', kind: 'human', name: '林小溪', initial: '溪', avatarBg: '#7257d9', status: 'avail' },
  maya: { id: 'maya', kind: 'human', name: 'Maya', initial: 'M', avatarBg: '#0f766e', status: 'avail' },
  scout: { id: 'scout', kind: 'agent', name: '小研', role: 'researcher', initial: '研', avatarBg: '#f59f00', status: 'working', capabilities: ['canvas', 'web', 'knowledge'] },
  iris: { id: 'iris', kind: 'agent', name: '小绘', role: 'designer', initial: '绘', avatarBg: '#3b82f6', status: 'avail', capabilities: ['canvas', 'documents'] },
}

const workspaces: WorkspaceSummary[] = [
  { id: PROJECT_ID, companyId: COMPANY_ID, kind: 'TEACHING', planId: null, name: '我的学习', description: '个人学习与研究工作区', color: '#7257d9', status: 'ACTIVE', createdBy: 'me', isDefault: true, createdAt: NOW, updatedAt: NOW, archivedAt: null, lastVisitedAt: NOW, sourceCount: 3, conversationCount: 6, documentCount: 4, calendarEventCount: 2, canvasCount: 1, canManage: true },
  { id: 'workspace-product', companyId: COMPANY_ID, kind: 'TEACHING', planId: null, name: '产品设计营', description: '课程协作区', color: '#0f766e', status: 'ACTIVE', createdBy: 'me', isDefault: false, createdAt: NOW, updatedAt: NOW, archivedAt: null, lastVisitedAt: NOW, sourceCount: 8, conversationCount: 4, documentCount: 6, calendarEventCount: 3, canvasCount: 2, canManage: true },
  { id: 'workspace-systems', companyId: COMPANY_ID, kind: 'INSTITUTIONAL_COURSE', planId: null, name: '系统思考', description: '机构课程', color: '#d97706', status: 'ACTIVE', createdBy: 'maya', isDefault: false, createdAt: NOW, updatedAt: NOW, archivedAt: null, lastVisitedAt: NOW, sourceCount: 5, conversationCount: 3, documentCount: 2, calendarEventCount: 1, canvasCount: 1, canManage: false },
]

const conversations: Conversation[] = [
  { id: CONVERSATION_ID, kind: 'group', title: '产品研究协作', subtitle: 'Maya、小研、小绘', topic: '验证新用户的学习路径', members: ['me', 'maya', 'scout', 'iris'], leaderId: 'scout', pinned: true, unread: 7, lastMessageId: 'm6', lastAt: '10:28', lastAtIso: NOW, preview: '小研：我把访谈证据放进 Canvas 了', tag: 'team' },
  { id: 'conversation-design', kind: 'group', title: '设计评审', subtitle: '4 位成员', topic: '移动端方案评审', members: ['me', 'maya', 'iris'], leaderId: 'iris', pinned: true, muted: true, unread: 2, lastMessageId: 'd1', lastAt: '09:46', lastAtIso: '2026-09-03T07:46:00.000Z', preview: 'Maya：第二版的信息层级更清楚' },
  { id: 'conversation-scout', kind: 'direct', title: '小研', subtitle: '研究助教', members: ['me', 'scout'], leaderId: 'scout', unread: 1, lastMessageId: 's1', lastAt: '昨天', lastAtIso: '2026-09-02T12:00:00.000Z', preview: '新的证据摘要已经整理好', tag: 'fresh-pulled' },
  { id: 'conversation-maya', kind: 'direct', title: 'Maya', subtitle: '在线', members: ['me', 'maya'], leaderId: null, unread: 0, lastMessageId: 'ma1', lastAt: '昨天', lastAtIso: '2026-09-02T09:00:00.000Z', preview: '周四一起看原型吧', tag: 'human' },
  { id: 'conversation-learning', kind: 'group', title: '每周学习复盘', subtitle: '6 位成员', topic: '复盘与下一步', members: ['me', 'maya', 'scout'], leaderId: 'scout', muted: true, unread: 5, lastMessageId: 'l1', lastAt: '8/31', lastAtIso: '2026-08-31T09:00:00.000Z', preview: '本周完成了 3 个练习' },
  { id: 'conversation-notes', kind: 'direct', title: '稍后阅读', subtitle: '个人收藏', members: ['me', 'iris'], leaderId: 'iris', unread: 0, lastMessageId: 'n1', lastAt: '8/29', lastAtIso: '2026-08-29T09:00:00.000Z', preview: '无障碍移动导航模式' },
]

const frames: CanvasFrame[] = [
  { id: 'frame-findings', canvasId: CANVAS_ID, type: 'markdown', title: '关键研究结论', x: 80, y: 80, width: 430, height: 300, content: '# 三个高频障碍\n\n- 不知道从哪里开始\n- 资料与任务割裂\n- 缺少进度反馈', data: {}, revision: 2, createdBy: 'scout', updatedBy: 'scout', createdAt: NOW, updatedAt: NOW },
  { id: 'frame-flow', canvasId: CANVAS_ID, type: 'html', title: '移动端路径草图', x: 560, y: 120, width: 420, height: 290, content: '<main style="font-family:system-ui;padding:24px"><h1>学习路径</h1><p>工作区 → 会话 → 证据 → 下一步</p></main>', data: {}, revision: 1, createdBy: 'iris', updatedBy: 'iris', createdAt: NOW, updatedAt: NOW },
]

const canvas: CanvasSnapshot = {
  id: CANVAS_ID, title: '新用户学习路径', companyId: COMPANY_ID, conversationId: CONVERSATION_ID, triggerClientMsgNo: 'm3', goal: '把访谈证据转成可验证的学习路径', initiatorAgentId: 'scout', status: 'active', origin: 'conversation', summary: '三类障碍已归纳，正在验证移动路径。', createdBy: 'me', createdAt: NOW, updatedAt: NOW, frames,
  assignments: [
    { id: 'assignment-research', canvasId: CANVAS_ID, agentId: 'scout', assignment: '整理访谈证据并提炼判断', color: '#d97706', status: 'working', workArea: { x: 40, y: 40, width: 500, height: 360 }, activeFrameId: 'frame-findings', cursor: { x: 260, y: 180 }, workId: 'work-research', dependsOnAgentIds: [], executionRole: 'specialist', verifiesAssignmentId: null, result: null, error: null, startedAt: NOW, completedAt: null, updatedAt: NOW },
    { id: 'assignment-design', canvasId: CANVAS_ID, agentId: 'iris', assignment: '制作移动端路径草图', color: '#2563eb', status: 'completed', workArea: { x: 540, y: 80, width: 460, height: 350 }, activeFrameId: 'frame-flow', cursor: null, workId: 'work-design', dependsOnAgentIds: ['scout'], executionRole: 'verifier', verifiesAssignmentId: 'assignment-research', result: '完成两种窄屏路径', error: null, startedAt: NOW, completedAt: NOW, updatedAt: NOW },
  ],
  presence: [{ participantId: 'scout', participantKind: 'agent', status: '正在整理证据', frameId: 'frame-findings', color: '#d97706', cursorX: 260, cursorY: 180, lastSeenAt: NOW }], comments: [], activity: [], reports: [],
}

const canvasSummary: CanvasWorkspaceSummary = { id: CANVAS_ID, title: canvas.title, goal: canvas.goal, conversationId: CONVERSATION_ID, initiatorAgentId: canvas.initiatorAgentId, status: canvas.status, origin: canvas.origin, frameCount: canvas.frames.length, assignmentCount: canvas.assignments.length, updatedAt: NOW, createdAt: NOW }

const sources: KnowledgeSource[] = [
  { id: 'source-interviews', kind: 'file', title: '用户访谈摘要', mimeType: 'application/pdf', sizeBytes: 184000, originalUrl: null, status: 'ready', stage: 'ready', error: null, isTruncated: false, visibilityScope: 'PROJECT', ownerUserId: 'me', ownerName: '林小溪', createdBy: 'me', createdVia: 'USER', createdAt: NOW, updatedAt: NOW, chunkCount: 18, extractedText: '六位新用户都提到：首次进入后很难判断应该先阅读资料还是先完成任务。' },
  { id: 'source-test', kind: 'text', title: '可用性测试记录', mimeType: 'text/plain', sizeBytes: 24000, originalUrl: null, status: 'ready', stage: 'ready', error: null, isTruncated: false, visibilityScope: 'PROJECT', ownerUserId: 'maya', ownerName: 'Maya', createdBy: 'maya', createdVia: 'USER', createdAt: NOW, updatedAt: NOW, chunkCount: 7, extractedText: '测试重点：单手操作、返回路径、详情抽屉的焦点恢复。' },
  { id: 'source-patterns', kind: 'url', title: '响应式导航模式', mimeType: 'text/html', sizeBytes: 41000, originalUrl: 'https://example.com/responsive-navigation', status: 'ready', stage: 'ready', error: null, isTruncated: false, visibilityScope: 'PROJECT', ownerUserId: 'scout', ownerName: '小研', createdBy: 'scout', createdVia: 'AGENT', createdAt: NOW, updatedAt: NOW, chunkCount: 11, extractedText: '窄屏中应保留稳定的全局导航，并让内容视图一次只完成一个主要任务。' },
]

const learningSpace: LearningSpace = { companyId: COMPANY_ID, projectId: PROJECT_ID, projectKind: 'TEACHING', title: '我的学习', description: '个人学习与研究工作区', color: '#7257d9', status: 'ACTIVE', perspective: 'learner', canManage: true, canEditContent: true, canUpdateCourse: true, canInviteMembers: true, canRevokeInvitations: true, canUpdateMembers: true, canRemoveMembers: true, canSubmit: true, canReview: false, lifecycleAction: null, isDefault: true, lastVisitedAt: NOW }
const overview: LearnerLearningOverview = { perspective: 'learner', windowDays: 30, summary: { dueReviews: 2, verifiedObjectives: 7, activeMissions: 2, evidenceAttempts: 18 }, masteryDistribution: [{ level: 1, count: 2 }, { level: 2, count: 4 }, { level: 3, count: 5 }, { level: 4, count: 2 }], attemptTrend: [{ date: '2026-08-14', count: 2 }, { date: '2026-08-21', count: 4 }, { date: '2026-08-28', count: 6 }], assistanceDistribution: [{ assistance: 'NONE', count: 11 }, { assistance: 'HINT', count: 5 }, { assistance: 'GUIDED', count: 2 }], dueReviews: [{ knowledgeUnitId: 'objective-evidence', title: '用证据支持设计判断', level: 3, status: 'DUE', nextReviewAt: '2026-09-04T09:00:00.000Z' }, { knowledgeUnitId: 'objective-prototype', title: '用原型验证关键假设', level: 2, status: 'DUE', nextReviewAt: '2026-09-05T09:00:00.000Z' }], missionProgress: [{ missionId: 'mission-report', goal: '完成可验证的研究报告', status: 'ACTIVE', completedSteps: 2, totalSteps: 4, updatedAt: NOW }] }
const objectives: LearningObjective[] = [{ id: 'objective-evidence', projectId: PROJECT_ID, title: '用证据支持设计判断', successCriteria: '每个结论都能回溯到原始观察', targetLevel: 3, position: 0, status: 'PUBLISHED', prerequisiteIds: [] }, { id: 'objective-prototype', projectId: PROJECT_ID, title: '用原型验证关键假设', successCriteria: '完成至少一轮多场景验证', targetLevel: 4, position: 1, status: 'PUBLISHED', prerequisiteIds: ['objective-evidence'] }]
const activities: LearningActivity[] = [{ id: 'activity-cards', projectId: PROJECT_ID, title: '整理访谈证据卡', instructions: '提交观察、推理和结论。', kind: 'PRACTICE', status: 'PUBLISHED', evaluationMode: 'AGENT_FORMATIVE', targetLevel: 3, rubric: [{ criterion: '结论可追溯' }], knowledgeUnitIds: ['objective-evidence'], dueAt: '2026-09-06T09:00:00.000Z' }, { id: 'activity-test', projectId: PROJECT_ID, title: '提交可用性测试记录', instructions: '提交观察记录与迭代说明。', kind: 'ASSESSMENT', status: 'PUBLISHED', evaluationMode: 'TEACHER_REQUIRED', targetLevel: 4, rubric: [{ criterion: '观察与选择对应' }], knowledgeUnitIds: ['objective-prototype'], dueAt: '2026-09-08T09:00:00.000Z' }]
const missions: LearningMission[] = [{ id: 'mission-report', projectId: PROJECT_ID, learnerId: 'me', conversationId: CONVERSATION_ID, triggerClientMsgNo: 'm3', goal: '完成可验证的研究报告', successCriteria: '核心判断都有证据来源', kind: 'PROJECT', coordinatorAgentId: 'scout', coordinatorName: '小研', status: 'ACTIVE', steps: [{ id: 'step-patterns', kind: 'LEARN', description: '归纳访谈模式', successCriteria: '形成三个带出处的模式', knowledgeUnitId: 'objective-evidence', status: 'COMPLETED', position: 0, outcome: '已形成三个模式' }, { id: 'step-verify', kind: 'CHECK', description: '验证移动端路径', successCriteria: '记录验证结果和下一步', knowledgeUnitId: 'objective-prototype', status: 'OPEN', position: 1 }], createdAt: NOW, updatedAt: NOW }]
const evidence: LearningEvidence[] = [{ id: 'evidence-1', activity_id: 'activity-cards', mission_step_id: 'step-patterns', assistance: 'HINT', status: 'ACCEPTED', evidence: { summary: '三个模式及访谈索引' }, created_at: NOW, evaluation_id: 'evaluation-1', demonstrated_level: 3, confidence: 0.88, rubric_results: [{ criterion: '结论可追溯', met: true }], feedback: '证据链清楚。', evaluation_status: 'ACCEPTED' }]
const dashboard: LearningDashboard = { projects: [{ projectId: PROJECT_ID, projectKind: 'TEACHING', title: '我的学习', description: learningSpace.description, status: 'ACTIVE', perspective: 'learner', canManage: true, canEditContent: true, canSubmit: true, canReview: false }], due: [{ projectId: PROJECT_ID, knowledgeUnitId: 'objective-evidence', title: '用证据支持设计判断', level: 3, status: 'DUE', nextReviewAt: '2026-09-04T09:00:00.000Z' }], states: [{ projectId: PROJECT_ID, knowledgeUnitId: 'objective-evidence', title: '用证据支持设计判断', level: 3, status: 'VERIFIED', nextReviewAt: '2026-09-10T09:00:00.000Z', reviewIntervalDays: 7 }, { projectId: PROJECT_ID, knowledgeUnitId: 'objective-prototype', title: '用原型验证关键假设', level: 2, status: 'LEARNING', nextReviewAt: '2026-09-05T09:00:00.000Z', reviewIntervalDays: 3 }], pendingReviews: 0 }

localStorage.setItem('lingxiloop-theme', new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark')
if (new URLSearchParams(location.search).get('long') === '1') conversations[0].title = '产品研究协作：把新用户访谈中的证据转化为可以验证的学习路径与下一步行动'
localStorage.removeItem('lingxiloop:desktop-layout:sidebar-width:v1')
useAuth.setState({ authenticated: true, user: { id: 'me', name: '林小溪', email: 'xiaoxi@example.cn', emailVerified: true, providers: ['lingxi'] }, companies: [{ id: COMPANY_ID, name: '我的学习', slug: 'audit', role: 'teacher', isAdmin: true, status: 'ACTIVE' }], activeCompanyId: COMPANY_ID, ready: true, serverCapabilities: { invitationEmail: false } })
useWorkspace.setState({ companyId: COMPANY_ID, list: workspaces, selectedId: PROJECT_ID, loaded: true, loading: false, error: null, load: async () => undefined, select: async (projectId) => { useWorkspace.setState({ selectedId: projectId }) } })
useParticipants.setState({ byId: participants, loaded: true, load: async () => undefined, refresh: async () => undefined })
useConversations.setState({ list: conversations, projectId: PROJECT_ID, loaded: true, loading: false, error: null, load: async () => undefined, reload: async () => undefined })
useApp.setState({ view: 'conversations', selectedConversationId: CONVERSATION_ID, mobileConversationOpen: false, navigationReady: false, navigationPending: false, navigationError: null })
useSurface.setState({ surface: null })
const chatPreview = `我整理了这轮访谈的三个发现。下一步可以先验证「首次进入时能否找到任务」，再检查完成后的反馈。

### 建议先做的事

1. **让下一步更明确**：把待完成练习放在学习概览顶部。
2. **让证据更容易找到**：资料直接显示文件，保留范围切换。
3. **让对话保持连贯**：刷新或返回后仍能找到刚才的讨论。

| 观察 | 验证方式 | 预期结果 |
| --- | --- | --- |
| 首次进入不确定从哪开始 | 邀请三位同学完成首个练习 | 能独立找到下一步 |
| 小屏代码与表格很长 | 在手机中查看下列示例 | 内容内部滚动，页面不横向溢出 |

\`\`\`ts
const nextStep = { title: '验证移动端学习路径', evidence: '完整观察记录与访谈摘要', outcome: '记录下一步行动并回到原来的讨论' }
\`\`\`

这些是用于界面验收的合成内容。你可以继续补充观察，我们再一起检查结论。`
useChatThreadStore.setState({ conversations: { [CONVERSATION_ID]: { messages: [convertEnvelope({channelId:CONVERSATION_ID,channelType:2,fromUid:'scout',clientMsgNo:'local-chat',messageId:'local-chat',messageSeq:1,timestamp:1790899200,payload:createNativeMessage({id:'local-chat',role:'assistant',createdAt:NOW,content:[{type:'text',text:chatPreview}],status:{type:'complete',reason:'stop'}})}, {participants,meId:'me'})], typingAgentIds: [], activeRuns: {}, loaded: true, isLoading: false, isLoadingOlder: false, hasMoreOlder: false, error: null } } })
useCanvas.setState({ snapshot: canvas, previews: { [CANVAS_ID]: canvas }, workspaces: [canvasSummary], activeCanvasId: CANVAS_ID, loading: false, error: null, selectedFrameId: null, load: async () => undefined, loadPreview: async () => undefined, loadWorkspaces: async () => undefined, ensureForConversation: async () => canvas, setStatus: async () => undefined, stopAgent: async () => undefined, stopWorkspace: async () => undefined })
useKnowledgeSources.setState({ list: sources, loading: false, error: null, selectedSource: null, detailLoading: false, conversationSelection: { conversationId: CONVERSATION_ID, sources: sources.map((source) => ({ sourceId: source.id, title: source.title, status: source.status, enabled: true })) }, load: async () => undefined, loadConversationSelection: async () => undefined, open: async (sourceId) => { useKnowledgeSources.setState({ selectedSource: sources.find((source) => source.id === sourceId) ?? null }) }, close: () => useKnowledgeSources.setState({ selectedSource: null }), setSourceEnabled: async () => undefined })

learningApi.listSpaces = async () => ({ data: [learningSpace], nextCursor: null })
learningApi.getOverview = async () => overview
learningApi.listKnowledgeUnits = async () => objectives
learningApi.listActivities = async () => activities
learningApi.listEvidence = async () => evidence
learningApi.listMissions = async () => missions
learningApi.getDashboard = async () => dashboard

// State-only scenarios run without credentials or a backend. Keep them separate
// from the real API journeys so synthetic results cannot count as API acceptance.
const scenario = new URLSearchParams(location.search).get('scenario')
if (scenario === 'layout-rich') {
  const rich = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'scout', clientMsgNo: 'layout-rich',
    messageId: 'layout-rich', messageSeq: 2, timestamp: 1790899201, payload: createNativeMessage({ id:'layout-rich',role:'assistant',createdAt:NOW,content:[
      {type:'text',text:'长正文保持可读行长。'.repeat(30)+'\n\n```typescript\nconst evidence = "'+ 'content'.repeat(35)+'"\n```'},
      {type:'image',image:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="240"%3E%3Crect width="640" height="240" fill="%23e0e7ff"/%3E%3Ctext x="50" y="135" font-size="36" fill="%233730a3"%3EEvidence overview%3C/text%3E%3C/svg%3E',filename:'证据概览.svg'},
      {type:'tool-call',toolCallId:'layout-tool',toolName:'documents.list',args:{},argsText:'{}',result:{status:'completed',value:[]}},
    ] }) },{participants,meId:'me'})
  updateConversation(CONVERSATION_ID,state=>({...state,messages:[rich]}))
}
if (new URLSearchParams(location.search).get('drawer') === '1') useSurface.getState().openAgentInfo('scout')
if (scenario === 'retired-history') {
  harnessApi.readApproval = async id => ({id,status:'PENDING',summary:'calendar.create',action:{action:'calendar.create'},preview:{}})
  const message = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'scout', clientMsgNo: 'retired-history',
    messageId: 'retired-history', messageSeq: 2, timestamp: 1790899201,
    payload: createNativeMessage({ id: 'run-retired-run', role: 'assistant', createdAt: NOW,
      status: { type: 'requires-action', reason: 'tool-calls' }, custom: { runId: 'retired-run', refs:{agentId:'scout'}, controlPrincipalId: 'me',
        harness:{...createRunView('retired-run'),artifacts:[],lifecycle:'waiting',goalOutcome:{status:'awaiting_approval',approvalId:'retired-fallback',requestVersion:1,verification:'inconclusive'}} }, content: [
        { type: 'data', name: 'email', data: { subject: '历史邮件标题', from: 'a@example.test', to: ['b@example.test'], body: '历史邮件正文' } },
        { type: 'generative-ui', spec: { root: { component: 'calendar-event', props: { event: { id: 'retired-event', title: '历史日程标题', startAt: NOW, allDay: false } } } } },
        ...['email.send','calendar.create'].map((toolName,index) => ({ type: 'tool-call' as const, toolCallId: `retired-${index}`, toolName,
          args: {}, argsText: '{}', approval: { id: `retired-approval-${index}` } })),
      ] }),
  }, { participants, meId: 'me' })
  updateConversation(CONVERSATION_ID,state => ({ ...state,messages:[message] }))
}
if (scenario === 'mention-names') {
  useParticipants.setState({ byId: { ...participants, scout: { ...participants.scout, name: '思南' } } })
  const message = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'me',
    clientMsgNo: 'mention-names', messageId: 'mention-names', messageSeq: 2, timestamp: 1790899200,
    payload: createNativeMessage({ id: 'mention-names', role: 'user', createdAt: NOW, content: [{ type: 'text',
      text: '请找@scout，@all @unknown @scouter\n\n`@scout` [@scout](https://example.com) mail@scout.cn' }] }),
  }, { participants, meId: 'me' })
  updateConversation(CONVERSATION_ID, state => ({ ...state, messages: [message] }))
}
if (scenario === 'message-actions') {
  const reply = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'scout', messageId: 'actions-reply',
    clientMsgNo: 'actions-reply', messageSeq: 1, timestamp: Date.parse(NOW) / 1000,
    payload: createNativeMessage({ id: 'actions-reply', role: 'assistant', createdAt: NOW, content: [
      { type: 'text', text: '第一段回复。' }, { type: 'data', name: 'tool-activity', data: { title: '整理资料', status: 'completed' } },
      { type: 'text', text: '最后一段回复。' },
    ] }),
  }, { participants, meId: 'me' })
  updateConversation(CONVERSATION_ID, state => ({ ...state, messages: [reply] }))
  let reactions: Array<{ emoji: string; count: number; users: string[]; mine: boolean }> = []
  messagesApi.toggleReaction = async (conversationId, messageId, sequence, emoji) => {
    if (conversationId !== CONVERSATION_ID || messageId !== 'actions-reply' || sequence !== 1) throw new Error('Invalid reaction identity')
    reactions = reactions.some(reaction => reaction.emoji === emoji) ? reactions.filter(reaction => reaction.emoji !== emoji)
      : [...reactions, { emoji, count: 1, users: ['me'], mine: true }]
    return { reactions }
  }
  let finishSend: (() => void) | undefined
  let sendFailed = false
  let branchCount = 0
  let lastPayload: ReturnType<typeof createNativeMessage> | undefined
  const nextSequence = () => Math.max(0, ...useChatThreadStore.getState().conversations[CONVERSATION_ID].messages.map(message => Number(message.metadata.custom.sequence) || 0)) + 1
  const showBranch = (running: boolean) => {
    if (!lastPayload) throw new Error('Regeneration must precede its reply')
    const response = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'scout', messageId: `branch-${branchCount}`,
      clientMsgNo: `branch-${branchCount}`, messageSeq: running ? 0 : nextSequence(), timestamp: Date.parse(NOW) / 1000,
      payload: createNativeMessage({ id: `branch-${branchCount}`, role: 'assistant', createdAt: NOW,
        content: [{ type: 'text', text: `重新生成的第 ${branchCount + 1} 版回复${running ? '（生成中）' : '。'}` }],
        status: running ? { type: 'running' } : { type: 'complete', reason: 'stop' },
        custom: { sourceRef: lastPayload.id, replyToClientMsgNo: lastPayload.id } }),
    }, { participants, meId: 'me' })
    const activeRuns: Record<string, ActiveAgentRun> = {}
    if (running) activeRuns.fixture = { id: 'fixture', agentId: 'scout', messageId: response.id, lastSequence: null, state: 'running' }
    updateConversation(CONVERSATION_ID, state => ({ ...state, messages: mergeCanonicalMessages(state.messages, [response]), activeRuns }))
  }
  lingxiIm.send = async (conversationId, payload) => {
    userMessageSchema.parse(payload)
    lastPayload = payload
    document.documentElement.dataset.regeneratePayload = JSON.stringify(payload)
    await new Promise<void>(resolve => { finishSend = resolve })
    if (sendFailed) throw new Error('Synthetic send failure')
    return { channelId: conversationId, channelType: 2, fromUid: 'me', messageId: payload.id, clientMsgNo: payload.id,
      messageSeq: nextSequence(), timestamp: Date.parse(payload.createdAt) / 1000, payload }
  }
  window.addEventListener('message-actions-step', ((event: CustomEvent<string>) => {
    if (event.detail === 'sent') finishSend?.()
    if (event.detail === 'branch-start') { branchCount += 1; showBranch(true) }
    if (event.detail === 'branch-complete') showBranch(false)
    if (event.detail === 'branch-failed') {
      lastPayload = createNativeMessage({ id: 'failed-regeneration', role: 'user', createdAt: NOW, content: [{ type: 'text', text: '请重新生成这条回复。' }],
        custom: { replyToClientMsgNo: 'actions-reply', regenerateOfClientMsgNo: 'actions-reply', mentionedIds: ['scout'] } })
      const request = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'me', messageId: lastPayload.id, clientMsgNo: lastPayload.id,
        messageSeq: nextSequence(), timestamp: Date.parse(NOW) / 1000, payload: lastPayload }, { participants, meId: 'me' })
      updateConversation(CONVERSATION_ID, state => ({ ...state, messages: mergeCanonicalMessages(state.messages, [request]) }))
      branchCount += 1
      showBranch(true)
      updateConversation(CONVERSATION_ID, state => ({ ...state, activeRuns: {}, messages: state.messages.map(message =>
        message.id === `branch-${branchCount}` && message.role === 'assistant' ? { ...message, status: { type: 'incomplete', reason: 'error' },
          metadata: { ...message.metadata, custom: { ...message.metadata.custom, harnessError: 'The operation was aborted due to timeout' } } } : message) }))
      useConversations.setState(state => ({ list: state.list.map(room => ({ ...room, readOnly: false })) }))
    }
    if (event.detail === 'followup') {
      const followup = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'me', messageId: 'actions-followup',
        clientMsgNo: 'actions-followup', messageSeq: nextSequence(), timestamp: Date.parse(NOW) / 1000,
        payload: createNativeMessage({ id: 'actions-followup', role: 'user', createdAt: NOW, content: [{ type: 'text', text: '后续消息仍在原处。' }] }),
      }, { participants, meId: 'me' })
      updateConversation(CONVERSATION_ID, state => ({ ...state, messages: mergeCanonicalMessages(state.messages, [followup]) }))
    }
    if (event.detail === 'send-failed') { sendFailed = true; finishSend?.() }
    if (event.detail === 'failed') {
      const question = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'me', messageId: 'actions-question',
        clientMsgNo: 'actions-question', messageSeq: 1, timestamp: Date.parse(NOW) / 1000,
        payload: createNativeMessage({ id: 'actions-question', role: 'user', createdAt: NOW, content: [{ type: 'text', text: '请回答这个问题。' }] }),
      }, { participants, meId: 'me' })
      if (reply.role !== 'assistant') throw new Error('Expected assistant error fixture')
      const failed = { ...reply, status: { type: 'incomplete' as const, reason: 'error' as const }, metadata: { ...reply.metadata,
        custom: { ...reply.metadata.custom, sequence: null, sourceRef: 'actions-question', harnessError: 'The operation was aborted due to timeout' } } }
      updateConversation(CONVERSATION_ID, state => ({ ...state, messages: [question, failed] }))
      useConversations.setState(state => ({ list: state.list.map(room => ({ ...room, readOnly: false })) }))
    }
    if (event.detail === 'read-only') useConversations.setState(state => ({ list: state.list.map(room => ({ ...room, readOnly: true })) }))
    if (event.detail === 'replay-ratings') replaceMessageReactions(CONVERSATION_ID, 'actions-reply', reactions)
  }) as EventListener)
  if (new URLSearchParams(location.search).get('branched') === '1') {
    for (let index = 1; index <= 2; index++) {
      lastPayload = createNativeMessage({ id: `recorded-regeneration-${index}`, role: 'user', createdAt: NOW, content: [{ type: 'text', text: '请重新生成这条回复。' }],
        custom: { replyToClientMsgNo: 'actions-reply', regenerateOfClientMsgNo: 'actions-reply', mentionedIds: ['scout'] } })
      const recorded = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'me', messageId: lastPayload.id, clientMsgNo: lastPayload.id,
        messageSeq: nextSequence(), timestamp: Date.parse(NOW) / 1000, payload: lastPayload }, { participants, meId: 'me' })
      updateConversation(CONVERSATION_ID, state => ({ ...state, messages: mergeCanonicalMessages(state.messages, [recorded]) }))
      branchCount = index
      showBranch(false)
    }
  }
}
if (scenario === 'streaming-text') {
  const initial = useChatThreadStore.getState().conversations[CONVERSATION_ID].messages[0]
  if (initial.role !== 'assistant') throw new Error('Expected assistant streaming fixture')
  const message = { ...initial, id: 'streaming-preview', content: [{ type: 'text' as const, text: 'Ready' }], status: { type: 'running' as const },
    metadata: { ...initial.metadata, custom: { ...initial.metadata.custom, clientMessageId: 'streaming-preview' } } }
  updateConversation(CONVERSATION_ID, state => ({ ...state, messages: [message] }))
  window.addEventListener('streaming-text-step', ((event: CustomEvent<{ text: string; done: boolean }>) => {
    updateConversation(CONVERSATION_ID, state => ({ ...state, messages: [{ ...message,
      content: [{ type: 'text', text: event.detail.text }],
      status: event.detail.done ? { type: 'complete', reason: 'stop' } : { type: 'running' },
    }] }))
  }) as EventListener)
}
if (scenario === 'chat-bubble-colors') {
  const messages = ['maya', 'me'].map((fromUid, index) => convertEnvelope({
    channelId: CONVERSATION_ID, channelType: 2, fromUid, clientMsgNo: `bubble-${fromUid}`,
    messageId: `bubble-${fromUid}`, messageSeq: index + 2, timestamp: 1790899201 + index,
    payload: createNativeMessage({ id: `bubble-${fromUid}`, role: 'user', createdAt: NOW,
      content: [{ type: 'text', text: '**对话气泡**：检查正文与状态文字的颜色。\n\n> 引用内容也需要清晰可读。\n\n[查看资料](https://example.com)' }] }),
  }, { participants, meId: 'me' }))
  useChatThreadStore.setState({ conversations: { ...useChatThreadStore.getState().conversations,
    [CONVERSATION_ID]: { ...useChatThreadStore.getState().conversations[CONVERSATION_ID],
      messages: [...useChatThreadStore.getState().conversations[CONVERSATION_ID].messages, ...messages] },
  } })
}
if (scenario === 'chat-regressions') {
  const target = { conversationId: CONVERSATION_ID, agentId: 'scout', runId: 'regression' }
  const user = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'me', clientMsgNo: 'regression-user',
    messageId: 'regression-user', messageSeq: 0, timestamp: Date.parse(NOW) / 1000 + 10,
    payload: createNativeMessage({ id: 'regression-user', role: 'user', createdAt: new Date(Date.parse(NOW) + 10_000).toISOString(),
      content: [{ type: 'text', text: '请按顺序回答，保留已输出的内容。' }] }),
  }, { participants, meId: 'me' })
  user.metadata.custom.delivery = 'sending'
  let snapshot: AgentRunSnapshot = { message: createNativeMessage({ id: 'run-regression', role: 'assistant', createdAt: NOW, content: [],
    status: { type: 'running' }, custom: { runId: target.runId, harness: { ...createRunView(target.runId),
      lifecycle: 'leased', requestVersion: 1, fence: 1, artifacts: [] } } }) }
  const history = useChatThreadStore.getState().conversations[CONVERSATION_ID].messages[0]
  if (history.role !== 'assistant' || user.role !== 'user') throw new Error('Invalid chat regression fixture')
  updateConversation(CONVERSATION_ID, state => applyRunSnapshot({ ...state, messages: [
    ...Array.from({ length: 6 }, (_, index) => ({ ...history, id: `older-${index}`, metadata: { ...history.metadata,
      custom: { ...history.metadata.custom, clientMessageId: `older-${index}`, sequence: index + 1 } } })), user,
  ] }, target, snapshot, participants.scout))
  window.addEventListener('chat-regression-step', ((event: CustomEvent<string>) => {
    if (snapshot.message.role !== 'assistant') throw new Error('Expected assistant snapshot')
    if (event.detail === 'delivered') {
      const receipt = { ...user, metadata: { ...user.metadata, custom: { ...user.metadata.custom, sequence: 7, delivery: 'sent' as const } } }
      updateConversation(CONVERSATION_ID, state => ({ ...state, messages: mergeCanonicalMessages(state.messages, [receipt]) }))
      snapshot = { message: { ...snapshot.message, metadata: { ...snapshot.message.metadata,
        custom: { ...snapshot.message.metadata.custom, sourceRef: 'regression-user' } } } }
    } else if (event.detail === 'preview') {
      snapshot = { message: { ...snapshot.message, content: [{ type: 'text', text: '第一段已显示。\n\n第二段 **仍在输出' }] } }
    } else if (event.detail === 'timeout') {
      snapshot = { message: { ...snapshot.message, content: [], status: { type: 'incomplete', reason: 'error' },
        metadata: { ...snapshot.message.metadata, custom: { ...snapshot.message.metadata.custom,
          harnessError: 'The operation was aborted due to timeout',
          harness: { ...snapshot.message.metadata.custom.harness as ReturnType<typeof createRunView>, lifecycle: 'failed', artifacts: [] } } } } }
    } else if (event.detail === 'retry') {
      snapshot = { message: { ...snapshot.message, content: [], status: { type: 'running' },
        metadata: { ...snapshot.message.metadata, custom: { ...snapshot.message.metadata.custom, harnessError: null,
          harness: { ...snapshot.message.metadata.custom.harness as ReturnType<typeof createRunView>, lifecycle: 'leased', fence: 2, requestVersion: 2, artifacts: [] } } } } }
    }
    updateConversation(CONVERSATION_ID, state => applyRunSnapshot(state, target, snapshot, participants.scout))
  }) as EventListener)
} else if (scenario?.startsWith('chat-') && scenario !== 'chat-bubble-colors') {
  harnessApi.readApproval = async () => ({ id: 'approval-feedback', status: 'PENDING', summary: 'documents.create',
    action: { action: 'documents.create' }, preview: { input: { title: '学习复盘', at: NOW } } })
  const kind = scenario.slice(5)
  const failed = kind === 'failed'
  const outcome = kind === 'partial' ? 'partial' : kind === 'blocked' || kind === 'empty-blocked' ? 'blocked' : 'satisfied'
  const view = { ...createRunView('feedback'), artifacts: [],
    lifecycle: failed ? 'failed' as const : kind === 'cancelled' ? 'cancelled' as const : kind === 'approval' ? 'waiting' as const : 'succeeded' as const,
    delivery: kind === 'delivery' ? 'failed' as const : 'delivered' as const,
    resultId: failed || kind === 'empty-blocked' || kind === 'approval' ? null : 'result-feedback',
    goalOutcome: kind === 'approval'
      ? { status: 'awaiting_approval' as const, approvalId: 'approval-feedback', requestVersion: 1, verification: 'inconclusive' as const }
      : { status: outcome, requestVersion: 1, verification: 'inconclusive' as const,
        gaps: ['Declared delivery limitation: no activity records exist.'] },
  }
  const message = convertEnvelope({ channelId: CONVERSATION_ID, channelType: 2, fromUid: 'scout',
    clientMsgNo: 'run-feedback', messageId: 'run-feedback', messageSeq: 2, timestamp: 1790899201,
    payload: createNativeMessage({ id: 'run-feedback', role: 'assistant', createdAt: NOW,
      content: failed || kind === 'empty-blocked' || kind === 'approval' ? [] : [{ type: 'text', text: '目前没有学习活动记录。' }],
      status: failed ? { type: 'incomplete', reason: 'error' } : kind === 'cancelled' ? { type: 'incomplete', reason: 'cancelled' }
        : kind === 'approval' ? { type: 'requires-action', reason: 'tool-calls' }
        : outcome === 'satisfied' ? { type: 'complete', reason: 'stop' } : { type: 'incomplete', reason: 'other' },
      custom: { runId: 'feedback', refs: { agentId: 'scout' }, harness: view, controlPrincipalId: 'me',
        ...(failed ? { harnessError: 'Model provider request failed (HTTP 402)' } : {}) },
    }),
  }, { participants, meId: 'me' })
  useChatThreadStore.setState({ conversations: { ...useChatThreadStore.getState().conversations,
    [CONVERSATION_ID]: { ...useChatThreadStore.getState().conversations[CONVERSATION_ID], messages: [message] },
  } })
}
if (scenario === 'empty-conversations' || scenario === 'read-only-empty') {
  useConversations.setState({ list: [] })
  useApp.setState({ selectedConversationId: null })
}
if (scenario === 'read-only-empty') {
  useWorkspace.setState({ list: workspaces.map((space) => ({ ...space, status: 'ARCHIVED' })) })
}
if (scenario === 'empty-spaces') {
  const role = new URLSearchParams(location.search).get('role') === 'student' ? 'student' : 'teacher'
  useAuth.setState({ companies: useAuth.getState().companies.map((company) => ({ ...company, role })) })
  useWorkspace.setState({ list: [], selectedId: null })
  useConversations.setState({ list: [], projectId: null })
  useApp.setState({ view: 'conversations', selectedConversationId: null })
  learningApi.listSpaces = async () => ({ data: [], nextCursor: null })
}

export { sources, canvas, participants, learningSpace, overview, objectives, activities, missions, evidence, dashboard }
