import { findCanvasPlacement } from '@/lib/canvasLayout'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import { useCanvas } from '@/stores/canvas'
import { useConversations } from '@/stores/conversations'
import { useMessages, VIRTUOSO_FIRST_INDEX_BASE } from '@/stores/messages'
import { useParticipants } from '@/stores/participants'
import type {
  CanvasActivity,
  CanvasComment,
  CanvasFrame,
  CanvasSnapshot,
  CanvasWorkspaceSummary,
  Conversation,
  Message,
  Participant,
} from '@/types'

const ME_ID = 'mock-me'
const DEFAULT_CONVERSATION_ID = 'mock-general'
const MOCK_CANVAS_ID = 'mock-product-canvas'

const participants: Participant[] = [
  {
    id: ME_ID,
    kind: 'human',
    name: '林曦',
    initial: '林',
    avatarBg: 'linear-gradient(135deg, #60a5fa, #2563eb)',
    status: 'avail',
    bio: 'LingxiLoop 本地开发账号',
    email: 'dev@localhost',
  },
  {
    id: 'mock-nova',
    kind: 'agent',
    name: 'Nova',
    role: '研究与规划',
    initial: 'N',
    avatarBg: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
    status: 'working',
    statusUpdatedAt: new Date().toISOString(),
    bio: '梳理信息、拆解任务并形成可执行计划。',
    tools: ['ipython', 'web', 'documents'],
    capabilities: ['canvas', 'web', 'documents', 'files'],
  },
  {
    id: 'mock-iris',
    kind: 'agent',
    name: 'Iris',
    role: '产品设计',
    initial: 'I',
    avatarBg: 'linear-gradient(135deg, #fb7185, #db2777)',
    status: 'avail',
    bio: '负责产品体验、界面设计和交互细节。',
    tools: ['ipython', 'figma', 'documents'],
    capabilities: ['canvas', 'documents', 'files'],
  },
  {
    id: 'mock-echo', kind: 'agent', name: 'Echo', role: '内容编辑', initial: 'E',
    avatarBg: 'linear-gradient(135deg, #38bdf8, #0284c7)', status: 'thinking', statusUpdatedAt: new Date().toISOString(),
    bio: '负责文档内容和表达一致性。', tools: ['ipython', 'documents'], capabilities: ['canvas', 'documents', 'files'],
  },
  {
    id: 'mock-mica', kind: 'agent', name: 'Mica', role: '视觉设计', initial: 'M',
    avatarBg: 'linear-gradient(135deg, #f59e0b, #d97706)', status: 'working', statusUpdatedAt: new Date().toISOString(),
    bio: '负责图像、配色和主题质量。', tools: ['ipython', 'images'], capabilities: ['canvas', 'files'],
  },
  {
    id: 'mock-sol', kind: 'agent', name: 'Sol', role: '质量验证', initial: 'S',
    avatarBg: 'linear-gradient(135deg, #34d399, #059669)', status: 'avail', statusUpdatedAt: new Date().toISOString(),
    bio: '负责响应式与交互回归。', tools: ['ipython', 'browser'], capabilities: ['canvas', 'web'],
  },
  {
    id: 'mock-kite', kind: 'agent', name: 'Kite', role: '前端实现', initial: 'K',
    avatarBg: 'linear-gradient(135deg, #fb7185, #e11d48)', status: 'waiting', statusUpdatedAt: new Date().toISOString(),
    bio: '负责画布交互和浏览器兼容性。', tools: ['ipython', 'browser'], capabilities: ['canvas', 'web', 'files'],
  },
]

const now = new Date()
const isoMinutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString()
const timeMinutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)
  .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
const mockCanvasImage = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dbeafe"/><stop offset="1" stop-color="#ede9fe"/></linearGradient></defs>
    <rect width="720" height="520" rx="28" fill="url(#bg)"/>
    <circle cx="112" cy="112" r="46" fill="#7c3aed" opacity=".9"/><circle cx="608" cy="112" r="46" fill="#db2777" opacity=".9"/>
    <path d="M158 112h404M360 158v116" stroke="#64748b" stroke-width="5" stroke-linecap="round" opacity=".45"/>
    <rect x="120" y="274" width="480" height="154" rx="24" fill="white" opacity=".94"/>
    <text x="360" y="337" text-anchor="middle" font-family="system-ui,sans-serif" font-size="30" font-weight="700" fill="#172033">智能体协作结果</text>
    <text x="360" y="382" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" fill="#64748b">研究 · 设计 · 响应式验收</text>
  </svg>
`)}`

const conversations: Conversation[] = [
  {
    id: DEFAULT_CONVERSATION_ID,
    kind: 'group',
    title: '产品协作群',
    subtitle: '7 位成员',
    topic: 'LingxiLoop 本地 mock 会话',
    members: [ME_ID, 'mock-nova', 'mock-iris', 'mock-echo', 'mock-mica', 'mock-sol', 'mock-kite'],
    leaderId: 'mock-nova',
    pinned: true,
    unread: 0,
    lastAt: timeMinutesAgo(2),
    lastAtIso: isoMinutesAgo(2),
    preview: 'Nova：画布工作区已经就绪。',
    tag: 'team',
  },
  {
    id: 'mock-nova-dm',
    kind: 'direct',
    title: 'Nova',
    subtitle: '研究与规划',
    members: [ME_ID, 'mock-nova'],
    leaderId: 'mock-nova',
    unread: 2,
    lastAt: timeMinutesAgo(18),
    lastAtIso: isoMinutesAgo(18),
    preview: '需要我继续展开竞品分析吗？',
    tag: 'human',
  },
  {
    id: 'mock-design',
    kind: 'group',
    title: '设计评审',
    subtitle: 'Iris、Nova',
    members: [ME_ID, 'mock-iris', 'mock-nova'],
    leaderId: 'mock-iris',
    unread: 0,
    lastAt: '昨天',
    lastAtIso: isoMinutesAgo(1_440),
    preview: 'Iris：交互稿已经更新。',
  },
]

function message(input: Message & { sequence: number }): Message {
  return input
}

const messagesByConversation: Record<string, Message[]> = {
  [DEFAULT_CONVERSATION_ID]: [
    message({ id: 'mock-m1', conversationId: DEFAULT_CONVERSATION_ID, authorId: 'mock-nova', kind: 'text', body: '早上好，我已经把昨天的讨论整理成了三个执行步骤。', at: timeMinutesAgo(32), sequence: 1 }),
    message({ id: 'mock-m2', conversationId: DEFAULT_CONVERSATION_ID, authorId: ME_ID, kind: 'text', body: '先把核心流程跑通，再处理视觉细节。', at: timeMinutesAgo(27), reactions: [{ emoji: '👍', count: 2, mine: true, users: [ME_ID, 'mock-iris'] }], sequence: 2 }),
    message({ id: 'mock-m3', conversationId: DEFAULT_CONVERSATION_ID, authorId: 'mock-iris', kind: 'text', body: '收到。我会保留现有头像和 Agent 工作动效，其余部分先不改样式。', at: timeMinutesAgo(20), sequence: 3 }),
    message({
      id: 'mock-canvas-message',
      conversationId: DEFAULT_CONVERSATION_ID,
      authorId: 'mock-nova',
      kind: 'canvas',
      body: '',
      at: timeMinutesAgo(7),
      canvas: {
        canvasId: MOCK_CANVAS_ID,
        title: '即时通讯体验打磨',
        goal: '在同一块协作画布上完成会话列表、消息区与响应式交互的设计收敛。',
        status: 'active',
        members: [
          { agentId: 'mock-nova', assignment: '梳理信息架构与响应式规则', color: '#7c3aed', status: 'working' },
          { agentId: 'mock-iris', assignment: '完成高保真界面与交互说明', color: '#db2777', status: 'working' },
        ],
        frameCount: 4,
      },
      sequence: 4,
    }),
    message({ id: 'mock-m4', conversationId: DEFAULT_CONVERSATION_ID, authorId: 'mock-nova', kind: 'text', body: '画布已经挂在会话上下文中，点击上面的卡片即可展开并拖动查看。', at: timeMinutesAgo(2), quotedMessageId: 'mock-m2', quoted: { id: 'mock-m2', authorId: ME_ID, authorName: '林曦', kind: 'text', body: '先把核心流程跑通，再处理视觉细节。', sequence: 2 }, sequence: 5 }),
  ],
  'mock-nova-dm': [
    message({ id: 'mock-dm1', conversationId: 'mock-nova-dm', authorId: 'mock-nova', kind: 'text', body: '我准备了一份简短的竞品分析提纲。', at: timeMinutesAgo(26), sequence: 1 }),
    message({ id: 'mock-dm2', conversationId: 'mock-nova-dm', authorId: 'mock-nova', kind: 'text', body: '需要我继续展开吗？', at: timeMinutesAgo(18), sequence: 2 }),
  ],
  'mock-design': [
    message({ id: 'mock-design1', conversationId: 'mock-design', authorId: 'mock-iris', kind: 'text', body: '交互稿已经更新，重点检查消息区高度和底部输入框。', at: '昨天 16:40', sequence: 1 }),
  ],
}

const canvasUpdatedAt = isoMinutesAgo(1)

const mockCanvas: CanvasSnapshot = {
  id: MOCK_CANVAS_ID,
  title: '即时通讯体验打磨',
  companyId: 'mock-workspace',
  conversationId: DEFAULT_CONVERSATION_ID,
  triggerClientMsgNo: null,
  goal: '在同一块协作画布上完成会话列表、消息区与响应式交互的设计收敛。',
  initiatorAgentId: 'mock-nova',
  status: 'active',
  origin: 'mock',
  summary: '信息架构已经完成，正在并行收敛视觉细节和窄屏响应式行为。',
  createdBy: ME_ID,
  createdAt: isoMinutesAgo(48),
  updatedAt: canvasUpdatedAt,
  frames: [
    {
      id: 'mock-frame-brief', canvasId: MOCK_CANVAS_ID, type: 'markdown', title: '体验目标',
      x: 70, y: 80, width: 420, height: 330,
      content: '# 即时通讯优先体验目标\n\n- 侧栏密度贴近参考会话应用\n- 消息区始终保持稳定高度\n- 画布作为会话内上下文展开\n- 窄屏保持列表 → 对话 → 详情导航',
      data: {}, revision: 3, createdBy: 'mock-nova', updatedBy: 'mock-nova',
      createdAt: isoMinutesAgo(44), updatedAt: isoMinutesAgo(6),
    },
    {
      id: 'mock-frame-preview', canvasId: MOCK_CANVAS_ID, type: 'html', title: '会话界面预览',
      x: 550, y: 80, width: 540, height: 370,
      content: '<style>*{box-sizing:border-box}body{margin:0;font:14px system-ui;background:#dbeafe;color:#172033}.app{height:100vh;display:grid;grid-template-columns:38% 1fr;background:#fff}.list{padding:14px;border-right:1px solid #d9e2ec}.search{height:38px;border-radius:22px;background:#eef3f7;padding:10px 14px;color:#728197}.row{display:flex;gap:10px;padding:11px 8px;margin-top:8px;border-radius:12px}.row.active{background:#3390ec;color:#fff}.avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#a78bfa,#7c3aed)}.chat{display:flex;flex-direction:column;background:linear-gradient(#e4eff8,#d9e8f3)}header{height:58px;padding:18px;background:#fff;font-weight:700}.messages{flex:1;padding:28px}.bubble{width:72%;padding:10px 13px;border-radius:16px 16px 16px 5px;background:#fff;box-shadow:0 1px 2px #7892a633}.bubble.me{margin:14px 0 0 auto;background:#d9fdd3;border-radius:16px 16px 5px 16px}.composer{margin:12px;padding:12px 16px;border-radius:22px;background:#fff;color:#8a98a8}</style><div class="app"><div class="list"><div class="search">⌕ 搜索</div><div class="row active"><div class="avatar"></div><div><b>产品协作群</b><br><small>画布工作区已经就绪</small></div></div><div class="row"><div class="avatar"></div><div><b>Nova</b><br><small>需要我继续展开吗？</small></div></div></div><div class="chat"><header>产品协作群</header><div class="messages"><div class="bubble">画布预览已经完成。</div><div class="bubble me">继续收敛响应式布局。</div></div><div class="composer">输入消息…</div></div></div>',
      data: {}, revision: 5, createdBy: 'mock-iris', updatedBy: 'mock-iris',
      createdAt: isoMinutesAgo(38), updatedAt: isoMinutesAgo(3),
    },
    {
      id: 'mock-frame-document', canvasId: MOCK_CANVAS_ID, type: 'document', title: '交互说明',
      x: 70, y: 490, width: 340, height: 270,
      content: '点击会话内的画布卡片后，画布直接替代对话区。\n\n空白处右键可继续 @ 智能体，或新增任意类型的卡片。',
      data: { documentId: 'mock-canvas-spec' }, revision: 1, createdBy: 'mock-nova', updatedBy: 'mock-nova',
      createdAt: isoMinutesAgo(18), updatedAt: isoMinutesAgo(4),
    },
    {
      id: 'mock-frame-image', canvasId: MOCK_CANVAS_ID, type: 'image', title: '协作关系图',
      x: 450, y: 490, width: 360, height: 270,
      content: mockCanvasImage,
      data: { alt: '智能体协作关系图' }, revision: 1, createdBy: 'mock-iris', updatedBy: 'mock-iris',
      createdAt: isoMinutesAgo(15), updatedAt: isoMinutesAgo(2),
    },
  ],
  assignments: [
    {
      id: 'mock-assignment-nova', canvasId: MOCK_CANVAS_ID, agentId: 'mock-nova',
      assignment: '梳理信息架构与响应式规则', color: '#7c3aed', status: 'working',
      workArea: { x: 40, y: 45, width: 490, height: 405 }, activeFrameId: 'mock-frame-brief',
      cursor: { x: 455, y: 155 }, workId: 'mock-work-nova', dependsOnAgentIds: [], result: null, error: null,
      startedAt: isoMinutesAgo(42), completedAt: null, updatedAt: isoMinutesAgo(2),
    },
    {
      id: 'mock-assignment-iris', canvasId: MOCK_CANVAS_ID, agentId: 'mock-iris',
      assignment: '完成界面预览和验收清单', color: '#db2777', status: 'working',
      workArea: { x: 525, y: 45, width: 610, height: 750 }, activeFrameId: 'mock-frame-preview',
      cursor: { x: 1010, y: 390 }, workId: 'mock-work-iris', dependsOnAgentIds: [], result: null, error: null,
      startedAt: isoMinutesAgo(36), completedAt: null, updatedAt: canvasUpdatedAt,
    },
    {
      id: 'mock-assignment-echo', canvasId: MOCK_CANVAS_ID, agentId: 'mock-echo',
      assignment: '校对文档表达与信息层级', color: '#0284c7', status: 'waiting',
      workArea: { x: 40, y: 455, width: 390, height: 335 }, activeFrameId: 'mock-frame-document', cursor: null, workId: 'mock-work-echo', dependsOnAgentIds: ['mock-nova'], result: null, error: null,
      startedAt: isoMinutesAgo(20), completedAt: null, updatedAt: isoMinutesAgo(3),
    },
    {
      id: 'mock-assignment-mica', canvasId: MOCK_CANVAS_ID, agentId: 'mock-mica',
      assignment: '调整图像和深浅主题配色', color: '#d97706', status: 'working',
      workArea: { x: 420, y: 455, width: 420, height: 335 }, activeFrameId: 'mock-frame-image', cursor: null, workId: 'mock-work-mica', dependsOnAgentIds: ['mock-iris'], result: null, error: null,
      startedAt: isoMinutesAgo(18), completedAt: null, updatedAt: isoMinutesAgo(1),
    },
    {
      id: 'mock-assignment-sol', canvasId: MOCK_CANVAS_ID, agentId: 'mock-sol',
      assignment: '执行宽屏与窄屏回归验证', color: '#059669', status: 'completed',
      workArea: { x: 40, y: 45, width: 490, height: 405 }, activeFrameId: 'mock-frame-brief', cursor: null, workId: 'mock-work-sol', dependsOnAgentIds: [], result: '基础验证完成', error: null,
      startedAt: isoMinutesAgo(16), completedAt: isoMinutesAgo(4), updatedAt: isoMinutesAgo(4),
    },
    {
      id: 'mock-assignment-kite', canvasId: MOCK_CANVAS_ID, agentId: 'mock-kite',
      assignment: '检查滚动、缩放和自动保存', color: '#e11d48', status: 'blocked',
      workArea: { x: 525, y: 45, width: 610, height: 750 }, activeFrameId: 'mock-frame-preview', cursor: null, workId: 'mock-work-kite', dependsOnAgentIds: ['mock-sol'], result: null, error: '等待窄屏验收',
      startedAt: isoMinutesAgo(12), completedAt: null, updatedAt: isoMinutesAgo(2),
    },
  ],
  presence: [
    { participantId: ME_ID, participantKind: 'user', status: 'viewing', frameId: null, color: '#3390ec', cursorX: 620, cursorY: 520, lastSeenAt: canvasUpdatedAt },
    { participantId: 'mock-nova', participantKind: 'agent', status: '正在核对信息架构与任务依赖', frameId: 'mock-frame-brief', color: '#7c3aed', cursorX: 455, cursorY: 155, lastSeenAt: canvasUpdatedAt },
    { participantId: 'mock-iris', participantKind: 'agent', status: '正在观察预览并修正窄屏布局', frameId: 'mock-frame-preview', color: '#db2777', cursorX: 1010, cursorY: 390, lastSeenAt: canvasUpdatedAt },
  ],
  comments: [
    { id: 'mock-comment-1', canvasId: MOCK_CANVAS_ID, frameId: 'mock-frame-preview', authorId: ME_ID, authorKind: 'user', body: '继续贴近 Telegram Web A 的密度。', createdAt: isoMinutesAgo(5) },
  ],
  activity: [
    { id: 'mock-activity-2', canvasId: MOCK_CANVAS_ID, frameId: 'mock-frame-preview', actorId: 'mock-iris', actorKind: 'agent', action: 'agent.status', detail: { status: '正在观察预览并修正窄屏布局' }, createdAt: isoMinutesAgo(2) },
    { id: 'mock-activity-3', canvasId: MOCK_CANVAS_ID, frameId: 'mock-frame-brief', actorId: 'mock-nova', actorKind: 'agent', action: 'frame.content_appended', detail: { title: '体验目标', revision: 3 }, createdAt: isoMinutesAgo(6) },
    { id: 'mock-activity-4', canvasId: MOCK_CANVAS_ID, frameId: 'mock-frame-preview', actorId: ME_ID, actorKind: 'user', action: 'comment.created', detail: {}, createdAt: isoMinutesAgo(5) },
  ],
}

const mockCanvasSummary: CanvasWorkspaceSummary = {
  id: mockCanvas.id,
  title: mockCanvas.title,
  goal: mockCanvas.goal,
  conversationId: mockCanvas.conversationId,
  initiatorAgentId: mockCanvas.initiatorAgentId,
  status: mockCanvas.status,
  origin: mockCanvas.origin,
  frameCount: mockCanvas.frames.length,
  assignmentCount: mockCanvas.assignments.length,
  updatedAt: mockCanvas.updatedAt,
  createdAt: mockCanvas.createdAt,
}

function seedMockCanvas(): void {
  useCanvas.setState({
    snapshot: mockCanvas,
    previews: { [MOCK_CANVAS_ID]: mockCanvas },
    workspaces: [mockCanvasSummary],
    activeCanvasId: MOCK_CANVAS_ID,
    loading: false,
    error: null,
    selectedFrameId: null,
    liveCards: {
      [MOCK_CANVAS_ID]: {
        status: mockCanvas.status,
        frameIds: mockCanvas.frames.map((frame) => frame.id),
        assignments: mockCanvas.assignments,
      },
    },
    load: async () => {
      useCanvas.setState((state) => ({ snapshot: state.snapshot ?? mockCanvas, previews: { ...state.previews, [MOCK_CANVAS_ID]: state.snapshot ?? mockCanvas }, activeCanvasId: MOCK_CANVAS_ID, loading: false, error: null }))
    },
    loadPreview: async () => {
      useCanvas.setState((state) => ({ previews: { ...state.previews, [MOCK_CANVAS_ID]: state.snapshot ?? mockCanvas } }))
    },
    loadWorkspaces: async () => {
      useCanvas.setState({ workspaces: [mockCanvasSummary], error: null })
    },
    createFrame: async (type, at = { x: 120, y: 120 }) => {
      const createdAt = new Date().toISOString()
      const size = { width: 420, height: 280 }
      const placement = findCanvasPlacement(useCanvas.getState().snapshot?.frames ?? [], size, at)
      const frame: CanvasFrame = {
        id: `mock-frame-${Date.now()}`, canvasId: MOCK_CANVAS_ID, type,
        title: `New ${type}`, x: placement.x, y: placement.y, ...size,
        content: type === 'markdown' ? '# New idea\n\nThis frame lives in local mock state.' : '',
        data: {}, revision: 1, createdBy: ME_ID, updatedBy: ME_ID, createdAt, updatedAt: createdAt,
      }
      useCanvas.setState((state) => ({
        selectedFrameId: frame.id,
        snapshot: state.snapshot ? { ...state.snapshot, frames: [...state.snapshot.frames, frame] } : state.snapshot,
        previews: state.previews[MOCK_CANVAS_ID]
          ? { ...state.previews, [MOCK_CANVAS_ID]: { ...state.previews[MOCK_CANVAS_ID], frames: [...state.previews[MOCK_CANVAS_ID].frames, frame] } }
          : state.previews,
      }))
      return frame
    },
    updateFrame: async (id, patch) => {
      let updated: CanvasFrame | undefined
      const changedAt = new Date().toISOString()
      useCanvas.setState((state) => ({
        snapshot: state.snapshot ? {
          ...state.snapshot,
          frames: state.snapshot.frames.map((frame) => {
            if (frame.id !== id) return frame
            updated = { ...frame, ...patch, revision: frame.revision + 1, updatedBy: ME_ID, updatedAt: changedAt }
            return updated
          }),
          activity: [{ id: `mock-activity-${Date.now()}`, canvasId: MOCK_CANVAS_ID, frameId: id, actorId: ME_ID, actorKind: 'user', action: 'frame.updated', detail: { title: state.snapshot.frames.find((frame) => frame.id === id)?.title }, createdAt: changedAt }, ...state.snapshot.activity],
          updatedAt: changedAt,
        } : state.snapshot,
        previews: updated && state.previews[MOCK_CANVAS_ID]
          ? { ...state.previews, [MOCK_CANVAS_ID]: { ...state.previews[MOCK_CANVAS_ID], frames: state.previews[MOCK_CANVAS_ID].frames.map((frame) => frame.id === id ? updated! : frame) } }
          : state.previews,
      }))
      if (!updated) throw new Error('Mock Canvas frame not found')
      return updated
    },
    deleteFrame: async (id) => {
      useCanvas.setState((state) => ({
        selectedFrameId: state.selectedFrameId === id ? null : state.selectedFrameId,
        snapshot: state.snapshot ? { ...state.snapshot, frames: state.snapshot.frames.filter((frame) => frame.id !== id) } : state.snapshot,
        previews: state.previews[MOCK_CANVAS_ID]
          ? { ...state.previews, [MOCK_CANVAS_ID]: { ...state.previews[MOCK_CANVAS_ID], frames: state.previews[MOCK_CANVAS_ID].frames.filter((frame) => frame.id !== id) } }
          : state.previews,
      }))
    },
    setStatus: async (status, frameId = null, cursor) => {
      const changedAt = new Date().toISOString()
      useCanvas.setState((state) => state.snapshot ? { snapshot: { ...state.snapshot, presence: [
        { participantId: ME_ID, participantKind: 'user', status, frameId, color: '#3390ec', cursorX: cursor?.x ?? null, cursorY: cursor?.y ?? null, lastSeenAt: changedAt },
        ...state.snapshot.presence.filter((item) => item.participantId !== ME_ID),
      ] } } : {})
    },
    addComment: async (body, frameId = null) => {
      const createdAt = new Date().toISOString()
      const comment: CanvasComment = { id: `mock-comment-${Date.now()}`, canvasId: MOCK_CANVAS_ID, frameId, authorId: ME_ID, authorKind: 'user', body, createdAt }
      const activity: CanvasActivity = { id: `mock-activity-${Date.now()}`, canvasId: MOCK_CANVAS_ID, frameId, actorId: ME_ID, actorKind: 'user', action: 'comment.created', detail: {}, createdAt }
      useCanvas.setState((state) => state.snapshot ? { snapshot: { ...state.snapshot, comments: [comment, ...state.snapshot.comments], activity: [activity, ...state.snapshot.activity], updatedAt: createdAt } } : {})
    },
    steerAgent: async (agentId, text) => {
      const createdAt = new Date().toISOString()
      const target = useCanvas.getState().snapshot?.assignments.find((item) => item.agentId === agentId)
      const activity: CanvasActivity = { id: `mock-activity-${Date.now()}`, canvasId: MOCK_CANVAS_ID, frameId: target?.activeFrameId ?? null, actorId: ME_ID, actorKind: 'user', action: 'agent.steered', detail: { text, agentId }, createdAt }
      useCanvas.setState((state) => state.snapshot ? { snapshot: {
        ...state.snapshot,
        presence: state.snapshot.presence.map((item) => item.participantId === agentId ? { ...item, status: `收到反馈：${text}`, lastSeenAt: createdAt } : item),
        activity: [activity, ...state.snapshot.activity],
        updatedAt: createdAt,
      } } : {})
    },
    assignAgent: async (agentId, assignment) => {
      const createdAt = new Date().toISOString()
      useCanvas.setState((state) => {
        if (!state.snapshot) return {}
        const current = state.snapshot.assignments.find((item) => item.agentId === agentId)
        const nextAssignment = current
          ? { ...current, assignment, status: 'working' as const, result: null, error: null, completedAt: null, startedAt: current.startedAt ?? createdAt, updatedAt: createdAt }
          : {
            id: `mock-assignment-${agentId}`, canvasId: MOCK_CANVAS_ID, agentId, assignment,
            color: '#0ea5e9', status: 'working' as const,
            workArea: { x: 820, y: 490, width: 520, height: 360 }, activeFrameId: null, cursor: null,
            workId: `mock-work-${Date.now()}`, dependsOnAgentIds: [], result: null, error: null,
            startedAt: createdAt, completedAt: null, updatedAt: createdAt,
          }
        const activity: CanvasActivity = {
          id: `mock-activity-${Date.now()}`, canvasId: MOCK_CANVAS_ID, frameId: current?.activeFrameId ?? null,
          actorId: ME_ID, actorKind: 'user', action: current ? 'assignment.steered' : 'assignment.created',
          detail: { agentId, assignment }, createdAt,
        }
        return { snapshot: {
          ...state.snapshot,
          assignments: [...state.snapshot.assignments.filter((item) => item.agentId !== agentId), nextAssignment],
          presence: [
            { participantId: agentId, participantKind: 'agent', status: `新增工作：${assignment}`, frameId: current?.activeFrameId ?? null, color: nextAssignment.color, cursorX: null, cursorY: null, lastSeenAt: createdAt },
            ...state.snapshot.presence.filter((item) => item.participantId !== agentId),
          ],
          activity: [activity, ...state.snapshot.activity],
          updatedAt: createdAt,
        } }
      })
    },
    stopAgent: async (agentId) => {
      const changedAt = new Date().toISOString()
      useCanvas.setState((state) => state.snapshot ? { snapshot: {
        ...state.snapshot,
        assignments: state.snapshot.assignments.map((item) => item.agentId === agentId ? { ...item, status: 'cancelled', completedAt: changedAt, updatedAt: changedAt } : item),
        presence: state.snapshot.presence.filter((item) => item.participantId !== agentId),
        updatedAt: changedAt,
      } } : {})
    },
    stopWorkspace: async () => {
      const changedAt = new Date().toISOString()
      useCanvas.setState((state) => state.snapshot ? { snapshot: {
        ...state.snapshot,
        status: 'stopped',
        assignments: state.snapshot.assignments.map((item) => ['completed', 'failed', 'cancelled'].includes(item.status) ? item : { ...item, status: 'cancelled', completedAt: changedAt, updatedAt: changedAt }),
        presence: state.snapshot.presence.filter((item) => item.participantKind === 'user'),
        updatedAt: changedAt,
      } } : {})
    },
  })
}

export function seedMockIm(): void {
  if (useAuth.getState().user?.id === ME_ID && useConversations.getState().loaded) return

  useAuth.setState({
    token: 'local-mock-token',
    user: { id: ME_ID, name: '林曦', email: 'dev@localhost', emailVerified: true },
    companies: [{ id: 'mock-workspace', name: 'LingxiLoop 本地工作区', slug: 'local', role: 'owner', tier: 'max' }],
    activeCompanyId: 'mock-workspace',
    ready: true,
    serverCapabilities: null,
  })
  useParticipants.setState({
    byId: Object.fromEntries(participants.map((participant) => [participant.id, participant])),
    loaded: true,
  })
  useConversations.setState({ list: conversations, loaded: true })
  useMessages.setState({
    byConvo: messagesByConversation,
    streaming: {},
    typing: {},
    loaded: new Set(conversations.map((conversation) => conversation.id)),
    loading: new Set(),
    hasMoreOlder: Object.fromEntries(conversations.map((conversation) => [conversation.id, false])),
    loadingOlder: new Set(),
    firstItemIndex: Object.fromEntries(conversations.map((conversation) => [conversation.id, VIRTUOSO_FIRST_INDEX_BASE])),
    errors: {},
  })
  seedMockCanvas()
  const app = useApp.getState()
  if (!app.selectedConversationId) app.selectConversation(DEFAULT_CONVERSATION_ID)
}
