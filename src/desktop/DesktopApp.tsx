import { useEffect, useState } from 'react'
import type { Layout } from 'react-resizable-panels'
import { CanvasView } from '@/features/canvas/components/CanvasView'
import { CommandPalette } from '@/components/CommandPalette'
import { EmailComposer } from '@/features/email/components/EmailComposer'
import { GroupContextContent } from '@/components/GroupContextContent'
import { LearningCenter } from '@/features/learning/components/LearningCenter'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { SourceDetailOverlay } from '@/components/WorkspaceChrome'
import { actionForKeyboardEvent } from '@/lib/commands'
import { isElectron, platform } from '@/lib/runtime'
import { useApp } from '@/stores/app'
import { useConversations } from '@/features/conversations/store'
import { useSurface } from '@/stores/surface'
import { useTheme } from '@/stores/theme'
import { useUiCommand } from '@/stores/uiCommands'
import type { ViewKey } from '@/types'
import { IconX } from '@tabler/icons-react'
import { AgentsView } from '@/features/agents/components/AgentsView'
import { BoardPeekPane } from '@/features/boards/components/BoardPeekPane'
import { BoardsView } from '@/features/boards/components/BoardsView'
import { CalendarPeekPane } from '@/features/calendar/components/CalendarPeekPane'
import { CalendarView } from '@/features/calendar/components/CalendarView'
import { ChatPane } from './ChatPane'
import { CompanyCourseManagement } from '@/features/companies/components/CompanyCourseManagement'
import { ConversationsPane } from '@/features/conversations/components/ConversationsPane'
import { DocumentPeekPane } from '@/features/documents/components/DocumentPeekPane'
import { DocumentsView } from '@/features/documents/components/DocumentsView'
import { InfoPane } from './InfoPane'
import { MeView } from './MeView'
import { ServerRail } from './ServerRail'
import { ThreadDrawer } from './ThreadDrawer'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

const DRAWER_TITLES: Partial<Record<ViewKey['view'], string>> = {
  agents: '智能体',
  canvas: 'Canvas',
  library: '资料库',
  documents: '文档',
  boards: '看板',
  calendar: '日历',
  learning: '学习',
  management: '组织与课程',
  me: '设置',
}

const DESKTOP_TWO_PANEL_LAYOUT_KEY = 'lingxiloop:desktop-layout:two-panel'
const LEFT_COLUMN_MIN = 256
const LEFT_COLUMN_MAX = 424
const MIDDLE_COLUMN_MIN = 320
const TWO_PANEL_DEFAULT_LAYOUT: Layout = { conversations: 25, conversation: 75 }

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

function WorkspacePage({ view, settingsTab }: { view: ViewKey['view']; settingsTab: 'Profile' | 'Preferences' }) {
  if (view === 'agents') return <AgentsView />
  if (view === 'canvas') return <CanvasView />
  if (view === 'boards') return <BoardsView />
  if (view === 'calendar') return <CalendarView />
  if (view === 'learning') return <LearningCenter />
  if (view === 'management') return <CompanyCourseManagement />
  if (view === 'me') return <MeView initialTab={settingsTab} />
  return <DocumentsView />
}

/** The desktop shell is always a pure two-column IM surface. Every page-like
 * destination opens above it in the shared Base UI Drawer. */
export function DesktopApp() {
  const { theme } = useTheme()
  const view = useApp((state) => state.view)
  const surface = useSurface((state) => state.surface)
  const infoParticipantId = surface?.kind === 'member' ? surface.participantId : null
  const openThread = surface?.kind === 'thread' ? surface : null
  const documentId = surface?.kind === 'document' ? surface.documentId : null
  const boardId = surface?.kind === 'board' ? surface.boardId : null
  const calendarEventId = surface?.kind === 'calendar' ? surface.eventId : null
  const canvasId = surface?.kind === 'canvas' ? surface.canvasId : null
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const selectedConversation = useConversations((state) => state.list.find((item) => item.id === selectedConversationId) ?? null)
  const groupContext = selectedConversation?.kind === 'group' ? selectedConversation : null
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'Profile' | 'Preferences'>('Profile')
  const uiCommand = useUiCommand()
  const [defaultLayout] = useState(() => loadPanelLayout(DESKTOP_TWO_PANEL_LAYOUT_KEY, TWO_PANEL_DEFAULT_LAYOUT))

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

  useEffect(() => { setGroupDrawerOpen(false) }, [groupContext?.id])

  useEffect(() => {
    if (uiCommand?.type === 'open-settings-profile') setSettingsTab('Profile')
    else if (uiCommand?.type === 'open-settings-preferences') setSettingsTab('Preferences')
  }, [uiCommand])

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
      event.preventDefault()
      useApp.getState().selectConversation(target.id)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [commandPaletteOpen, selectedConversationId, view])

  const pageViewOpen = view !== 'conversations'
  const drawerOpen = pageViewOpen || Boolean(infoParticipantId || openThread || documentId || boardId || calendarEventId || canvasId || (groupContext && groupDrawerOpen))
  let drawerTitle = DRAWER_TITLES[view] ?? '会话详情'
  let drawerContent: React.ReactNode = pageViewOpen ? <WorkspacePage view={view} settingsTab={settingsTab} /> : null

  if (infoParticipantId) { drawerTitle = '成员资料'; drawerContent = <InfoPane /> }
  else if (openThread) { drawerTitle = '回复串'; drawerContent = <ThreadDrawer /> }
  else if (documentId) { drawerTitle = '文档'; drawerContent = <DocumentPeekPane /> }
  else if (boardId) { drawerTitle = '看板'; drawerContent = <BoardPeekPane /> }
  else if (calendarEventId) { drawerTitle = '日历事件'; drawerContent = <CalendarPeekPane /> }
  else if (canvasId) { drawerTitle = 'Canvas'; drawerContent = <CanvasView canvasId={canvasId} /> }
  else if (groupContext && groupDrawerOpen) { drawerTitle = '群聊资料'; drawerContent = <GroupContextContent conversationId={groupContext.id} /> }

  const closeDrawer = () => {
    const surfaces = useSurface.getState()
    if (infoParticipantId) surfaces.closeAgentInfo()
    else if (openThread) surfaces.closeThreadView()
    else if (documentId) surfaces.closeDocumentPeek()
    else if (boardId) surfaces.closeBoardPeek()
    else if (calendarEventId) surfaces.closeCalendarEventPeek()
    else if (canvasId) surfaces.closeCanvasPeek()
    else if (pageViewOpen) useApp.getState().setView('conversations')
    else setGroupDrawerOpen(false)
  }

  return (
    <div className="desktop-openmaus relative flex h-screen w-screen min-h-0 flex-row overflow-hidden bg-app" data-electron={isElectron ? 'true' : 'false'} data-platform={platform}>
      <ServerRail />
      <ResizablePanelGroup
        id="desktop-two-panel-layout"
        orientation="horizontal"
        className="desktop-im-grid min-h-0 min-w-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={(layout, meta) => { if (meta.isUserInteraction) persistPanelLayout(DESKTOP_TWO_PANEL_LAYOUT_KEY, layout) }}
      >
        <ResizablePanel id="conversations" defaultSize="25%" minSize={LEFT_COLUMN_MIN} maxSize={LEFT_COLUMN_MAX} className="min-h-0 min-w-0">
          <ConversationsPane />
        </ResizablePanel>
        <ResizableHandle withHandle className="desktop-panel-resize-handle" aria-label="调整会话列表宽度" title="拖动调整会话列表宽度，双击恢复默认" />
        <ResizablePanel id="conversation" defaultSize="75%" minSize={MIDDLE_COLUMN_MIN} className="min-h-0 min-w-0">
          <ChatPane onOpenGroupContext={groupContext ? () => setGroupDrawerOpen(true) : undefined} />
        </ResizablePanel>
      </ResizablePanelGroup>

      <Drawer open={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer() }} direction="right">
        <DrawerContent className="w-[min(92vw,72rem)] sm:[--drawer-content-width:min(92vw,72rem)]">
          <DrawerHeader className="border-b border-hairline p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <DrawerTitle className="truncate">{drawerTitle}</DrawerTitle>
                <DrawerDescription className="sr-only">{drawerTitle}</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="关闭">
                  <IconX className="size-4" />
                </button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-hidden">{drawerContent}</div>
        </DrawerContent>
      </Drawer>

      <EmailComposer />
      <SourceDetailOverlay />
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  )
}
