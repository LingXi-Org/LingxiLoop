import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CanvasView } from '@/components/CanvasView'
import { CommandPalette } from '@/components/CommandPalette'
import { EmailComposer } from '@/components/EmailComposer'
import { actionForKeyboardEvent } from '@/lib/commands'
import { isElectron, platform } from '@/lib/runtime'
import { useApp } from '@/stores/app'
import { useConversations } from '@/stores/conversations'
import { useTheme } from '@/stores/theme'
import type { ViewKey } from '@/types'
import { AgentsView } from './AgentsView'
import { BoardPeekPane } from './BoardPeekPane'
import { BoardsView } from './BoardsView'
import { CalendarPeekPane } from './CalendarPeekPane'
import { CalendarView } from './CalendarView'
import { CompanyCourseManagement } from './CompanyCourseManagement'
import { ChatPane } from './ChatPane'
import { ConversationsPane } from './ConversationsPane'
import { DocumentPeekPane } from './DocumentPeekPane'
import { DocumentsView } from './DocumentsView'
import { InfoPane } from './InfoPane'
import { GrokSettingsModal } from './GrokSettingsModal'
import { ThreadDrawer } from './ThreadDrawer'
import { SourceDetailOverlay } from '@/components/WorkspaceChrome'
import { GroupContextContent } from '@/components/GroupContextContent'
import { DetailPanel } from '@/components/layout/detail-panel'
import { LearningCenter } from '@/components/LearningCenter'

const CONTEXT_TITLES: Partial<Record<ViewKey['view'], string>> = {
  agents: '智能体',
  canvas: '画布',
  library: '资料库',
  documents: '文档',
  boards: '看板',
  calendar: '日历',
  me: '我的',
}

const LEFT_COLUMN_STORAGE_KEY = 'lingxiloop:im-left-column-width'
const LEFT_COLUMN_MIN = 256
const LEFT_COLUMN_MAX = 424
const MIDDLE_COLUMN_MIN = 480
const GROUP_PANEL_STORAGE_KEY = 'lingxiloop:im-group-panel-width'
const GROUP_PANEL_MIN = 280
const GROUP_PANEL_MAX = 480
const GROUP_PANEL_DEFAULT = 400

function defaultLeftColumnWidth(viewportWidth: number): number {
  return Math.round(Math.min(LEFT_COLUMN_MAX, Math.max(LEFT_COLUMN_MIN, viewportWidth * 0.25)))
}

function rightColumnWidth(viewportWidth: number): number {
  return Math.min(424, Math.max(320, viewportWidth * 0.27))
}

function clampLeftColumnWidth(width: number, viewportWidth: number, contextOpen: boolean): number {
  const reservedContext = contextOpen && viewportWidth > 1180 ? rightColumnWidth(viewportWidth) : 0
  const responsiveMax = Math.max(LEFT_COLUMN_MIN, viewportWidth - MIDDLE_COLUMN_MIN - reservedContext)
  return Math.round(Math.min(LEFT_COLUMN_MAX, responsiveMax, Math.max(LEFT_COLUMN_MIN, width)))
}

function loadLeftColumnWidth(): number {
  if (typeof window === 'undefined') return 320
  try {
    const stored = Number(window.localStorage.getItem(LEFT_COLUMN_STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) return stored
  } catch { /* private browsing can deny storage access */ }
  return defaultLeftColumnWidth(window.innerWidth)
}

function clampGroupPanelWidth(width: number, viewportWidth: number, leftColumnWidth: number): number {
  const middleMinimum = viewportWidth < 1180 ? 320 : MIDDLE_COLUMN_MIN
  const responsiveMax = Math.max(GROUP_PANEL_MIN, viewportWidth - leftColumnWidth - middleMinimum)
  return Math.round(Math.min(GROUP_PANEL_MAX, responsiveMax, Math.max(GROUP_PANEL_MIN, width)))
}

function loadGroupPanelWidth(): number {
  if (typeof window === 'undefined') return GROUP_PANEL_DEFAULT
  try {
    const stored = Number(window.localStorage.getItem(GROUP_PANEL_STORAGE_KEY))
    if (Number.isFinite(stored) && stored > 0) return stored
  } catch { /* private browsing can deny storage access */ }
  return GROUP_PANEL_DEFAULT
}

function hasStoredLeftColumnWidth(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = Number(window.localStorage.getItem(LEFT_COLUMN_STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0
  } catch {
    return false
  }
}

function WorkspaceContext({ view }: { view: ViewKey['view'] }) {
  const close = () => useApp.getState().setView('conversations')
  const libraryOpen = view === 'library' || view === 'documents' || view === 'boards' || view === 'calendar'
  const body = view === 'agents' ? <AgentsView />
    : view === 'canvas' ? <CanvasView onBack={close} />
      : view === 'boards' ? <BoardsView />
        : view === 'calendar' ? <CalendarView />
          : <DocumentsView />

  return (
    <section className="flex h-full min-h-0 flex-col bg-app">
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-hairline bg-panel/92 px-4 backdrop-blur-xl">
        <button type="button" onClick={close} className="grid size-9 place-items-center rounded-full text-ink-secondary hover:bg-raised" aria-label="关闭上下文面板">×</button>
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-semibold text-ink">{CONTEXT_TITLES[view] ?? '工作区'}</h2>
          <p className="text-[10px] text-ink-secondary">会话上下文</p>
        </div>
      </header>
      {libraryOpen && (
        <nav className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline bg-panel px-3" aria-label="资料库分区">
          {([
            ['documents', '文档'],
            ['boards', '看板'],
            ['calendar', '日历'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => useApp.getState().setView(key)}
              className={view === key || (view === 'library' && key === 'documents')
                ? 'rounded-lg bg-raised px-3 py-1.5 text-[11px] font-semibold text-accent'
                : 'rounded-lg px-3 py-1.5 text-[11px] font-medium text-ink-secondary hover:bg-raised'}
            >{label}</button>
          ))}
        </nav>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
    </section>
  )
}

function CanvasContext({ canvasId, onClose }: { canvasId: string; onClose: () => void }) {
  return (
    <div className="relative h-full min-h-0 overflow-hidden"><CanvasView canvasId={canvasId} onBack={onClose} /></div>
  )
}

/** IM-first desktop/web shell. Profiles and lightweight artifacts may use a
 * contextual rail; an opened Canvas always replaces the conversation column. */
export function DesktopApp() {
  const theme = useTheme((state) => state.theme)
  const view = useApp((state) => state.view)
  const infoParticipantId = useApp((state) => state.infoAgentId)
  const openThread = useApp((state) => state.openThread)
  const documentId = useApp((state) => state.openDocumentId)
  const boardId = useApp((state) => state.openBoardId)
  const calendarEventId = useApp((state) => state.openCalendarEventId)
  const canvasId = useApp((state) => state.openCanvasId)
  const closeCanvasPeek = useApp((state) => state.closeCanvasPeek)
  const settingsOpen = view === 'me'
  const learningOpen = view === 'learning'
  const managementOpen = view === 'management'
  const workspaceContextOpen = view !== 'conversations' && !settingsOpen && !learningOpen && !managementOpen
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const selectedConversation = useConversations((state) => state.list.find((item) => item.id === selectedConversationId) ?? null)
  const groupContext = selectedConversation?.kind === 'group' ? selectedConversation : null
  const contextOpen = !canvasId && Boolean(infoParticipantId || openThread || documentId || boardId || calendarEventId || workspaceContextOpen)
  const [leftColumnWidth, setLeftColumnWidth] = useState(loadLeftColumnWidth)
  const [groupPanelOpen, setGroupPanelOpen] = useState(Boolean(groupContext))
  const [groupPanelWidth, setGroupPanelWidth] = useState(loadGroupPanelWidth)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const hasCustomLeftWidthRef = useRef(hasStoredLeftColumnWidth())
  const gridRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)
  const pendingLeftWidthRef = useRef(leftColumnWidth)
  const leftResizeFrameRef = useRef<number | null>(null)
  const groupResizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)

  const persistLeftColumnWidth = useCallback((width: number) => {
    try { window.localStorage.setItem(LEFT_COLUMN_STORAGE_KEY, String(width)) } catch { /* best effort */ }
  }, [])

  const persistGroupPanelWidth = useCallback((width: number) => {
    try { window.localStorage.setItem(GROUP_PANEL_STORAGE_KEY, String(width)) } catch { /* best effort */ }
  }, [])

  const stopResize = useCallback((target?: HTMLElement, pointerId?: number) => {
    if (target && pointerId !== undefined && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
    resizeRef.current = null
    document.body.classList.remove('im-column-resizing')
  }, [])

  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    hasCustomLeftWidthRef.current = true
    pendingLeftWidthRef.current = leftColumnWidth
    resizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: leftColumnWidth }
    document.body.classList.add('im-column-resizing')
  }, [leftColumnWidth])

  const handleResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = resizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const next = clampLeftColumnWidth(
      resize.startWidth + event.clientX - resize.startX,
      window.innerWidth,
      contextOpen,
    )
    pendingLeftWidthRef.current = next
    if (leftResizeFrameRef.current !== null) return
    leftResizeFrameRef.current = window.requestAnimationFrame(() => {
      leftResizeFrameRef.current = null
      gridRef.current?.style.setProperty('--im-left-column-width', `${pendingLeftWidthRef.current}px`)
    })
  }, [contextOpen])

  const handleResizeEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    if (leftResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(leftResizeFrameRef.current)
      leftResizeFrameRef.current = null
    }
    const next = pendingLeftWidthRef.current
    gridRef.current?.style.setProperty('--im-left-column-width', `${next}px`)
    setLeftColumnWidth(next)
    persistLeftColumnWidth(next)
    stopResize(event.currentTarget, event.pointerId)
  }, [persistLeftColumnWidth, stopResize])

  const resetLeftColumnWidth = useCallback(() => {
    const next = clampLeftColumnWidth(defaultLeftColumnWidth(window.innerWidth), window.innerWidth, contextOpen)
    hasCustomLeftWidthRef.current = false
    setLeftColumnWidth(next)
    try { window.localStorage.removeItem(LEFT_COLUMN_STORAGE_KEY) } catch { /* best effort */ }
  }, [contextOpen])

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = leftColumnWidth - (event.shiftKey ? 32 : 8)
    if (event.key === 'ArrowRight') next = leftColumnWidth + (event.shiftKey ? 32 : 8)
    if (event.key === 'Home') next = LEFT_COLUMN_MIN
    if (event.key === 'End') next = LEFT_COLUMN_MAX
    if (next === null) return
    event.preventDefault()
    const clamped = clampLeftColumnWidth(next, window.innerWidth, contextOpen)
    hasCustomLeftWidthRef.current = true
    setLeftColumnWidth(clamped)
    persistLeftColumnWidth(clamped)
  }, [contextOpen, leftColumnWidth, persistLeftColumnWidth])

  const stopGroupResize = useCallback((target?: HTMLElement, pointerId?: number) => {
    if (target && pointerId !== undefined && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
    groupResizeRef.current = null
    document.body.classList.remove('im-column-resizing')
  }, [])

  const handleGroupResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    groupResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: groupPanelWidth }
    document.body.classList.add('im-column-resizing')
  }, [groupPanelWidth])

  const handleGroupResizeMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = groupResizeRef.current
    if (!resize || resize.pointerId !== event.pointerId) return
    setGroupPanelWidth(clampGroupPanelWidth(
      resize.startWidth - (event.clientX - resize.startX),
      window.innerWidth,
      leftColumnWidth,
    ))
  }, [leftColumnWidth])

  const handleGroupResizeEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (groupResizeRef.current?.pointerId !== event.pointerId) return
    persistGroupPanelWidth(groupPanelWidth)
    stopGroupResize(event.currentTarget, event.pointerId)
  }, [groupPanelWidth, persistGroupPanelWidth, stopGroupResize])

  const handleGroupResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = groupPanelWidth + (event.shiftKey ? 32 : 8)
    if (event.key === 'ArrowRight') next = groupPanelWidth - (event.shiftKey ? 32 : 8)
    if (event.key === 'Home') next = GROUP_PANEL_MIN
    if (event.key === 'End') next = GROUP_PANEL_MAX
    if (next === null) return
    event.preventDefault()
    const clamped = clampGroupPanelWidth(next, window.innerWidth, leftColumnWidth)
    setGroupPanelWidth(clamped)
    persistGroupPanelWidth(clamped)
  }, [groupPanelWidth, leftColumnWidth, persistGroupPanelWidth])

  const resetGroupPanelWidth = useCallback(() => {
    const next = clampGroupPanelWidth(GROUP_PANEL_DEFAULT, window.innerWidth, leftColumnWidth)
    setGroupPanelWidth(next)
    try { window.localStorage.removeItem(GROUP_PANEL_STORAGE_KEY) } catch { /* best effort */ }
  }, [leftColumnWidth])

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

  useEffect(() => {
    const handleWindowResize = () => {
      setLeftColumnWidth((current) => clampLeftColumnWidth(
        hasCustomLeftWidthRef.current ? current : defaultLeftColumnWidth(window.innerWidth),
        window.innerWidth,
        contextOpen,
      ))
      setGroupPanelWidth((current) => clampGroupPanelWidth(current, window.innerWidth, leftColumnWidth))
    }
    handleWindowResize()
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [contextOpen, leftColumnWidth])

  useEffect(() => () => {
    if (leftResizeFrameRef.current !== null) window.cancelAnimationFrame(leftResizeFrameRef.current)
    resizeRef.current = null
    groupResizeRef.current = null
    document.body.classList.remove('im-column-resizing')
  }, [])

  useEffect(() => { setGroupPanelOpen(Boolean(groupContext)) }, [groupContext?.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && commandPaletteOpen) { event.preventDefault(); setCommandPaletteOpen(false); return }
      const action = actionForKeyboardEvent(event)
      if (!action) return
      if (action.id === 'palette') { event.preventDefault(); setCommandPaletteOpen(true); return }
      if (action.id === 'find-chat') {
        if (view === 'conversations' && selectedConversationId) { event.preventDefault(); window.dispatchEvent(new Event('lingxiloop:find-chat')) }
        return
      }
      const visible = useConversations.getState().list
      if (action.id === 'conversation-index') {
        const target = visible[action.index ?? -1]
        if (target) { event.preventDefault(); useApp.getState().selectConversation(target.id) }
        return
      }
      if (visible.length === 0) return
      const current = visible.findIndex((item) => item.id === useApp.getState().selectedConversationId)
      const delta = action.id === 'previous-conversation' ? -1 : 1
      const target = visible[(Math.max(0, current) + delta + visible.length) % visible.length]
      if (!target) return
      event.preventDefault(); useApp.getState().selectConversation(target.id)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [commandPaletteOpen, selectedConversationId, view])

  let context: React.ReactNode = null
  if (infoParticipantId) context = <InfoPane />
  else if (openThread) context = <ThreadDrawer />
  else if (documentId) context = <DocumentPeekPane />
  else if (boardId) context = <BoardPeekPane />
  else if (calendarEventId) context = <CalendarPeekPane />
  else if (workspaceContextOpen) context = <WorkspaceContext view={view} />

  const closeDetailPanel = () => {
    const app = useApp.getState()
    if (infoParticipantId) app.closeAgentInfo()
    else if (openThread) app.closeThreadView()
    else if (documentId) app.closeDocumentPeek()
    else if (boardId) app.closeBoardPeek()
    else if (calendarEventId) app.closeCalendarEventPeek()
    else if (workspaceContextOpen) app.setView('conversations')
    else setGroupPanelOpen(false)
  }

  const groupDetailOpen = !canvasId && Boolean(groupContext) && (groupPanelOpen || contextOpen)
  const groupDetail = contextOpen
    ? context
    : groupContext ? <GroupContextContent conversationId={groupContext.id} /> : null

  return (
    <div
      className="desktop-openmaus relative flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-app"
      data-electron={isElectron ? 'true' : 'false'}
      data-platform={platform}
    >
      <div
        ref={gridRef}
        className="desktop-im-grid grid min-h-0 flex-1"
        data-group-context={groupDetailOpen ? 'true' : 'false'}
        data-canvas-expanded={canvasId ? 'true' : 'false'}
        style={{
          '--im-left-column-width': `${leftColumnWidth}px`,
        } as CSSProperties}
      >
        <ConversationsPane />
        <div className="desktop-detail-panel-host relative min-h-0 min-w-0 overflow-hidden">
          <DetailPanel
            open={groupDetailOpen}
            onClose={closeDetailPanel}
            detail={groupDetail}
            detailWidth={groupPanelWidth}
          >
            {learningOpen
              ? <LearningCenter />
              : managementOpen
              ? <CompanyCourseManagement />
              : canvasId
              ? <div className="canvas-expanded-pane h-full min-h-0 min-w-0 flex-1"><CanvasContext canvasId={canvasId} onClose={closeCanvasPeek} /></div>
              : <ChatPane onOpenGroupContext={groupContext ? () => setGroupPanelOpen(true) : undefined} />}
          </DetailPanel>
          {groupDetailOpen && (
            <div
              role="separator"
              aria-label="调整群聊上下文栏宽度"
              aria-orientation="vertical"
              aria-valuemin={GROUP_PANEL_MIN}
              aria-valuemax={GROUP_PANEL_MAX}
              aria-valuenow={groupPanelWidth}
              tabIndex={0}
              className="im-group-panel-resize-handle"
              style={{ right: `${groupPanelWidth - 6}px` }}
              title="拖动调整上下文栏宽度，双击恢复默认"
              onPointerDown={handleGroupResizeStart}
              onPointerMove={handleGroupResizeMove}
              onPointerUp={handleGroupResizeEnd}
              onPointerCancel={handleGroupResizeEnd}
              onDoubleClick={resetGroupPanelWidth}
              onKeyDown={handleGroupResizeKeyDown}
            />
          )}
        </div>
        {!canvasId && !groupContext && contextOpen && <aside className="im-floating-context absolute inset-y-0 right-0 z-30 w-[clamp(340px,28vw,420px)] overflow-hidden border-l border-hairline bg-panel shadow-[-18px_0_40px_-24px_rgba(10,30,60,0.35)]">{context}</aside>}
        <div
          role="separator"
          aria-label="调整会话列表宽度"
          aria-orientation="vertical"
          aria-valuemin={LEFT_COLUMN_MIN}
          aria-valuemax={LEFT_COLUMN_MAX}
          aria-valuenow={leftColumnWidth}
          tabIndex={0}
          className="im-left-resize-handle"
          title="拖动调整会话列表宽度，双击恢复默认"
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          onDoubleClick={resetLeftColumnWidth}
          onKeyDown={handleResizeKeyDown}
        />
      </div>
      <EmailComposer />
      <SourceDetailOverlay />
      <GrokSettingsModal isOpen={settingsOpen} onClose={() => useApp.getState().setView('conversations')} />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  )
}
