import { findCanvasPlacement } from '@/lib/canvasLayout'
import { useCanvas } from '@/stores/canvas'
import type { CanvasActivity, CanvasComment, CanvasFrame, CanvasFrameType, CanvasSnapshot, CanvasWorkspaceSummary } from '@/types'
import { isoMinutesAgo, MOCK_LAB_ROOM_ID, MOCK_LEARNING_CANVAS_ID, MOCK_USER_ID } from './mockLearningImFixtures'

const updatedAt = isoMinutesAgo(1)

const initialCanvas: CanvasSnapshot = {
  id: MOCK_LEARNING_CANVAS_ID,
  title: '可对角化迁移项目',
  companyId: 'mock-workspace',
  conversationId: MOCK_LAB_ROOM_ID,
  triggerClientMsgNo: null,
  goal: '用可复现实验解释马尔可夫链长期状态，并保留来源与验证证据。',
  initiatorAgentId: 'mock-forge',
  status: 'completed',
  origin: 'mock',
  summary: '汇总角色已读取三份结构化报告：数值结论获得支持，同时保留周期链反例和适用范围。',
  createdBy: MOCK_USER_ID,
  createdAt: isoMinutesAgo(28),
  updatedAt,
  frames: [
    {
      id: 'mock-frame-plan', canvasId: MOCK_LEARNING_CANVAS_ID, type: 'markdown', title: '迁移任务与成功标准',
      x: 70, y: 80, width: 430, height: 310,
      content: '# 马尔可夫链迁移任务\n\n- 写出转移矩阵并核对随机性\n- 用特征分解解释长期状态\n- 与直接迭代的数值结果交叉验证\n- 记录适用条件、误差和反例\n\n成功标准：结论可复现，且经 Trace 独立复核和教师确认。',
      data: {}, revision: 2, createdBy: 'mock-nova', updatedBy: 'mock-nova', createdAt: isoMinutesAgo(27), updatedAt: isoMinutesAgo(18),
    },
    {
      id: 'mock-frame-source', canvasId: MOCK_LEARNING_CANVAS_ID, type: 'document', title: 'Scout 来源报告',
      x: 540, y: 80, width: 430, height: 310,
      content: '教材结论：若转移矩阵可对角化，幂次可通过特征值幂次分析；长期行为仍需检查特征值模与不可约、非周期等条件。\n\n来源与推断已经分开记录。',
      data: { reportType: 'specialist', author: 'mock-scout', confidence: 0.94 }, revision: 1,
      createdBy: 'mock-scout', updatedBy: 'mock-scout', createdAt: isoMinutesAgo(22), updatedAt: isoMinutesAgo(20),
    },
    {
      id: 'mock-frame-experiment', canvasId: MOCK_LEARNING_CANVAS_ID, type: 'artifact', title: 'Forge 数值实验',
      x: 70, y: 440, width: 900, height: 300,
      content: 'P = [[0.8, 0.2], [0.3, 0.7]]\n初始分布：[1, 0]\n50 次迭代：[0.600000, 0.400000]\n特征分解预测稳态：[0.6, 0.4]\n最大绝对误差：2.2e-16',
      data: { reportType: 'experiment', reproducible: true, verified: false }, revision: 3,
      createdBy: 'mock-forge', updatedBy: 'mock-forge', createdAt: isoMinutesAgo(18), updatedAt: isoMinutesAgo(3),
    },
  ],
  assignments: [
    {
      id: 'mock-assignment-forge', canvasId: MOCK_LEARNING_CANVAS_ID, agentId: 'mock-forge',
      assignment: '实现并验证数值实验', color: '#15803d', status: 'completed',
      workArea: { x: 50, y: 420, width: 940, height: 340 }, activeFrameId: 'mock-frame-experiment',
      cursor: { x: 820, y: 560 }, workId: 'mock-work-forge', dependsOnAgentIds: ['mock-scout'], result: null, error: null,
      executionRole:'specialist',verifiesAssignmentId:null,
      startedAt: isoMinutesAgo(18), completedAt: isoMinutesAgo(3), updatedAt: isoMinutesAgo(3),
    },
    {
      id: 'mock-assignment-scout', canvasId: MOCK_LEARNING_CANVAS_ID, agentId: 'mock-scout',
      assignment: '核对教材来源与适用条件', color: '#1d4ed8', status: 'completed',
      workArea: { x: 520, y: 60, width: 470, height: 350 }, activeFrameId: 'mock-frame-source',
      cursor: null, workId: 'mock-work-scout', dependsOnAgentIds: [], result: '来源报告已提交', error: null,
      executionRole:'specialist',verifiesAssignmentId:null,
      startedAt: isoMinutesAgo(24), completedAt: isoMinutesAgo(20), updatedAt: isoMinutesAgo(20),
    },
    {
      id: 'mock-assignment-trace', canvasId: MOCK_LEARNING_CANVAS_ID, agentId: 'mock-trace',
      assignment: '独立复核迁移结论与反例', color: '#b91c1c', status: 'completed',
      workArea: { x: 50, y: 60, width: 470, height: 350 }, activeFrameId: 'mock-frame-plan',
      cursor: null, workId: 'mock-work-trace', dependsOnAgentIds: ['mock-forge'], result: null, error: null,
      executionRole:'verifier',verifiesAssignmentId:'mock-assignment-forge',progressFingerprint:'mission-r3:reports-3',noProgressCount:3,
      startedAt: isoMinutesAgo(3), completedAt: isoMinutesAgo(1), updatedAt: isoMinutesAgo(1),
    },
  ],
  presence: [
    { participantId: MOCK_USER_ID, participantKind: 'user', status: 'viewing', frameId: null, color: '#3390ec', cursorX: 620, cursorY: 520, lastSeenAt: updatedAt },
  ],
  comments: [
    { id: 'mock-comment-evidence', canvasId: MOCK_LEARNING_CANVAS_ID, frameId: 'mock-frame-experiment', authorId: MOCK_USER_ID, authorKind: 'user', body: '请保留初始分布变化后的对照结果，作为迁移证据。', createdAt: isoMinutesAgo(5) },
  ],
  activity: [
    { id: 'mock-activity-forge', canvasId: MOCK_LEARNING_CANVAS_ID, frameId: 'mock-frame-experiment', actorId: 'mock-forge', actorKind: 'agent', action: 'frame_updated', detail: { title: 'Forge 数值实验', revision: 3 }, createdAt: isoMinutesAgo(3) },
    { id: 'mock-activity-scout', canvasId: MOCK_LEARNING_CANVAS_ID, frameId: 'mock-frame-source', actorId: 'mock-scout', actorKind: 'agent', action: 'assignment_updated', detail: { status: 'completed' }, createdAt: isoMinutesAgo(20) },
  ],
  reports:[
    {id:'mock-report-scout',canvasId:MOCK_LEARNING_CANVAS_ID,assignmentId:'mock-assignment-scout',authorAgentId:'mock-scout',executionRole:'specialist',schemaVersion:'learning_report_v1',finding:'长期行为除特征分解外还依赖不可约与非周期条件。',evidenceRefs:[{kind:'frame',id:'mock-frame-source'}],confidence:.94,unresolved:[],nextStep:'由 Forge 用数值实验验证条件变化。',verifiesReportId:null,disconfirmingChecks:[],verdict:null,consumedReportIds:[],conflictResolution:[],createdAt:isoMinutesAgo(20)},
    {id:'mock-report-forge',canvasId:MOCK_LEARNING_CANVAS_ID,assignmentId:'mock-assignment-forge',authorAgentId:'mock-forge',executionRole:'specialist',schemaVersion:'learning_report_v1',finding:'特征分解与直接迭代得到相同稳态分布 [0.6, 0.4]。',evidenceRefs:[{kind:'frame',id:'mock-frame-experiment'}],confidence:.96,unresolved:['尚待独立反例检查'],nextStep:'请 Trace 改变初始分布并检查周期链反例。',verifiesReportId:null,disconfirmingChecks:[],verdict:null,consumedReportIds:[],conflictResolution:[],createdAt:isoMinutesAgo(3)},
    {id:'mock-report-trace',canvasId:MOCK_LEARNING_CANVAS_ID,assignmentId:'mock-assignment-trace',authorAgentId:'mock-trace',executionRole:'verifier',schemaVersion:'learning_report_v1',finding:'当前数值结论可复现，但不能推广到周期链。',evidenceRefs:[{kind:'report',id:'mock-report-forge'}],confidence:.91,unresolved:[],nextStep:'在学习者迁移项目中明确适用条件。',verifiesReportId:'mock-report-forge',disconfirmingChecks:['使用二状态周期链检查极限不存在','更换三个初始分布重复迭代'],verdict:'supported',consumedReportIds:[],conflictResolution:[],createdAt:isoMinutesAgo(1)},
    {id:'mock-report-reporter',canvasId:MOCK_LEARNING_CANVAS_ID,assignmentId:null,authorAgentId:'mock-forge',executionRole:'reporter',schemaVersion:'learning_report_v1',finding:'综合来源、实验与复核：所选链收敛到 [0.6, 0.4]，结论仅在已核验条件内成立。',evidenceRefs:[{kind:'report',id:'mock-report-scout'},{kind:'report',id:'mock-report-forge'},{kind:'report',id:'mock-report-trace'}],confidence:.92,unresolved:['等级 4 仍等待教师确认'],nextStep:'学习者完成周期链反例反思后提交教师审核。',verifiesReportId:null,disconfirmingChecks:[],verdict:null,consumedReportIds:['mock-report-scout','mock-report-forge','mock-report-trace'],conflictResolution:['保留 Trace 的周期链反例，缩小 Forge 结论的适用范围，不做置信度平均。'],createdAt:updatedAt},
  ],
}

const catalog: Record<string, CanvasSnapshot> = { [initialCanvas.id]: initialCanvas }

function summary(snapshot: CanvasSnapshot): CanvasWorkspaceSummary {
  return {
    id: snapshot.id, title: snapshot.title, goal: snapshot.goal, conversationId: snapshot.conversationId,
    initiatorAgentId: snapshot.initiatorAgentId, status: snapshot.status, origin: snapshot.origin,
    frameCount: snapshot.frames.length, assignmentCount: snapshot.assignments.length,
    updatedAt: snapshot.updatedAt, createdAt: snapshot.createdAt,
  }
}

function activeSnapshot(): CanvasSnapshot {
  return useCanvas.getState().snapshot ?? initialCanvas
}

function replaceSnapshot(next: CanvasSnapshot): void {
  catalog[next.id] = next
  useCanvas.setState((state) => ({
    snapshot: next,
    previews: { ...state.previews, [next.id]: next },
    workspaces: [summary(next)],
    activeCanvasId: next.id,
  }))
}

const frameDefaults: Record<CanvasFrameType, { title: string; content: string; width: number; height: number }> = {
  markdown: { title: '学习笔记', content: '# 新学习笔记', width: 420, height: 300 },
  html: { title: '学习成果预览', content: '<main><h1>学习成果</h1></main>', width: 520, height: 360 },
  document: { title: '课程文档', content: '', width: 420, height: 280 },
  image: { title: '学习图像', content: '', width: 420, height: 320 },
  artifact: { title: '实验产物', content: '', width: 460, height: 300 },
}

export function seedMockLearningCanvas(): void {
  useCanvas.setState({
    snapshot: initialCanvas,
    previews: { [initialCanvas.id]: initialCanvas },
    workspaces: [summary(initialCanvas)],
    activeCanvasId: initialCanvas.id,
    loading: false,
    error: null,
    selectedFrameId: null,
    liveCards: { [initialCanvas.id]: { status: initialCanvas.status, frameIds: initialCanvas.frames.map((frame) => frame.id), assignments: initialCanvas.assignments } },
    load: async (canvasId) => {
      const target = catalog[canvasId ?? useCanvas.getState().activeCanvasId ?? initialCanvas.id] ?? initialCanvas
      replaceSnapshot(target)
    },
    loadPreview: async (canvasId) => {
      const target = catalog[canvasId]
      if (target) useCanvas.setState((state) => ({ previews: { ...state.previews, [canvasId]: target } }))
    },
    loadWorkspaces: async (conversationId) => {
      useCanvas.setState({ workspaces: Object.values(catalog).filter((item) => !conversationId || item.conversationId === conversationId).map(summary), error: null })
    },
    createForConversation: async (conversationId) => {
      const existing = Object.values(catalog).find((item) => item.conversationId === conversationId)
      if (existing) { replaceSnapshot(existing); return existing }
      const createdAt = new Date().toISOString()
      const created: CanvasSnapshot = {
        ...initialCanvas, id: `mock-learning-canvas-${Date.now()}`, conversationId, title: '学习协作画布',
        goal: '汇聚课程问题、学习证据和教学智能体报告。', initiatorAgentId: null,
        summary: '协作画布已创建，等待第一张学习卡片。', createdAt, updatedAt: createdAt,
        frames: [], assignments: [], presence: [], comments: [], activity: [],reports:[],
      }
      replaceSnapshot(created)
      return created
    },
    createFrame: async (type, at = { x: 120, y: 120 }) => {
      const snapshot = activeSnapshot()
      const preset = frameDefaults[type]
      const placement = findCanvasPlacement(snapshot.frames, preset, at)
      const createdAt = new Date().toISOString()
      const frame: CanvasFrame = {
        id: `mock-learning-frame-${Date.now()}`, canvasId: snapshot.id, type, title: preset.title,
        x: placement.x, y: placement.y, width: preset.width, height: preset.height,
        content: preset.content, data: {}, revision: 1, createdBy: MOCK_USER_ID, updatedBy: MOCK_USER_ID, createdAt, updatedAt: createdAt,
      }
      replaceSnapshot({ ...snapshot, frames: [...snapshot.frames, frame], updatedAt: createdAt })
      useCanvas.setState({ selectedFrameId: frame.id })
      return frame
    },
    updateFrame: async (id, patch) => {
      const snapshot = activeSnapshot()
      const current = snapshot.frames.find((frame) => frame.id === id)
      if (!current) throw new Error('Mock learning Canvas frame not found')
      const changedAt = new Date().toISOString()
      const updated: CanvasFrame = { ...current, ...patch, revision: current.revision + 1, updatedBy: MOCK_USER_ID, updatedAt: changedAt }
      replaceSnapshot({ ...snapshot, frames: snapshot.frames.map((frame) => frame.id === id ? updated : frame), updatedAt: changedAt })
      return updated
    },
    deleteFrame: async (id) => {
      const snapshot = activeSnapshot()
      replaceSnapshot({ ...snapshot, frames: snapshot.frames.filter((frame) => frame.id !== id), updatedAt: new Date().toISOString() })
      if (useCanvas.getState().selectedFrameId === id) useCanvas.setState({ selectedFrameId: null })
    },
    setStatus: async (status, frameId = null, cursor) => {
      const snapshot = activeSnapshot(); const changedAt = new Date().toISOString()
      replaceSnapshot({ ...snapshot, presence: [
        { participantId: MOCK_USER_ID, participantKind: 'user', status, frameId, color: '#3390ec', cursorX: cursor?.x ?? null, cursorY: cursor?.y ?? null, lastSeenAt: changedAt },
        ...snapshot.presence.filter((item) => item.participantId !== MOCK_USER_ID),
      ] })
    },
    addComment: async (body, frameId = null) => {
      const snapshot = activeSnapshot(); const createdAt = new Date().toISOString()
      const comment: CanvasComment = { id: `mock-learning-comment-${Date.now()}`, canvasId: snapshot.id, frameId, authorId: MOCK_USER_ID, authorKind: 'user', body, createdAt }
      const activity: CanvasActivity = { id: `mock-learning-activity-${Date.now()}`, canvasId: snapshot.id, frameId, actorId: MOCK_USER_ID, actorKind: 'user', action: 'comment_created', detail: {}, createdAt }
      replaceSnapshot({ ...snapshot, comments: [comment, ...snapshot.comments], activity: [activity, ...snapshot.activity], updatedAt: createdAt })
    },
    steerAgent: async (agentId, text) => {
      const snapshot = activeSnapshot(); const changedAt = new Date().toISOString()
      replaceSnapshot({ ...snapshot, presence: snapshot.presence.map((item) => item.participantId === agentId ? { ...item, status: `收到学习者反馈：${text}`, lastSeenAt: changedAt } : item), updatedAt: changedAt })
    },
    assignAgent: async (agentId, assignment) => {
      const snapshot = activeSnapshot(); const changedAt = new Date().toISOString()
      const current = snapshot.assignments.find((item) => item.agentId === agentId)
      const next = current
        ? { ...current, assignment, status: 'working' as const, result: null, error: null, completedAt: null, startedAt: current.startedAt ?? changedAt, updatedAt: changedAt }
        : { id: `mock-assignment-${agentId}`, canvasId: snapshot.id, agentId, assignment, color: '#0ea5e9', status: 'working' as const, workArea: { x: 820, y: 490, width: 520, height: 360 }, activeFrameId: null, cursor: null, workId: `mock-work-${Date.now()}`, dependsOnAgentIds: [],executionRole:'specialist' as const,verifiesAssignmentId:null,result: null, error: null, startedAt: changedAt, completedAt: null, updatedAt: changedAt }
      replaceSnapshot({ ...snapshot, assignments: [...snapshot.assignments.filter((item) => item.agentId !== agentId), next], updatedAt: changedAt })
    },
    stopAgent: async (agentId) => {
      const snapshot = activeSnapshot(); const changedAt = new Date().toISOString()
      replaceSnapshot({ ...snapshot, assignments: snapshot.assignments.map((item) => item.agentId === agentId ? { ...item, status: 'cancelled', completedAt: changedAt, updatedAt: changedAt } : item), presence: snapshot.presence.filter((item) => item.participantId !== agentId), updatedAt: changedAt })
    },
    stopWorkspace: async () => {
      const snapshot = activeSnapshot(); const changedAt = new Date().toISOString()
      replaceSnapshot({ ...snapshot, status: 'stopped', assignments: snapshot.assignments.map((item) => ['completed', 'failed', 'cancelled'].includes(item.status) ? item : { ...item, status: 'cancelled', completedAt: changedAt, updatedAt: changedAt }), presence: snapshot.presence.filter((item) => item.participantKind === 'user'), updatedAt: changedAt })
    },
  })
}
