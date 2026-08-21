import { useEffect, useState } from 'react'
import { EmailComposer } from '@/components/EmailComposer'
import { IAgent, IAgents, IBoard, ICalendar, IChat, IDoc } from '@/components/icons'
import { isElectron, platform } from '@/lib/runtime'
import { useTheme } from '@/stores/theme'
import { ConversationsPane } from './ConversationsPane'
import { ChatPane } from './ChatPane'
import { MeView } from './MeView'
import { AgentsView } from './AgentsView'
import { BoardsView } from './BoardsView'
import { CalendarView } from './CalendarView'
import { DocumentsView } from './DocumentsView'
import { useApp } from '@/stores/app'
import type { ViewKey } from '@/types'

const productViews: Array<{ key: ViewKey['view']; label: string; Icon: typeof IChat }> = [
  { key: 'conversations', label: '对话', Icon: IChat },
  { key: 'agents', label: '智能体', Icon: IAgent },
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

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

  return (
    <div
      className="desktop-openmaus relative flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-app"
      data-electron={isElectron ? 'true' : 'false'}
      data-platform={platform}
    >
      <DesktopNavigation />
      {view === 'conversations' ? (
        <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: '320px minmax(0, 1fr)' }}>
          <ConversationsPane />
          <ChatPane />
        </div>
      ) : view === 'agents' ? <div className="min-h-0 flex-1 overflow-hidden"><AgentsView /></div>
        : view === 'library' ? <LibraryView />
          : <div className="min-h-0 flex-1 overflow-hidden"><MeView /></div>}
      <EmailComposer />
    </div>
  )
}
