import { useEffect } from 'react'
import { ComputerView } from '@/components/ComputerView'
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
  computer: 'Computer',
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
    : view === 'computer' ? <ComputerView />
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
  const workspaceContextOpen = view !== 'conversations'
  const contextOpen = Boolean(infoParticipantId || openThread || documentId || boardId || calendarEventId || workspaceContextOpen)

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

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
      <div className="desktop-im-grid grid h-full min-h-0" data-context-open={contextOpen ? 'true' : 'false'}>
        <ConversationsPane />
        <ChatPane />
        {contextOpen && <aside className="im-context-pane min-h-0 min-w-0 overflow-hidden border-l border-hairline bg-panel shadow-[-18px_0_40px_-34px_rgba(10,30,60,0.5)]">{context}</aside>}
      </div>
      <EmailComposer />
    </div>
  )
}
