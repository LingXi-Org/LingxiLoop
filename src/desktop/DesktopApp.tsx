import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import type { LayoutChangedMeta } from 'react-resizable-panels'
import { CommandPalette } from '@/components/CommandPalette'
import { GroupContextContent } from '@/components/GroupContextContent'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { SourceDetailOverlay } from '@/components/WorkspaceChrome'
import { CanvasView } from '@/features/canvas/components/CanvasView'
import { CalendarPeekPane } from '@/features/calendar/components/CalendarPeekPane'
import { ConversationsPane, SidebarUserFooter } from '@/features/conversations/components/ConversationsPane'
import { useConversations } from '@/features/conversations/store'
import { DocumentPeekPane } from '@/features/documents/components/DocumentPeekPane'
import { useKnowledgeSources } from '@/features/knowledge/state'
import { useWorkspace } from '@/features/knowledge/workspace'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import { PresentationDrawerContent } from '@/features/presentations'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { actionForKeyboardEvent } from '@/lib/commands'
import { isElectron, platform } from '@/lib/runtime'
import { useApp } from '@/stores/app'
import { useSurface } from '@/stores/surface'
import { useTheme } from '@/stores/theme'
import { ChatPane } from './ChatPane'
import { InfoPane } from './InfoPane'
import { PersonalDashboard } from './PersonalDashboard'
import { ThreadDrawer } from './ThreadDrawer'
import { WorkspaceRail } from './WorkspaceRail'

const DESKTOP_SIDEBAR_WIDTH_KEY = 'lingxiloop:desktop-layout:sidebar-width:v1'
const LEFT_COLUMN_DEFAULT = 260
const LEFT_COLUMN_MIN = 240
const LEFT_COLUMN_MAX = 360
const MIDDLE_COLUMN_MIN = 320
const CONTEXT_COLUMN_DEFAULT = 340
const CONTEXT_COLUMN_MIN = 320
const CONTEXT_COLUMN_MAX = 720

function loadSidebarWidth(): number {
  if (typeof window === 'undefined') return LEFT_COLUMN_DEFAULT
  try {
    const width = Number(window.localStorage.getItem(DESKTOP_SIDEBAR_WIDTH_KEY))
    return Number.isFinite(width) ? Math.min(LEFT_COLUMN_MAX, Math.max(LEFT_COLUMN_MIN, width)) : LEFT_COLUMN_DEFAULT
  } catch {
    return LEFT_COLUMN_DEFAULT
  }
}

function persistSidebarWidth(width: number): void {
  try {
    window.localStorage.setItem(DESKTOP_SIDEBAR_WIDTH_KEY, String(width))
  } catch { /* private browsing can deny storage access */ }
}

/** The desktop shell switches between the resizable IM workspace and the
 * personal dashboard. Compact object details continue to use the shared Drawer. */
export function DesktopApp() {
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const workspaces = useWorkspace((state) => state.list)
  const selectedWorkspaceId = useWorkspace((state) => state.selectedId)
  const activeWorkspace = workspaces.find((project) => project.id === selectedWorkspaceId)
  const activeProjectName = activeWorkspace?.kind === 'PERSONAL_LEARNING' && activeWorkspace.isDefault
    ? '个人学习区'
    : activeWorkspace?.name ?? '个人学习区'
  const view = useApp((state) => state.view)
  const surface = useSurface((state) => state.surface)
  const infoParticipantId = surface?.kind === 'member' ? surface.participantId : null
  const openThread = surface?.kind === 'thread' ? surface : null
  const documentId = surface?.kind === 'document' ? surface.documentId : null
  const calendarEventId = surface?.kind === 'calendar' ? surface.eventId : null
  const canvasId = surface?.kind === 'canvas' ? surface.canvasId : null
  const presentationId = surface?.kind === 'presentation' ? surface.presentationId : null
  const sourceDetailOpen = useKnowledgeSources((state) => Boolean(state.selectedSource))
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const selectedConversation = useConversations((state) => state.list.find((item) => item.id === selectedConversationId) ?? null)
  const [groupContextOpen, setGroupContextOpen] = useState(false)
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

  useEffect(() => {
    setGroupContextOpen(Boolean(selectedConversation) && !isMobile)
    if (!selectedConversation) setMobileConversationOpen(false)
  }, [isMobile, selectedConversation?.id])

  useEffect(() => {
    if (isMobile && (surface || sourceDetailOpen)) setGroupContextOpen(false)
  }, [isMobile, sourceDetailOpen, surface])


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
        if (target) { event.preventDefault(); useApp.getState().selectConversation(target.id); if (isMobile) setMobileConversationOpen(true) }
        return
      }
      if (visible.length === 0) return
      const current = visible.findIndex((item) => item.id === useApp.getState().selectedConversationId)
      const delta = action.id === 'previous-conversation' ? -1 : 1
      const target = visible[(Math.max(0, current) + delta + visible.length) % visible.length]
      if (!target) return
      event.preventDefault()
      useApp.getState().selectConversation(target.id)
      if (isMobile) setMobileConversationOpen(true)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [commandPaletteOpen, isMobile, selectedConversationId, view])

  const dashboardOpen = view !== 'conversations'
  const openDashboard = () => {
    useApp.getState().setView('learning')
  }
  const openWorkspace = () => {
    setMobileConversationOpen(false)
    setGroupContextOpen(false)
    useApp.getState().setView('conversations')
  }
  const handleSidebarLayoutChanged = (_layout: Record<string, number>, meta: LayoutChangedMeta) => {
    if (!meta.isUserInteraction) return
    const width = document.querySelector<HTMLElement>('[data-panel="conversations"]')?.getBoundingClientRect().width
    if (!width) return
    const clamped = Math.min(LEFT_COLUMN_MAX, Math.max(LEFT_COLUMN_MIN, Math.round(width)))
    setSidebarWidth(clamped)
    persistSidebarWidth(clamped)
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
        const focusStayedInCanvas = activeElement === closingActiveElement
          || activeElement instanceof HTMLElement && Boolean(activeElement.closest('[data-canvas-ui="root"]'))
        if (!activeElement || activeElement === document.body || !activeElement.isConnected || focusStayedInCanvas) focusTrigger()
      }, 450)
    })
  }
  const closePresentationView = () => {
    const closingPresentationId = presentationId
    useSurface.getState().closePresentationPeek()
    if (!closingPresentationId) return
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-presentation-open-trigger="${CSS.escape(closingPresentationId)}"]`)?.focus()
    })
  }
  const focusContextTrigger = () => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[data-context-workspace-trigger]')?.focus({ preventScroll: true })
    })
  }
  const closeMobileCanvasView = () => {
    useSurface.getState().closeCanvasPeek()
    setGroupContextOpen(false)
    focusContextTrigger()
  }
  const closeMobileContext = () => {
    setGroupContextOpen(false)
    focusContextTrigger()
  }
  const contextOpen = Boolean(selectedConversation && groupContextOpen)
  const mobileContextOpen = isMobile && contextOpen
  const drawerCanvasId = isMobile ? canvasId : null
  const drawerOpen = Boolean(infoParticipantId || openThread || documentId || calendarEventId || presentationId || drawerCanvasId || mobileContextOpen)
  let drawerTitle = '会话详情'
  let drawerContent: React.ReactNode = null

  if (infoParticipantId) { drawerTitle = '成员资料'; drawerContent = <InfoPane /> }
  else if (openThread) { drawerTitle = '回复串'; drawerContent = <ThreadDrawer /> }
  else if (documentId) { drawerTitle = '文档'; drawerContent = <DocumentPeekPane /> }
  else if (calendarEventId) { drawerTitle = '日历事件'; drawerContent = <CalendarPeekPane /> }
  else if (presentationId) { drawerTitle = 'HTML 演示'; drawerContent = <PresentationDrawerContent presentationId={presentationId} /> }
  else if (drawerCanvasId) { drawerTitle = 'Canvas'; drawerContent = <CanvasView canvasId={drawerCanvasId} onBack={closeMobileCanvasView} /> }
  else if (mobileContextOpen && selectedConversation) { drawerTitle = '资料与 Canvas 工作区'; drawerContent = <GroupContextContent conversationId={selectedConversation.id} /> }

  const closeDrawer = () => {
    const surfaces = useSurface.getState()
    if (infoParticipantId) surfaces.closeAgentInfo()
    else if (openThread) surfaces.closeThreadView()
    else if (documentId) surfaces.closeDocumentPeek()
    else if (calendarEventId) surfaces.closeCalendarEventPeek()
    else if (presentationId) closePresentationView()
    else if (drawerCanvasId) closeMobileCanvasView()
    else if (mobileContextOpen) closeMobileContext()
  }
  const drawerOwnsHeader = Boolean(calendarEventId || drawerCanvasId)
  const fullBleedDrawer = Boolean(presentationId || drawerCanvasId)
  const mobileChatOpen = isMobile && mobileConversationOpen && Boolean(selectedConversation)
  const drawerWidth = isMobile
    ? ' data-[vaul-drawer-direction=right]:w-screen data-[vaul-drawer-direction=right]:max-w-none'
    : ' w-[min(92vw,72rem)] sm:[--drawer-content-width:min(92vw,72rem)]'

  return (
    <div className="desktop-openmaus relative flex h-screen w-screen min-h-0 flex-row overflow-hidden bg-[var(--workspace-chrome-surface)]" data-electron={isElectron ? 'true' : 'false'} data-platform={platform} data-mobile={isMobile ? 'true' : 'false'} style={isMobile ? { paddingBlock: 'env(safe-area-inset-top) env(safe-area-inset-bottom)' } : undefined}>
      {!mobileChatOpen && <WorkspaceRail
          dashboardActive={dashboardOpen}
          onOpenDashboard={openDashboard}
          onOpenWorkspace={openWorkspace}
        />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--workspace-chrome-surface)]">
        {!isMobile && <div className="omb-drag flex h-5 shrink-0 items-center justify-center gap-1 px-2 text-accent-foreground" data-workspace-titlebar>
          {activeWorkspace && <CourseAvatar courseId={activeWorkspace.id} title={activeWorkspace.name} size="sm" className="!size-3 rounded-sm [&_[data-slot=avatar-fallback]]:rounded-sm [&_[data-slot=avatar-image]]:rounded-sm" />}
          <span className="max-w-56 truncate text-[11px] font-medium leading-none">{activeProjectName}</span>
        </div>}
        <div className="me-2 mb-2 min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl bg-background text-foreground shadow-sm">
          {dashboardOpen ? (
            <PersonalDashboard
              view={view}
              sidebarWidth={sidebarWidth}
              onLayoutChanged={handleSidebarLayoutChanged}
            />
          ) : isMobile ? (
            <div className="h-full min-h-0 min-w-0" data-mobile-conversation-page={mobileChatOpen ? 'chat' : 'list'}>
              {mobileChatOpen ? (
                <ChatPane
                  onBackToConversations={() => {
                    useApp.getState().selectConversation(null)
                    setMobileConversationOpen(false)
                  }}
                  groupContextOpen={contextOpen}
                  onToggleGroupContext={() => setGroupContextOpen((open) => !open)}
                />
              ) : (
                <div className="flex h-full min-h-0 flex-col bg-card">
                  <ConversationsPane onConversationSelected={() => setMobileConversationOpen(true)} />
                  <SidebarUserFooter />
                </div>
              )}
            </div>
          ) : <ResizablePanelGroup
            id="desktop-conversation-layout"
            orientation="horizontal"
            className="desktop-im-grid min-h-0 min-w-0"
            onLayoutChanged={handleSidebarLayoutChanged}
          >
            <ResizablePanel id="conversations" defaultSize={sidebarWidth} minSize={LEFT_COLUMN_MIN} maxSize={LEFT_COLUMN_MAX} groupResizeBehavior="preserve-pixel-size" className="min-h-0 min-w-0">
              <div className="flex h-full min-h-0 flex-col bg-card">
                <ConversationsPane />
                <SidebarUserFooter />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="desktop-panel-resize-handle" aria-label="调整会话列表宽度" title="拖动调整会话列表宽度，双击恢复默认" />
            <ResizablePanel id="conversation-workspace" defaultSize="75%" minSize={MIDDLE_COLUMN_MIN} className="min-h-0 min-w-0">
              <ResizablePanelGroup id="desktop-conversation-content-layout" orientation="horizontal" className="min-h-0 min-w-0">
                <ResizablePanel id="conversation" defaultSize="100%" minSize={MIDDLE_COLUMN_MIN} className="min-h-0 min-w-0">
                  <ChatPane groupContextOpen={contextOpen} onToggleGroupContext={() => setGroupContextOpen((open) => !open)} />
                </ResizablePanel>
                {contextOpen && <>
                  <ResizableHandle withHandle className="desktop-panel-resize-handle" aria-label="调整资料与 Canvas 工作区宽度" title="拖动调整资料与 Canvas 工作区宽度" />
                  <ResizablePanel id="context" defaultSize={CONTEXT_COLUMN_DEFAULT} minSize={CONTEXT_COLUMN_MIN} maxSize={CONTEXT_COLUMN_MAX} groupResizeBehavior="preserve-pixel-size" className="min-h-0 min-w-0 bg-card">
                    <div id="conversation-context-workspace" className="h-full min-h-0">
                      {selectedConversation && <GroupContextContent conversationId={selectedConversation.id} />}
                    </div>
                  </ResizablePanel>
                </>}
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>}
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer() }} direction="right">
        <DrawerContent id={mobileContextOpen ? 'conversation-context-workspace' : undefined} className={`${drawerWidth}${fullBleedDrawer ? ' max-w-none overflow-hidden p-0 before:inset-0 before:rounded-none before:border-0 sm:max-w-none' : ''}`} style={isMobile ? { top: 'env(safe-area-inset-top)', bottom: 'env(safe-area-inset-bottom)' } : undefined}>
          {drawerOwnsHeader ? <>
            <DrawerTitle className="sr-only">{drawerTitle}</DrawerTitle>
            <DrawerDescription className="sr-only">{drawerTitle}</DrawerDescription>
          </> : <DrawerHeader className="border-b border-hairline p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <DrawerTitle className="truncate">{drawerTitle}</DrawerTitle>
                <DrawerDescription className="sr-only">{drawerTitle}</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="关闭">
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>}
          <div className="min-h-0 flex-1 overflow-hidden">{drawerContent}</div>
        </DrawerContent>
      </Drawer>

      <Dialog open={!isMobile && Boolean(canvasId)} onOpenChange={(open) => { if (!open) closeCanvasView() }}>
        <DialogContent showCloseButton={false} className="h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-none">
          <DialogTitle className="sr-only">Canvas</DialogTitle>
          <DialogDescription className="sr-only">协作画布</DialogDescription>
          {canvasId && <CanvasView canvasId={canvasId} onBack={closeCanvasView} />}
        </DialogContent>
      </Dialog>

      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      <SettingsDialog />
      <SourceDetailOverlay />
    </div>
  )
}
