import type { ThreadMessage } from '@assistant-ui/react'
import { createRoot } from 'react-dom/client'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DesktopApp } from '@/desktop/DesktopApp'
import { useParticipants } from '@/features/agents/state'
import type { CanvasFrame, CanvasSnapshot, CanvasWorkspaceSummary } from '@/features/canvas/contracts'
import { useCanvas } from '@/features/canvas/state'
import { useCalendar } from '@/features/calendar/state'
import type { LingxiMessageMetadata } from '@/features/chat/runtime'
import { useChatThreadStore } from '@/features/chat/runtime/store'
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
import type { Conversation, Participant, WorkspaceSummary } from '@/types'
import '@/styles/globals.css'

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
  { id: PROJECT_ID, companyId: COMPANY_ID, kind: 'PERSONAL_LEARNING', planId: null, name: '我的学习', description: '个人学习与研究工作区', color: '#7257d9', status: 'ACTIVE', createdBy: 'me', isDefault: true, createdAt: NOW, updatedAt: NOW, archivedAt: null, lastVisitedAt: NOW, sourceCount: 3, conversationCount: 6, documentCount: 4, calendarEventCount: 2, canvasCount: 1, canManage: true },
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

function message(id: string, senderId: keyof typeof participants, text: string, sequence: number): ThreadMessage {
  const sender = participants[senderId]
  const isMine = sender.id === 'me'
  const metadata: LingxiMessageMetadata = {
    schema: 'lingxiloop.thread-message.v1', conversationId: CONVERSATION_ID, clientMessageId: id, sequence,
    senderId: sender.id, senderName: sender.name, senderKind: sender.kind, senderAvatarUrl: null,
    isMine, delivery: 'sent', messageKind: 'text', runId: null, quotedMessageId: null, quote: null,
    reactions: id === 'm4' ? [{ emoji: '👍', count: 3, mine: true, userIds: ['me', 'maya', 'scout'] }] : [],
    replyCount: id === 'm4' ? 2 : 0, threadRootId: null, groupStart: true, groupEnd: true,
    continuedFromPrevious: false, continuedToNext: false,
  }
  return {
    id,
    role: isMine ? 'user' : 'assistant',
    createdAt: new Date(`2026-09-03T08:${String(sequence * 4).padStart(2, '0')}:00.000Z`),
    content: [{ type: 'text', text }],
    ...(!isMine ? { status: { type: 'complete', reason: 'stop' } as const } : {}),
    metadata: { custom: metadata },
  }
}

const messages = [
  message('m1', 'maya', '我们先确认一个目标：新用户能不能在十分钟内找到自己的下一步学习任务？', 1),
  message('m2', 'me', '可以。我已经把六次访谈的原始记录放到右侧资料区。', 2),
  message('m3', 'scout', '我先按“触发点—阻碍—证据”整理，并把可验证的判断放进 Canvas。', 3),
  message('m4', 'iris', '移动端草图也补好了：保留工作区竖栏，会话列表和聊天改成单页切换。', 4),
  message('m5', 'maya', '详情统一用 Drawer 很合适，关闭后不要让下面的资料面板重新弹出。', 5),
  message('m6', 'scout', '第一轮完成：三个高频障碍都有访谈出处，下一步可以直接做可用性验证。', 6),
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

const learningSpace: LearningSpace = { companyId: COMPANY_ID, projectId: PROJECT_ID, projectKind: 'PERSONAL_LEARNING', title: '我的学习', description: '个人学习与研究工作区', color: '#7257d9', status: 'ACTIVE', perspective: 'learner', canManage: true, canEditContent: true, canUpdateCourse: true, canInviteMembers: true, canRevokeInvitations: true, canUpdateMembers: true, canRemoveMembers: true, canSubmit: true, canReview: false, lifecycleAction: null, isDefault: true, lastVisitedAt: NOW }
const overview: LearnerLearningOverview = { perspective: 'learner', windowDays: 30, summary: { dueReviews: 2, verifiedObjectives: 7, activeMissions: 2, evidenceAttempts: 18 }, masteryDistribution: [{ level: 1, count: 2 }, { level: 2, count: 4 }, { level: 3, count: 5 }, { level: 4, count: 2 }], attemptTrend: [{ date: '2026-08-14', count: 2 }, { date: '2026-08-21', count: 4 }, { date: '2026-08-28', count: 6 }], assistanceDistribution: [{ assistance: 'NONE', count: 11 }, { assistance: 'HINT', count: 5 }, { assistance: 'GUIDED', count: 2 }], dueReviews: [{ knowledgeUnitId: 'objective-evidence', title: '用证据支持设计判断', level: 3, status: 'DUE', nextReviewAt: '2026-09-04T09:00:00.000Z' }, { knowledgeUnitId: 'objective-prototype', title: '用原型验证关键假设', level: 2, status: 'DUE', nextReviewAt: '2026-09-05T09:00:00.000Z' }], missionProgress: [{ missionId: 'mission-report', goal: '完成可验证的研究报告', status: 'ACTIVE', completedSteps: 2, totalSteps: 4, updatedAt: NOW }] }
const objectives: LearningObjective[] = [{ id: 'objective-evidence', projectId: PROJECT_ID, title: '用证据支持设计判断', successCriteria: '每个结论都能回溯到原始观察', targetLevel: 3, position: 0, status: 'PUBLISHED', prerequisiteIds: [] }, { id: 'objective-prototype', projectId: PROJECT_ID, title: '用原型验证关键假设', successCriteria: '完成至少一轮多场景验证', targetLevel: 4, position: 1, status: 'PUBLISHED', prerequisiteIds: ['objective-evidence'] }]
const activities: LearningActivity[] = [{ id: 'activity-cards', projectId: PROJECT_ID, title: '整理访谈证据卡', instructions: '提交观察、推理和结论。', kind: 'PRACTICE', status: 'PUBLISHED', evaluationMode: 'AGENT_FORMATIVE', targetLevel: 3, rubric: [{ criterion: '结论可追溯' }], knowledgeUnitIds: ['objective-evidence'], dueAt: '2026-09-06T09:00:00.000Z' }, { id: 'activity-test', projectId: PROJECT_ID, title: '提交可用性测试记录', instructions: '提交观察记录与迭代说明。', kind: 'ASSESSMENT', status: 'PUBLISHED', evaluationMode: 'TEACHER_REQUIRED', targetLevel: 4, rubric: [{ criterion: '观察与选择对应' }], knowledgeUnitIds: ['objective-prototype'], dueAt: '2026-09-08T09:00:00.000Z' }]
const missions: LearningMission[] = [{ id: 'mission-report', projectId: PROJECT_ID, learnerId: 'me', conversationId: CONVERSATION_ID, triggerClientMsgNo: 'm3', goal: '完成可验证的研究报告', successCriteria: '核心判断都有证据来源', kind: 'PROJECT', coordinatorAgentId: 'scout', coordinatorName: '小研', status: 'ACTIVE', steps: [{ id: 'step-patterns', kind: 'LEARN', description: '归纳访谈模式', successCriteria: '形成三个带出处的模式', knowledgeUnitId: 'objective-evidence', status: 'COMPLETED', position: 0, outcome: '已形成三个模式' }, { id: 'step-verify', kind: 'CHECK', description: '验证移动端路径', successCriteria: '记录验证结果和下一步', knowledgeUnitId: 'objective-prototype', status: 'OPEN', position: 1 }], createdAt: NOW, updatedAt: NOW }]
const evidence: LearningEvidence[] = [{ id: 'evidence-1', activity_id: 'activity-cards', mission_step_id: 'step-patterns', assistance: 'HINT', status: 'ACCEPTED', evidence: { summary: '三个模式及访谈索引' }, created_at: NOW, evaluation_id: 'evaluation-1', demonstrated_level: 3, confidence: 0.88, rubric_results: [{ criterion: '结论可追溯', met: true }], feedback: '证据链清楚。', evaluation_status: 'ACCEPTED' }]
const dashboard: LearningDashboard = { projects: [{ projectId: PROJECT_ID, projectKind: 'PERSONAL_LEARNING', title: '我的学习', description: learningSpace.description, status: 'ACTIVE', perspective: 'learner', canManage: true, canEditContent: true, canSubmit: true, canReview: false }], due: [{ projectId: PROJECT_ID, knowledgeUnitId: 'objective-evidence', title: '用证据支持设计判断', level: 3, status: 'DUE', nextReviewAt: '2026-09-04T09:00:00.000Z' }], states: [{ projectId: PROJECT_ID, knowledgeUnitId: 'objective-evidence', title: '用证据支持设计判断', level: 3, status: 'VERIFIED', nextReviewAt: '2026-09-10T09:00:00.000Z', reviewIntervalDays: 7 }, { projectId: PROJECT_ID, knowledgeUnitId: 'objective-prototype', title: '用原型验证关键假设', level: 2, status: 'LEARNING', nextReviewAt: '2026-09-05T09:00:00.000Z', reviewIntervalDays: 3 }], pendingReviews: 0 }

localStorage.setItem('lingxiloop-theme', new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light')
useAuth.setState({ token: 'fixture-token', user: { id: 'me', name: '林小溪', email: 'xiaoxi@example.cn', emailVerified: true, providers: ['lingxi'] }, companies: [{ id: COMPANY_ID, name: '我的学习', slug: 'audit', role: 'owner', status: 'ACTIVE' }], activeCompanyId: COMPANY_ID, personalCompanyId: COMPANY_ID, ready: true, serverCapabilities: { invitationEmail: false } })
useWorkspace.setState({ companyId: COMPANY_ID, list: workspaces, selectedId: PROJECT_ID, loaded: true, loading: false, error: null, load: async () => undefined, select: async (projectId) => { useWorkspace.setState({ selectedId: projectId }) } })
useParticipants.setState({ byId: participants, loaded: true, load: async () => undefined, refresh: async () => undefined })
useConversations.setState({ list: conversations, projectId: PROJECT_ID, loaded: true, loading: false, error: null, load: async () => undefined, reload: async () => undefined })
useApp.setState({ view: 'conversations', selectedConversationId: CONVERSATION_ID })
useSurface.setState({ surface: null })
useChatThreadStore.setState({ conversations: { [CONVERSATION_ID]: { messages, typingAgentIds: [], activeRuns: {}, loaded: true, isLoading: false, isLoadingOlder: false, hasMoreOlder: false, error: null } } })
useCanvas.setState({ snapshot: canvas, previews: { [CANVAS_ID]: canvas }, workspaces: [canvasSummary], activeCanvasId: CANVAS_ID, loading: false, error: null, selectedFrameId: null, load: async () => undefined, loadPreview: async () => undefined, loadWorkspaces: async () => undefined, ensureForConversation: async () => canvas, setStatus: async () => undefined, stopAgent: async () => undefined, stopWorkspace: async () => undefined })
useKnowledgeSources.setState({ list: sources, loading: false, error: null, selectedSource: null, detailLoading: false, conversationSelection: { conversationId: CONVERSATION_ID, sources: sources.map((source) => ({ sourceId: source.id, title: source.title, status: source.status, enabled: true })) }, load: async () => undefined, loadConversationSelection: async () => undefined, open: async (sourceId) => { useKnowledgeSources.setState({ selectedSource: sources.find((source) => source.id === sourceId) ?? null }) }, close: () => useKnowledgeSources.setState({ selectedSource: null }), setSourceEnabled: async () => undefined })
useCalendar.setState({ events: [{ id: 'calendar-review', companyId: COMPANY_ID, createdBy: 'me', kind: 'personal', title: '移动端方案评审', description: '检查 767px 与 768px 的布局切换。', assigneeId: null, targetConversationId: CONVERSATION_ID, agentPrompt: null, startAt: '2026-09-04T09:00:00.000Z', endAt: '2026-09-04T10:00:00.000Z', allDay: false, recurrence: null, status: 'active', lastFiredAt: null, reminderMinutesBefore: 15, reminderChannel: 'toast', isPrivate: false, createdAt: NOW, updatedAt: NOW }], loaded: true, loading: false, loadingEventId: null, error: null, load: async () => undefined, loadEvent: async () => useCalendar.getState().events[0] })

learningApi.listSpaces = async () => ({ data: [learningSpace], nextCursor: null })
learningApi.getOverview = async () => overview
learningApi.listKnowledgeUnits = async () => objectives
learningApi.listActivities = async () => activities
learningApi.listEvidence = async () => evidence
learningApi.listMissions = async () => missions
learningApi.getDashboard = async () => dashboard

declare global { interface Window { responsiveShellFixture: { openCalendar(): void } } }
window.responsiveShellFixture = { openCalendar: () => useSurface.getState().openCalendarEventPeek('calendar-review') }

createRoot(document.getElementById('root')!).render(
  <AppThemeProvider>
    <TooltipProvider>
      <GlobalInteractionProvider><DesktopApp /></GlobalInteractionProvider>
    </TooltipProvider>
  </AppThemeProvider>,
)
