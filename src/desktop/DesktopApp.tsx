import { useEffect, useRef, useState } from 'react'
import { CanvasView } from '@/components/CanvasView'
import { EmailComposer } from '@/components/EmailComposer'
import { IAgent, IAgents, IBoard, ICalendar, ICanvas, IChat, IDoc } from '@/components/icons'
import { isElectron, platform } from '@/lib/runtime'
import { useApp } from '@/stores/app'
import { useTheme } from '@/stores/theme'
import type { ViewKey } from '@/types'
import { AgentsView } from './AgentsView'
import { BoardsView } from './BoardsView'
import { CalendarView } from './CalendarView'
import { ChatPane } from './ChatPane'
import { ConversationsPane } from './ConversationsPane'
import { DocumentsView } from './DocumentsView'
import { MeView } from './MeView'

const productViews: Array<{ key: ViewKey['view']; label: string; Icon: typeof IChat }> = [
  { key: 'conversations', label: '对话', Icon: IChat },
  { key: 'agents', label: '智能体', Icon: IAgent },
  { key: 'canvas', label: 'Canvas', Icon: ICanvas },
  { key: 'library', label: '资料库', Icon: IDoc },
  { key: 'me', label: '我的', Icon: IAgents },
]

function DesktopNavigation() {
  const view = useApp((state) => state.view)
  const setView = useApp((state) => state.setView)
  return (
    <nav className="flex h-14 shrink-0 items-center gap-1 border-b border-hairline bg-panel px-4" aria-label="主导航">
      <span className="mr-5 text-[16px] font-semibold text-ink">LingxiLoop</span>
      {productViews.map(({ key, label, Icon }) => (
        <button key={key} type="button" onClick={() => setView(key)}
          className={`flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition ${view === key ? 'bg-raised text-accent' : 'text-ink-secondary hover:bg-raised/60 hover:text-ink'}`}>
          <Icon className="h-4 w-4" />{label}
        </button>
      ))}
    </nav>
  )
}

function LibraryView() {
  const [section, setSection] = useState<'documents' | 'boards' | 'calendar'>('documents')
  const sections = [
    { key: 'documents' as const, label: '文档', Icon: IDoc },
    { key: 'boards' as const, label: '看板', Icon: IBoard },
    { key: 'calendar' as const, label: '日历', Icon: ICalendar },
  ]
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="w-52 shrink-0 border-r border-hairline bg-panel p-3">
        <h1 className="px-3 pb-3 pt-2 text-[15px] font-semibold text-ink">资料库</h1>
        {sections.map(({ key, label, Icon }) => (
          <button key={key} type="button" onClick={() => setSection(key)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] ${section === key ? 'bg-raised text-accent' : 'text-ink-secondary hover:bg-raised/60'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </aside>
      <main className="min-w-0 flex-1 overflow-hidden">
        {section === 'documents' ? <DocumentsView /> : section === 'boards' ? <BoardsView /> : <CalendarView />}
      </main>
    </div>
  )
}

/** The desktop product has one shape: workspace left, conversation right. */
export function DesktopApp() {
  const theme = useTheme((s) => s.theme)
  const view = useApp((s) => s.view)
  const openCanvasId = useApp((s) => s.openCanvasId)
  const closeCanvasPeek = useApp((s) => s.closeCanvasPeek)
  const [canvasWidth, setCanvasWidth] = useState(560)
  const resizing = useRef(false)

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!openCanvasId) return
    const move = (event: PointerEvent) => { if (resizing.current) setCanvasWidth(Math.max(380, Math.min(900, window.innerWidth - event.clientX))) }
    const up = () => { resizing.current = false }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  }, [openCanvasId])

  return (
    <div
      className="desktop-openmaus relative flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-app"
      data-electron={isElectron ? 'true' : 'false'}
      data-platform={platform}
    >
      <DesktopNavigation />
      {view === 'conversations' ? (
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: openCanvasId ? `320px minmax(360px, 1fr) 6px ${canvasWidth}px` : '320px minmax(0, 1fr)' }}>
          <ConversationsPane />
          <ChatPane />
          {openCanvasId ? <>
            <div role="separator" aria-label="调整 Canvas 宽度" onPointerDown={(event) => { resizing.current = true; event.currentTarget.setPointerCapture(event.pointerId) }} className="cursor-col-resize border-l border-hairline bg-panel hover:bg-accent/20" />
            <div className="relative min-w-0 overflow-hidden border-l border-hairline">
              <button type="button" onClick={closeCanvasPeek} className="absolute right-3 top-3 z-50 rounded-md border border-hairline bg-panel px-2 py-1 text-xs text-ink-secondary">关闭</button>
              <CanvasView canvasId={openCanvasId} embedded />
            </div>
          </> : null}
        </div>
      ) : view === 'agents' ? <div className="min-h-0 flex-1 overflow-hidden"><AgentsView /></div>
        : view === 'canvas' ? <div className="min-h-0 flex-1 overflow-hidden"><CanvasView /></div>
        : view === 'library' ? <LibraryView />
          : <div className="min-h-0 flex-1 overflow-hidden"><MeView /></div>}
      <EmailComposer />
    </div>
  )
}
