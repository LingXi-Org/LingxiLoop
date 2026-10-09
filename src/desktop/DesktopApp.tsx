import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { LayoutChangedMeta } from 'react-resizable-panels'
import { CommandPalette } from '@/components/CommandPalette'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { ConversationsPane } from '@/features/conversations/components/ConversationsPane'
import { useConversations } from '@/features/conversations/store'
import { useKnowledgeSources } from '@/features/knowledge/state'
import { useWorkspace } from '@/features/knowledge/workspace'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import { useSettingsDialog } from '@/features/settings/store'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { useEntrance } from '@/hooks/use-entrance'
import { DashboardSkeleton } from './DashboardSkeleton'
import { DocumentSkeleton } from '@/features/documents/components/DocumentSkeleton'
import { CanvasSkeleton } from '@/features/canvas/components/CanvasSkeleton'
import { PresentationSkeleton } from '@/features/presentations/components/PresentationSkeleton'
import { actionForKeyboardEvent } from '@/lib/commands'
import { retryWebNavigation } from '@/lib/navigation'
import { isElectron, platform } from '@/lib/runtime'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { Participant } from '@/types'
import { useSurface } from '@/stores/surface'
import { useTheme } from '@/stores/theme'
import { useUiCommands } from '@/stores/uiCommands'
import { ChatPane } from './ChatPane'
import { InfoPane } from './InfoPane'
import { ThreadDrawer } from './ThreadDrawer'
import { WorkspaceRail } from './WorkspaceRail'
import { useLearningSpaces } from './useLearningSpaces'
import { AgentsPage } from '@/features/agents/components/AgentsPage'
import { MailPage } from '@/features/email/components/MailPage'

const CanvasView = lazy(() => import('@/features/canvas/components/CanvasView').then((module) => ({ default: module.CanvasView })))
const CalendarPeekPane = lazy(() => import('@/features/calendar/components/CalendarPeekPane').then((module) => ({ default: module.CalendarPeekPane })))
const DocumentPeekPane = lazy(() => import('@/features/documents/components/DocumentPeekPane').then((module) => ({ default: module.DocumentPeekPane })))
const PresentationDrawerContent = lazy(() => import('@/features/presentations/components/PresentationDrawerContent').then((module) => ({ default: module.PresentationDrawerContent })))
const PersonalDashboard = lazy(() => import('./PersonalDashboard').then((module) => ({ default: module.PersonalDashboard })))

const DESKTOP_SIDEBAR_WIDTH_KEY = 'lingxiloop:desktop-layout:sidebar-width:v1'
const LEFT_COLUMN_DEFAULT = 300
const LEFT_COLUMN_MIN = 260
const LEFT_COLUMN_MAX = 360
const MIDDLE_COLUMN_MIN = 320

function loadSidebarWidth(): number {
  if (typeof window === 'undefined') return LEFT_COLUMN_DEFAULT
  try {
    const stored = window.localStorage.getItem(DESKTOP_SIDEBAR_WIDTH_KEY)
    const width = stored === null ? LEFT_COLUMN_DEFAULT : Number(stored)
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
  const learningSpaces = useLearningSpaces()
  const workspaces = useWorkspace((state) => state.list)
  const selectedWorkspaceId = useWorkspace((state) => state.selectedId)
  const activeWorkspace = workspaces.find((project) => project.id === selectedWorkspaceId)
  const activeProjectName = activeWorkspace?.name ?? '课程'
  const view = useApp((state) => state.view)
  const settingsOpen = useSettingsDialog((state) => state.open)
  const surface = useSurface((state) => state.surface)
  const infoParticipantId = surface?.kind === 'member' ? surface.participantId : null
  const openThread = surface?.kind === 'thread' ? surface : null
  const documentId = surface?.kind === 'document' ? surface.documentId : null
  const calendarEventId = surface?.kind === 'calendar' ? surface.eventId : null
  const canvasId = surface?.kind === 'canvas' ? surface.canvasId : null
  const presentationId = surface?.kind === 'presentation' ? surface.presentationId : null
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const selectedConversation = useConversations((state) => state.list.find((item) => item.id === selectedConversationId) ?? null)
  const mobileConversationOpen = useApp((state) => state.mobileConversationOpen)
  const navigationPending = useApp((state) => state.navigationPending)
  const navigationError = useApp((state) => state.navigationError)
  const canCreateCourse = useAuth((state) => state.companies.find((company) => company.id === state.activeCompanyId)?.role === 'teacher')
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false)
  const [createCourseOpen, setCreateCourseOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth)
  const pageRef = useEntrance(`${selectedWorkspaceId}:${view}`)

  useEffect(() => {
    window.lingxiloop?.windowChrome?.setTheme(theme)
  }, [theme])

  useEffect(() => {
    useKnowledgeSources.getState().close()
  }, [selectedWorkspaceId])

  const chooseWorkspace = () => setWorkspacePickerOpen(true)
  const openTeachingWorkspace = async (agent: Participant) => {
    const { user, activeCompanyId } = useAuth.getState()
    const target = learningSpaces.spaces.find((space) => space.companyId === activeCompanyId
      && space.projectId === agent.projectId && space.canManage && space.perspective === 'teacher')
    if (!target || learningSpaces.pending) return false
    await learningSpaces.select(target, 'learning')
    return useAuth.getState().user?.id === user?.id && useAuth.getState().activeCompanyId === activeCompanyId
      && useWorkspace.getState().selectedId === target.projectId && useApp.getState().view === 'learning'
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && commandPaletteOpen) { event.preventDefault(); setCommandPaletteOpen(false); return }
      const action = actionForKeyboardEvent(event)
      if (!action) return
      if (action.id === 'palette') { event.preventDefault(); setCommandPaletteOpen(true); return }
      if (action.id === 'find-chat') {
        if (view === 'conversations' && selectedConversationId) { event.preventDefault(); useUiCommands.getState().dispatch('find-chat') }
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
  }, [commandPaletteOpen, isMobile, selectedConversationId, view])

  const dashboardOpen = !['conversations', 'agents', 'mail'].includes(view)
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
    const focusTrigger = () => (document.querySelector<HTMLElement>(`[data-canvas-open-trigger="${CSS.escape(closingCanvasId)}"]`)
      ?? document.querySelector<HTMLElement>('[data-canvas-popover-trigger]'))?.focus({ preventScroll: true })
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
  const drawerCanvasId = isMobile ? canvasId : null
  const drawerOpen = Boolean(infoParticipantId || openThread || documentId || calendarEventId || presentationId || drawerCanvasId)
  let drawerTitle = '会话详情'
  let drawerContent: React.ReactNode = null

  if (infoParticipantId) { drawerTitle = '成员资料'; drawerContent = <InfoPane onChooseWorkspace={chooseWorkspace} onOpenTeachingWorkspace={openTeachingWorkspace} /> }
  else if (openThread) { drawerTitle = '回复串'; drawerContent = <ThreadDrawer /> }
  else if (documentId) { drawerTitle = '文档'; drawerContent = <DocumentPeekPane /> }
  else if (calendarEventId) { drawerTitle = '日历事件'; drawerContent = <CalendarPeekPane /> }
  else if (presentationId) { drawerTitle = '演示文稿'; drawerContent = <PresentationDrawerContent presentationId={presentationId} /> }
  else if (drawerCanvasId) { drawerTitle = 'Canvas'; drawerContent = <CanvasView canvasId={drawerCanvasId} onBack={closeCanvasView} /> }

  const closeDrawer = () => {
    const surfaces = useSurface.getState()
    if (infoParticipantId) surfaces.closeAgentInfo()
    else if (openThread) surfaces.closeThreadView()
    else if (documentId) surfaces.closeDocumentPeek()
    else if (calendarEventId) surfaces.closeCalendarEventPeek()
    else if (presentationId) closePresentationView()
    else if (drawerCanvasId) closeCanvasView()
  }
  const drawerOwnsHeader = Boolean(calendarEventId || drawerCanvasId)
  const fullBleedDrawer = Boolean(presentationId || drawerCanvasId)
  const mobileChatOpen = !dashboardOpen && !learningSpaces.pending && isMobile && mobileConversationOpen && Boolean(selectedConversation)
  const drawerWidth = isMobile
    ? ' data-[vaul-drawer-direction=right]:w-screen data-[vaul-drawer-direction=right]:max-w-none'
    : ' w-[min(92vw,72rem)] sm:[--drawer-content-width:min(92vw,72rem)]'

  return (
    <div className="desktop-openmaus relative flex h-dvh w-full min-h-0 flex-row overflow-hidden bg-[var(--workspace-chrome-surface)]" data-electron={isElectron ? 'true' : 'false'} data-platform={platform} data-mobile={isMobile ? 'true' : 'false'} style={isMobile ? { paddingBlock: 'env(safe-area-inset-top) env(safe-area-inset-bottom)' } : undefined}>
      {!mobileChatOpen && <WorkspaceRail
          {...learningSpaces}
          onSelect={(space) => void learningSpaces.select(space)}
          onReload={() => void learningSpaces.reload()}
          onNavigate={(next) => useApp.getState().setView(next)}
          workspacePickerOpen={workspacePickerOpen}
          onWorkspacePickerOpenChange={setWorkspacePickerOpen}
          createCourseOpen={createCourseOpen}
          onCreateCourseOpenChange={setCreateCourseOpen}
        />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--workspace-chrome-surface)]">
        {!isMobile && <div className="omb-drag flex h-7 shrink-0 items-center justify-center gap-1.5 px-2 text-accent-foreground" data-workspace-titlebar>
          {activeWorkspace && <CourseAvatar avatarUrl={activeWorkspace.avatarUrl} courseId={activeWorkspace.courseId ?? activeWorkspace.id} title={activeWorkspace.name} size="sm" className="!size-3 rounded-sm [&_[data-slot=avatar-fallback]]:rounded-sm [&_[data-slot=avatar-image]]:rounded-sm" />}
          <span className="max-w-80 truncate text-xs font-medium leading-none">{activeProjectName}</span>
        </div>}
        {navigationError && <Alert variant="destructive" className="mb-2 me-2 w-auto shrink-0"><AlertDescription className="flex items-center justify-between gap-3"><span>{navigationError}</span><Button variant="outline" size="sm" onClick={() => void retryWebNavigation()}>重试</Button></AlertDescription></Alert>}
        <div ref={pageRef} data-ui-page={view} aria-busy={navigationPending || undefined} className="me-2 mb-2 min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl border border-border bg-background text-foreground">
          {navigationPending ? <ResourceSkeleton variant="list" label="正在打开工作区" /> : !selectedWorkspaceId || dashboardOpen ? (
            <Suspense fallback={<DashboardSkeleton view={view} perspective={learningSpaces.activeSpace?.perspective} />}>
              <PersonalDashboard
                view={view}
                space={learningSpaces.activeSpace}
                loading={learningSpaces.loading && !learningSpaces.activeSpace}
                error={learningSpaces.error}
                onRetry={() => void learningSpaces.reload()}
                hasSpaces={learningSpaces.spaces.length > 0}
                canCreateCourse={canCreateCourse}
                onChooseWorkspace={chooseWorkspace}
                onCreateCourse={() => setCreateCourseOpen(true)}
              />
            </Suspense>
          ) : view === 'agents' ? <AgentsPage key={selectedWorkspaceId} onChooseWorkspace={chooseWorkspace} onOpenTeachingWorkspace={openTeachingWorkspace} /> : view === 'mail' ? <MailPage key={selectedWorkspaceId} /> : isMobile ? (
            <div className="h-full min-h-0 min-w-0" data-mobile-conversation-page={mobileChatOpen ? 'chat' : 'list'}>
              {mobileChatOpen ? (
                <ChatPane
                  onChooseWorkspace={chooseWorkspace}
                  onBackToConversations={() => {
                    useApp.getState().selectConversation(null)
                  }}
                />
              ) : (
                <div className="flex h-full min-h-0 flex-col bg-card">
                  <ConversationsPane />
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
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle className="desktop-panel-resize-handle" aria-label="调整会话列表宽度" title="拖动调整会话列表宽度，双击恢复默认" />
            <ResizablePanel id="conversation-workspace" minSize={MIDDLE_COLUMN_MIN} className="min-h-0 min-w-0">
              <ChatPane onChooseWorkspace={chooseWorkspace} />
            </ResizablePanel>
          </ResizablePanelGroup>}
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer() }} direction="right">
        <DrawerContent className={`${drawerWidth}${fullBleedDrawer ? ' max-w-none overflow-hidden p-0 before:inset-0 before:rounded-none before:border-0 sm:max-w-none' : ''}`} style={isMobile ? { top: 'env(safe-area-inset-top)', bottom: 'env(safe-area-inset-bottom)' } : undefined}>
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
          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<div className="flex h-full flex-col">{drawerOwnsHeader && <Button type="button" variant="ghost" className="m-2 self-start" onClick={closeDrawer}>关闭</Button>}{documentId ? <DocumentSkeleton /> : presentationId ? <PresentationSkeleton /> : drawerCanvasId ? <CanvasSkeleton /> : <ResourceSkeleton variant="detail" label={`正在打开${drawerTitle}`} />}</div>}>
              {drawerContent}
            </Suspense>
          </div>
        </DrawerContent>
      </Drawer>

      <Dialog open={!isMobile && Boolean(canvasId)} onOpenChange={(open) => { if (!open) closeCanvasView() }}>
        <DialogContent showCloseButton={false} className="h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none gap-0 overflow-hidden rounded-2xl bg-card p-0 sm:max-w-none">
          <DialogTitle className="sr-only">Canvas</DialogTitle>
          <DialogDescription className="sr-only">协作画布</DialogDescription>
          <Suspense fallback={<div className="flex h-full flex-col"><Button type="button" variant="ghost" className="m-2 self-start" onClick={closeCanvasView}>关闭画布</Button><CanvasSkeleton /></div>}>
            {canvasId && <CanvasView canvasId={canvasId} onBack={closeCanvasView} />}
          </Suspense>
        </DialogContent>
      </Dialog>

      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      {settingsOpen && <SettingsDialog />}
      <SourceDetailOverlay />
    </div>
  )
}
