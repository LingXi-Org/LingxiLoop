import { type CSSProperties, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CanvasView } from '@/components/CanvasView'
import { EmailComposer } from '@/components/EmailComposer'
import { isElectron, platform } from '@/lib/runtime'
import { useApp } from '@/stores/app'
import { useTheme } from '@/stores/theme'
import type { ViewKey } from '@/types'
import { AgentsView } from './AgentsView'
import { BoardPeekPane } from './BoardPeekPane'
import { BoardsView } from './BoardsView'
import { CalendarPeekPane } from './CalendarPeekPane'
import { CalendarView } from './CalendarView'
import { ChatPane } from './ChatPane'
import { ConversationsPane } from './ConversationsPane'
import { DocumentPeekPane } from './DocumentPeekPane'
import { DocumentsView } from './DocumentsView'
import { InfoPane } from './InfoPane'
import { MeView } from './MeView'
import { ThreadDrawer } from './ThreadDrawer'

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
const MIDDLE_COLUMN_MIN = 360

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
          : view === 'me' ? <MeView />
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
  const workspaceContextOpen = view !== 'conversations'
  const contextOpen = !canvasId && Boolean(infoParticipantId || openThread || documentId || boardId || calendarEventId || workspaceContextOpen)
  const [leftColumnWidth, setLeftColumnWidth] = useState(loadLeftColumnWidth)
  const hasCustomLeftWidthRef = useRef(hasStoredLeftColumnWidth())
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)

  const persistLeftColumnWidth = useCallback((width: number) => {
    try { window.localStorage.setItem(LEFT_COLUMN_STORAGE_KEY, String(width)) } catch { /* best effort */ }
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
    setLeftColumnWidth(next)
  }, [contextOpen])

  const handleResizeEnd = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return
    persistLeftColumnWidth(leftColumnWidth)
    stopResize(event.currentTarget, event.pointerId)
  }, [leftColumnWidth, persistLeftColumnWidth, stopResize])

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
    }
    handleWindowResize()
    window.addEventListener('resize', handleWindowResize)
    return () => window.removeEventListener('resize', handleWindowResize)
  }, [contextOpen])

  useEffect(() => () => {
    resizeRef.current = null
    document.body.classList.remove('im-column-resizing')
  }, [])

  let context: React.ReactNode = null
  if (infoParticipantId) context = <InfoPane />
  else if (openThread) context = <ThreadDrawer />
  else if (documentId) context = <DocumentPeekPane />
  else if (boardId) context = <BoardPeekPane />
  else if (calendarEventId) context = <CalendarPeekPane />
  else if (workspaceContextOpen) context = <WorkspaceContext view={view} />

  return (
    <div
      className="desktop-openmaus relative h-screen w-screen min-h-0 overflow-hidden bg-app"
      data-electron={isElectron ? 'true' : 'false'}
      data-platform={platform}
    >
      <div
        className="desktop-im-grid grid h-full min-h-0"
        data-context-open={contextOpen ? 'true' : 'false'}
        style={{
          '--im-left-column-width': `${leftColumnWidth}px`,
        } as CSSProperties}
      >
        <ConversationsPane />
        {canvasId ? <CanvasContext canvasId={canvasId} onClose={closeCanvasPeek} /> : <ChatPane />}
        {contextOpen && (
          <aside className="im-context-pane min-h-0 min-w-0 overflow-hidden border-l border-hairline bg-panel shadow-[-18px_0_40px_-34px_rgba(10,30,60,0.5)]">
            {context}
          </aside>
        )}
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
    </div>
  )
}
