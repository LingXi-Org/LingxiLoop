import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { AppThemeProvider } from '@/components/AppThemeProvider'
import { GlobalInteractionProvider } from '@/components/GlobalInteractionProvider'
import { GroupCanvasPanel } from '@/components/GroupContextContent'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Participant } from '@/types'
import type {
  CanvasFrame,
  CanvasSnapshot,
  CanvasWorkspaceSummary,
} from '@/features/canvas/contracts'
import { CanvasView } from '@/features/canvas/components/CanvasView'
import { useCanvas } from '@/features/canvas/state'
import { useParticipants } from '@/features/agents/state'
import { useSurface } from '@/stores/surface'
import '@/styles/globals.css'

type FixtureEvent = {
  action: 'create' | 'update' | 'delete' | 'comment' | 'assign' | 'steer'
  frameId?: string
  detail?: unknown
}

declare global {
  interface Window {
    canvasFixtureEvents: FixtureEvent[]
  }
}

const NOW = '2026-08-31T08:00:00.000Z'
const CANVAS_ID = 'canvas-fixture'
const CONVERSATION_ID = 'conversation-fixture'

const participants: Record<string, Participant> = {
  'agent-research': {
    id: 'agent-research',
    kind: 'agent',
    name: '小研',
    role: 'researcher',
    initial: '研',
    avatarBg: '#ffe8cc',
    status: 'working',
    statusUpdatedAt: NOW,
    capabilities: ['canvas', 'web'],
  },
  'agent-design': {
    id: 'agent-design',
    kind: 'agent',
    name: '小绘',
    role: 'designer',
    initial: '绘',
    avatarBg: '#d0ebff',
    status: 'avail',
    statusUpdatedAt: NOW,
    capabilities: ['canvas'],
  },
}

const frames: CanvasFrame[] = [
  {
    id: 'frame-notes',
    canvasId: CANVAS_ID,
    type: 'markdown',
    title: '研究结论',
    x: 80,
    y: 80,
    width: 420,
    height: 300,
    content: '# 学习路径\n\n- 先建立共同语言\n- 再用 evidence 验证假设\n- 最后形成可执行结论',
    data: {},
    revision: 3,
    createdBy: 'agent-research',
    updatedBy: 'agent-research',
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'frame-prototype',
    canvasId: CANVAS_ID,
    type: 'html',
    title: '方案草图',
    x: 570,
    y: 130,
    width: 380,
    height: 260,
    content: '<main style="font-family:system-ui;padding:24px"><h1>用户路径</h1><p>这里是用户成果，不继承宿主字体。</p></main>',
    data: {},
    revision: 1,
    createdBy: 'agent-design',
    updatedBy: 'agent-design',
    createdAt: NOW,
    updatedAt: NOW,
  },
]

const snapshot: CanvasSnapshot = {
  id: CANVAS_ID,
  title: '共同研究画布',
  companyId: 'company-fixture',
  conversationId: CONVERSATION_ID,
  triggerClientMsgNo: null,
  goal: '整理一条可以验证的学习路径',
  initiatorAgentId: 'agent-research',
  status: 'active',
  origin: 'conversation',
  summary: null,
  createdBy: 'fixture-user',
  createdAt: NOW,
  updatedAt: NOW,
  frames,
  assignments: [
    {
      id: 'assignment-research',
      canvasId: CANVAS_ID,
      agentId: 'agent-research',
      assignment: '整理证据并归纳结论',
      color: '#e8590c',
      status: 'working',
      workArea: { x: 40, y: 40, width: 480, height: 360 },
      activeFrameId: 'frame-notes',
      cursor: { x: 240, y: 180 },
      workId: 'work-research',
      dependsOnAgentIds: [],
      executionRole: 'specialist',
      verifiesAssignmentId: null,
      result: null,
      error: null,
      startedAt: NOW,
      completedAt: null,
      updatedAt: NOW,
    },
    {
      id: 'assignment-design',
      canvasId: CANVAS_ID,
      agentId: 'agent-design',
      assignment: '制作方案草图',
      color: '#1971c2',
      status: 'completed',
      workArea: { x: 540, y: 80, width: 440, height: 340 },
      activeFrameId: 'frame-prototype',
      cursor: null,
      workId: 'work-design',
      dependsOnAgentIds: [],
      executionRole: 'verifier',
      verifiesAssignmentId: 'assignment-research',
      result: '已完成草图',
      error: null,
      startedAt: NOW,
      completedAt: NOW,
      updatedAt: NOW,
    },
  ],
  presence: [
    {
      participantId: 'agent-research',
      participantKind: 'agent',
      status: '编辑研究结论',
      frameId: 'frame-notes',
      color: '#e8590c',
      cursorX: 240,
      cursorY: 180,
      lastSeenAt: NOW,
    },
  ],
  comments: [],
  activity: [],
  reports: [],
}

const summary: CanvasWorkspaceSummary = {
  id: CANVAS_ID,
  title: snapshot.title,
  goal: snapshot.goal,
  conversationId: CONVERSATION_ID,
  initiatorAgentId: snapshot.initiatorAgentId,
  status: snapshot.status,
  origin: snapshot.origin,
  frameCount: snapshot.frames.length,
  assignmentCount: snapshot.assignments.length,
  updatedAt: NOW,
  createdAt: NOW,
}

window.canvasFixtureEvents = []
const record = (event: FixtureEvent) => window.canvasFixtureEvents.push(event)

function replaceFrame(frameId: string, patch: Partial<CanvasFrame>): CanvasFrame {
  const current = useCanvas.getState().snapshot?.frames.find((frame) => frame.id === frameId)
  if (!current) throw new Error(`Unknown fixture frame: ${frameId}`)
  const next = { ...current, ...patch, revision: current.revision + 1, updatedAt: NOW }
  useCanvas.setState((state) => {
    if (!state.snapshot) return state
    const nextSnapshot = {
      ...state.snapshot,
      frames: state.snapshot.frames.map((frame) => frame.id === frameId ? next : frame),
    }
    return {
      snapshot: nextSnapshot,
      previews: { ...state.previews, [CANVAS_ID]: nextSnapshot },
    }
  })
  return next
}

useParticipants.setState({ byId: participants, loaded: true })
useSurface.setState({ surface: null })
useCanvas.setState({
  snapshot,
  previews: { [CANVAS_ID]: snapshot },
  workspaces: [summary],
  activeCanvasId: CANVAS_ID,
  loading: false,
  error: null,
  selectedFrameId: null,
  load: async () => undefined,
  loadPreview: async () => undefined,
  loadWorkspaces: async () => undefined,
  setStatus: async () => undefined,
  createFrame: async (type, at = { x: 80, y: 80 }) => {
    const frame: CanvasFrame = {
      id: `frame-created-${window.canvasFixtureEvents.length}`,
      canvasId: CANVAS_ID,
      type,
      title: type === 'markdown' ? '文本笔记' : '新卡片',
      x: at.x,
      y: at.y,
      width: 360,
      height: 240,
      content: type === 'markdown' ? '# 新想法' : '',
      data: {},
      revision: 1,
      createdBy: 'fixture-user',
      updatedBy: 'fixture-user',
      createdAt: NOW,
      updatedAt: NOW,
    }
    useCanvas.setState((state) => state.snapshot ? {
      snapshot: { ...state.snapshot, frames: [...state.snapshot.frames, frame] },
      selectedFrameId: frame.id,
    } : state)
    record({ action: 'create', frameId: frame.id, detail: { type, at } })
    return frame
  },
  updateFrame: async (frameId, patch) => {
    const next = replaceFrame(frameId, patch)
    record({ action: 'update', frameId, detail: patch })
    return next
  },
  deleteFrame: async (frameId) => {
    useCanvas.setState((state) => state.snapshot ? {
      snapshot: { ...state.snapshot, frames: state.snapshot.frames.filter((frame) => frame.id !== frameId) },
      selectedFrameId: state.selectedFrameId === frameId ? null : state.selectedFrameId,
    } : state)
    record({ action: 'delete', frameId })
  },
  addComment: async (body, frameId = null) => {
    record({ action: 'comment', frameId: frameId ?? undefined, detail: body })
  },
  assignAgent: async (agentId, assignment) => {
    record({ action: 'assign', detail: { agentId, assignment } })
  },
  steerAgent: async (agentId, text) => {
    record({ action: 'steer', detail: { agentId, text } })
  },
  stopAgent: async () => undefined,
  stopWorkspace: async () => undefined,
})

function CanvasFixture() {
  const surface = useSurface((state) => state.surface)
  const canvasId = surface?.kind === 'canvas' ? surface.canvasId : null
  const [groupOpen, setGroupOpen] = useState(true)

  const dismissDrawer = () => {
    useSurface.getState().closeCanvasPeek()
    setGroupOpen(false)
  }
  const closeCanvasView = () => {
    const closingCanvasId = canvasId
    const closingActiveElement = document.activeElement
    useSurface.getState().closeCanvasPeek()
    if (!closingCanvasId) return
    const focusTrigger = () => document.querySelector<HTMLElement>(`[data-canvas-open-trigger="${CSS.escape(closingCanvasId)}"]`)?.focus({ preventScroll: true })
    window.requestAnimationFrame(() => {
      focusTrigger()
      window.setTimeout(() => {
        const activeElement = document.activeElement
        const focusStayedInClosingDrawer = activeElement === closingActiveElement
          || activeElement instanceof HTMLElement && Boolean(activeElement.closest('[data-canvas-ui="root"], [data-slot="drawer-content"]'))
        if (!activeElement || activeElement === document.body || !activeElement.isConnected || focusStayedInClosingDrawer) focusTrigger()
      }, 450)
    })
  }

  return (
    <div className="desktop-openmaus flex h-screen min-h-0 bg-accent p-4 text-foreground" data-testid="canvas-fixture-shell">
      <div className="grid min-h-0 w-full grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-4 rounded-2xl bg-card p-4 shadow-sm md:grid-cols-[220px_minmax(0,1fr)] md:grid-rows-1">
        <aside data-testid="outside-ui" className="rounded-xl border border-border bg-background p-4">
          <h1 className="font-heading text-base font-medium">共享界面对照</h1>
          <p className="mt-2 text-xs text-muted-foreground">此区域必须继续使用产品全局字体与样式。</p>
          <Button type="button" className="mt-4" onClick={() => setGroupOpen(true)}>打开群聊资料</Button>
        </aside>
        <section className="min-h-0 overflow-hidden rounded-xl border border-border bg-sidebar" aria-label="群聊资料测试区">
          {groupOpen
            ? <GroupCanvasPanel conversationId={CONVERSATION_ID} />
            : <div className="grid h-full place-items-center text-sm text-muted-foreground">群聊资料已关闭</div>}
        </section>
      </div>

      <Drawer open={Boolean(canvasId)} onOpenChange={(open) => { if (!open) dismissDrawer() }} direction="right">
        <DrawerContent className="w-[min(92vw,72rem)] max-w-none overflow-hidden p-0 before:inset-0 before:rounded-none before:border-0 sm:max-w-none sm:[--drawer-content-width:min(92vw,72rem)] data-[vaul-drawer-direction=right]:w-[min(92vw,72rem)] data-[vaul-drawer-direction=right]:sm:max-w-none">
          <DrawerTitle className="sr-only">Canvas</DrawerTitle>
          <DrawerDescription className="sr-only">协作画布</DrawerDescription>
          <div className="min-h-0 flex-1 overflow-hidden">
            <CanvasView canvasId={canvasId ?? undefined} onBack={closeCanvasView} />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

const params = new URLSearchParams(window.location.search)
localStorage.setItem('lingxiloop-theme', params.get('theme') === 'dark' ? 'dark' : 'light')

createRoot(document.getElementById('root')!).render(
  <AppThemeProvider>
    <TooltipProvider>
      <GlobalInteractionProvider>
        <CanvasFixture />
      </GlobalInteractionProvider>
    </TooltipProvider>
  </AppThemeProvider>,
)
