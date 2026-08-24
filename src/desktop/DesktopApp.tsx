import { useEffect, useRef, useState } from 'react'
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
  canvas: 'Canvas',
  library: '资料库',
  documents: '文档',
  boards: '看板',
  calendar: '日历',
  me: '我的',
}

function WorkspaceContext({ view }: { view: ViewKey['view'] }) {
  const close = () => useApp.getState().setView('conversations')
  const libraryOpen = view === 'library' || view === 'documents' || view === 'boards' || view === 'calendar'
  const body = view === 'agents' ? <AgentsView />
    : view === 'canvas' ? <CanvasView />
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
    <div className="relative h-full min-h-0 overflow-hidden">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-50 rounded-full border border-hairline bg-panel/95 px-3 py-1.5 text-xs font-medium text-ink-secondary shadow-sm backdrop-blur hover:bg-raised"
      >
        关闭
      </button>
      <CanvasView canvasId={canvasId} embedded />
    </div>
  )
}

/** IM-first desktop/web shell. Messaging remains mounted in the first two
 * columns; profiles, threads, artifacts, agents and workspace tools use a
 * contextual third rail instead of replacing chat with product tabs. */
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
  const [canvasWidth, setCanvasWidth] = useState(560)
  const resizingCanvas = useRef(false)
  const workspaceContextOpen = view !== 'conversations'
  const contextOpen = Boolean(infoParticipantId || openThread || documentId || boardId || calendarEventId || canvasId || workspaceContextOpen)

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!canvasId) return
    const move = (event: PointerEvent) => {
      if (!resizingCanvas.current) return
      setCanvasWidth(Math.max(380, Math.min(900, window.innerWidth - event.clientX)))
    }
    const up = () => {
      resizingCanvas.current = false
      document.body.classList.remove('im-column-resizing')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('im-column-resizing')
    }
  }, [canvasId])

  let context: React.ReactNode = null
  if (infoParticipantId) context = <InfoPane />
  else if (openThread) context = <ThreadDrawer />
  else if (documentId) context = <DocumentPeekPane />
  else if (boardId) context = <BoardPeekPane />
  else if (calendarEventId) context = <CalendarPeekPane />
  else if (canvasId) context = <CanvasContext canvasId={canvasId} onClose={closeCanvasPeek} />
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
        data-canvas-open={canvasId ? 'true' : 'false'}
        style={{ '--im-context-width': `${canvasWidth}px` } as React.CSSProperties}
      >
        <ConversationsPane />
        <ChatPane />
        {contextOpen && (
          <aside className="im-context-pane min-h-0 min-w-0 overflow-hidden border-l border-hairline bg-panel shadow-[-18px_0_40px_-34px_rgba(10,30,60,0.5)]">
            {canvasId && (
              <div
                role="separator"
                aria-label="调整 Canvas 宽度"
                aria-orientation="vertical"
                className="im-context-resize-handle"
                onPointerDown={(event) => {
                  resizingCanvas.current = true
                  document.body.classList.add('im-column-resizing')
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
              />
            )}
            {context}
          </aside>
        )}
      </div>
      <EmailComposer />
    </div>
  )
}
