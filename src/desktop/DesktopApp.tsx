import { useEffect, useState } from 'react'
import type { Layout } from 'react-resizable-panels'
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
import { LearningCenter } from '@/components/LearningCenter'
import { Button } from '@/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { IconX } from '@tabler/icons-react'

const CONTEXT_TITLES: Partial<Record<ViewKey['view'], string>> = {
  agents: '智能体',
  canvas: '画布',
  library: '资料库',
  documents: '文档',
  boards: '看板',
  calendar: '日历',
  me: '我的',
}

const DESKTOP_TWO_PANEL_LAYOUT_KEY = 'lingxiloop:desktop-layout:two-panel'
const DESKTOP_THREE_PANEL_LAYOUT_KEY = 'lingxiloop:desktop-layout:three-panel'
const LEFT_COLUMN_MIN = 256
const LEFT_COLUMN_MAX = 424
const MIDDLE_COLUMN_MIN = 320
const GROUP_PANEL_MIN = 280
const GROUP_PANEL_MAX = 480
const TWO_PANEL_DEFAULT_LAYOUT: Layout = { conversations: 25, conversation: 75 }
const THREE_PANEL_DEFAULT_LAYOUT: Layout = { conversations: 25, conversation: 48, detail: 27 }

function loadPanelLayout(storageKey: string, fallback: Layout): Layout {
  if (typeof window === 'undefined') return fallback
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '') as Layout
    const valid = Object.keys(fallback).every((key) => Number.isFinite(parsed[key]) && parsed[key] > 0)
    return valid ? parsed : fallback
  } catch {
    return fallback
  }
}

function persistPanelLayout(storageKey: string, layout: Layout): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(layout))
  } catch { /* private browsing can deny storage access */ }
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
  const [groupPanelOpen, setGroupPanelOpen] = useState(Boolean(groupContext))
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [twoPanelDefaultLayout] = useState(() => loadPanelLayout(DESKTOP_TWO_PANEL_LAYOUT_KEY, TWO_PANEL_DEFAULT_LAYOUT))
  const [threePanelDefaultLayout] = useState(() => loadPanelLayout(DESKTOP_THREE_PANEL_LAYOUT_KEY, THREE_PANEL_DEFAULT_LAYOUT))

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

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

  const detailPanelOpen = !canvasId && Boolean(contextOpen || (groupContext && groupPanelOpen))
  const detailContent = contextOpen
    ? context
    : groupContext ? <GroupContextContent conversationId={groupContext.id} /> : null
  const conversationContent = learningOpen
    ? <LearningCenter />
    : managementOpen
      ? <CompanyCourseManagement />
      : canvasId
        ? <div className="canvas-expanded-pane h-full min-h-0 min-w-0 flex-1"><CanvasContext canvasId={canvasId} onClose={closeCanvasPeek} /></div>
        : <ChatPane onOpenGroupContext={groupContext ? () => setGroupPanelOpen(true) : undefined} />

  return (
    <div
      className="desktop-openmaus relative flex h-screen w-screen min-h-0 flex-col overflow-hidden bg-app"
      data-electron={isElectron ? 'true' : 'false'}
      data-platform={platform}
    >
      <ResizablePanelGroup
        key={detailPanelOpen ? 'three-panel' : 'two-panel'}
        id={detailPanelOpen ? 'desktop-three-panel-layout' : 'desktop-two-panel-layout'}
        orientation="horizontal"
        className="desktop-im-grid min-h-0 flex-1"
        data-group-context={detailPanelOpen ? 'true' : 'false'}
        data-canvas-expanded={canvasId ? 'true' : 'false'}
        defaultLayout={detailPanelOpen ? threePanelDefaultLayout : twoPanelDefaultLayout}
        onLayoutChanged={(layout, meta) => {
          if (!meta.isUserInteraction) return
          persistPanelLayout(
            detailPanelOpen ? DESKTOP_THREE_PANEL_LAYOUT_KEY : DESKTOP_TWO_PANEL_LAYOUT_KEY,
            layout,
          )
        }}
      >
        <ResizablePanel
          id="conversations"
          defaultSize="25%"
          minSize={LEFT_COLUMN_MIN}
          maxSize={LEFT_COLUMN_MAX}
          className="min-h-0 min-w-0"
        >
          <ConversationsPane />
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="desktop-panel-resize-handle"
          aria-label="调整会话列表宽度"
          title="拖动调整会话列表宽度，双击恢复默认"
        />
        <ResizablePanel
          id="conversation"
          defaultSize={detailPanelOpen ? '48%' : '75%'}
          minSize={MIDDLE_COLUMN_MIN}
          className="min-h-0 min-w-0"
        >
          {conversationContent}
        </ResizablePanel>
        {detailPanelOpen && (
          <>
            <ResizableHandle
              withHandle
              className="desktop-panel-resize-handle"
              aria-label="调整上下文栏宽度"
              title="拖动调整上下文栏宽度，双击恢复默认"
            />
            <ResizablePanel
              id="detail"
              defaultSize="27%"
              minSize={GROUP_PANEL_MIN}
              maxSize={GROUP_PANEL_MAX}
              className="desktop-detail-panel-host min-h-0 min-w-0"
            >
              <aside className="relative flex h-full min-h-0 flex-col overflow-hidden bg-sidebar text-ink">
                {groupContext && (
                  <div className="absolute right-0 top-0 z-20 flex h-12 w-12 items-center justify-center">
                    <Button onClick={closeDetailPanel} variant="ghost" size="icon" aria-label="关闭上下文栏">
                      <IconX className="size-4.5" />
                    </Button>
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-hidden">{detailContent}</div>
              </aside>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
      <EmailComposer />
      <SourceDetailOverlay />
      <GrokSettingsModal isOpen={settingsOpen} onClose={() => useApp.getState().setView('conversations')} />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  )
}
