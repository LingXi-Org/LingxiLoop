import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { CommandPalette } from '@/components/CommandPalette'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import '@/features/design/design-workspace.css'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { CourseNav } from '@/components/shell/CourseNav'
import { SlidesSidebarLayout } from '@/components/shell/SlidesSidebarLayout'
import { moduleForView, rememberCourseView } from '@/components/shell/modules'
import { RightPanelHeader } from '@/components/shell/RightPanel'
import { ShellNavContext, ShellNavTriggerContext } from '@/components/shell/ShellNav'
import { PanelLeft } from 'lucide-react'
import { SourceDetailOverlay } from '@/components/WorkspaceChrome'
import { ConversationsPane } from '@/features/conversations/components/ConversationsPane'
import { useConversations } from '@/features/conversations/store'
import { useKnowledgeSources } from '@/features/knowledge/state'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useSettingsDialog } from '@/features/settings/store'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { useEntrance } from '@/hooks/use-entrance'
import { DashboardSkeleton } from './DashboardSkeleton'
import { DocumentSkeleton } from '@/features/documents/components/DocumentSkeleton'
import { actionForKeyboardEvent } from '@/lib/commands'
import { retryWebNavigation } from '@/lib/navigation'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { Participant } from '@/types'
import { useSurface } from '@/stores/surface'
import { useUiCommands } from '@/stores/uiCommands'
import { WorkspaceRail } from './WorkspaceRail'
import { LEFT_COLUMN_MIN, LEFT_COLUMN_MAX, useSidebarWidth } from './useSidebarWidth'
import type { useLearningSpaces } from './useLearningSpaces'

const ChatPane = lazy(() => import('./ChatPane').then((module) => ({ default: module.ChatPane })))
const InfoPane = lazy(() => import('./InfoPane').then((module) => ({ default: module.InfoPane })))
const ThreadDrawer = lazy(() => import('./ThreadDrawer').then((module) => ({ default: module.ThreadDrawer })))
const CasesPage = lazy(() => import('@/features/cases/CasesPage').then((module) => ({ default: module.CasesPage })))
const SlidesPage = lazy(() => import('@/features/slides/SlidesPage').then((module) => ({ default: module.SlidesPage })))
const DocumentPeekPane = lazy(() => import('@/features/documents/components/DocumentPeekPane').then((module) => ({ default: module.DocumentPeekPane })))
const PersonalDashboard = lazy(() => import('./PersonalDashboard').then((module) => ({ default: module.PersonalDashboard })))

const MIDDLE_COLUMN_MIN = 320

/** The desktop shell switches between the resizable IM workspace and the
 * personal dashboard. Compact object details continue to use the shared Drawer. */
export function DesktopApp({ learningSpaces }: { learningSpaces: ReturnType<typeof useLearningSpaces> }) {
  const userId = useAuth(state => state.user?.id)
  const companyId = useAuth((state) => state.activeCompanyId)
  const companyRole = useAuth((state) => state.companies.find(company => company.id === state.activeCompanyId)?.role)
  const isMobile = useIsMobile()
  const selectedWorkspaceId = useWorkspace((state) => state.selectedId)
  const view = useApp((state) => state.view)
  const settingsOpen = useSettingsDialog((state) => state.open)
  const surface = useSurface((state) => state.surface)
  const infoParticipantId = surface?.kind === 'member' ? surface.participantId : null
  const openThread = surface?.kind === 'thread' ? surface : null
  const documentId = surface?.kind === 'document' ? surface.documentId : null
  const selectedConversationId = useApp((state) => state.selectedConversationId)
  const selectedConversation = useConversations((state) => state.list.find((item) => item.id === selectedConversationId) ?? null)
  const mobileConversationOpen = useApp((state) => state.mobileConversationOpen)
  const navigationPending = useApp((state) => state.navigationPending)
  const navigationError = useApp((state) => state.navigationError)
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const { width: sidebarWidth, panelRef: sidebarPanel, onLayoutChanged: handleSidebarLayoutChanged, resetWidth: resetSidebarWidth } = useSidebarWidth()
  const designOpen = surface?.kind === 'design'
  const [sidebarOpen, setSidebarOpen] = useState(!designOpen)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pageRef = useEntrance(`${selectedWorkspaceId}:${view}`)

  useEffect(() => {
    useKnowledgeSources.getState().close()
  }, [selectedWorkspaceId])

  const chooseWorkspace = () => setWorkspacePickerOpen(true)
  const openTeachingWorkspace = async (agent: Participant) => {
    const { user, activeCompanyId } = useAuth.getState()
    const target = learningSpaces.spaces.find((space) => space.companyId === activeCompanyId
      && space.projectId === agent.projectId && space.canManage && space.perspective === 'teacher')
    if (!target || learningSpaces.pending) return false
    await learningSpaces.select(target, 'forum')
    return useAuth.getState().user?.id === user?.id && useAuth.getState().activeCompanyId === activeCompanyId
      && useWorkspace.getState().selectedId === target.projectId && useApp.getState().view === 'forum'
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

  const dashboardOpen = view !== 'conversations'
  const shellModule = moduleForView(view)
  useLayoutEffect(() => { setSidebarOpen(!designOpen) }, [designOpen, selectedConversationId])
  useLayoutEffect(() => {
    if (isMobile) return
    if (shellModule === 'chat' && !sidebarOpen) sidebarPanel.current?.collapse()
    else sidebarPanel.current?.expand()
  }, [sidebarOpen, shellModule, isMobile, sidebarPanel])
  useEffect(() => { rememberCourseView(view) }, [view])
  useEffect(() => { if (!isMobile) setMobileNavOpen(false) }, [isMobile])
  const mobileNav = isMobile && shellModule === 'course' ? () => setMobileNavOpen(true) : null
  const chatReady = Boolean(selectedWorkspaceId) && !navigationPending
  const directPage = shellModule === 'cases' || isMobile && (shellModule !== 'chat' || !chatReady)
  const secondary = shellModule === 'chat' ? <ConversationsPane />
    : shellModule === 'course' ? <CourseNav space={learningSpaces.activeSpace} /> : null
  const chatActive = shellModule === 'chat' && chatReady
  const chatVisible = chatActive && (!isMobile || mobileConversationOpen)
  const slidesActive = shellModule === 'slides' && Boolean(selectedWorkspaceId) && !navigationPending
  const scope = JSON.stringify([userId, companyId, selectedWorkspaceId, navigationPending])
  const [retained, setRetained] = useState({ scope, chat: chatActive, slides: slidesActive })
  const keepChat = !navigationPending && (chatActive || retained.scope === scope && retained.chat)
  const keepSlides = !navigationPending && (slidesActive || retained.scope === scope && retained.slides)
  if (retained.scope !== scope || retained.chat !== keepChat || retained.slides !== keepSlides) setRetained({ scope, chat: keepChat, slides: keepSlides })
  const chatPage = keepChat ? <Suspense fallback={<ResourceSkeleton variant="detail" label="正在打开会话" />}><ChatPane visible={chatVisible} onChooseWorkspace={chooseWorkspace} onBackToConversations={isMobile ? () => useApp.getState().showConversationList() : undefined} /></Suspense> : null
  const page = navigationPending ? <ResourceSkeleton variant="list" label="正在打开工作区" />
    : view === 'cases' ? <Suspense fallback={<ResourceSkeleton variant="list" label="正在加载案例库" />}><CasesPage key={companyId} /></Suspense>
    : chatActive || slidesActive ? null
    : <Suspense fallback={<DashboardSkeleton view={view} perspective={learningSpaces.activeSpace?.perspective} />}>
        <PersonalDashboard
          view={view}
          companyRole={companyRole}
          space={learningSpaces.activeSpace}
          loading={learningSpaces.loading && !learningSpaces.activeSpace}
          error={learningSpaces.error}
          onRetry={() => void learningSpaces.reload()}
          hasSpaces={learningSpaces.spaces.length > 0}
          onChooseWorkspace={chooseWorkspace}
        />
      </Suspense>
  const animatedPage = <div ref={pageRef} className="h-full min-h-0 min-w-0">{page}</div>

  const drawerOpen = Boolean(infoParticipantId || openThread || documentId)
  let drawerTitle = '会话详情'
  let drawerContent: React.ReactNode = null

  if (infoParticipantId) { drawerTitle = '资料'; drawerContent = <InfoPane onChooseWorkspace={chooseWorkspace} onOpenTeachingWorkspace={openTeachingWorkspace} /> }
  else if (openThread) { drawerTitle = '回复串'; drawerContent = <ThreadDrawer /> }
  else if (documentId) { drawerTitle = '文档'; drawerContent = <DocumentPeekPane /> }

  const closeDrawer = () => {
    const surfaces = useSurface.getState()
    if (infoParticipantId) surfaces.closeAgentInfo()
    else if (openThread) surfaces.closeThreadView()
    else if (documentId) surfaces.closeDocumentPeek()
  }
  const mobileChatOpen = !dashboardOpen && !learningSpaces.pending && isMobile && mobileConversationOpen && Boolean(selectedConversation)
  const drawerWidth = isMobile
    ? ' data-[vaul-drawer-direction=right]:w-screen data-[vaul-drawer-direction=right]:max-w-none'
    : infoParticipantId ? ' w-[min(92vw,360px)] rounded-s-2xl sm:[--drawer-content-width:min(92vw,360px)]'
      : openThread ? ' w-[min(92vw,400px)] rounded-s-2xl sm:[--drawer-content-width:min(92vw,400px)]'
        : ' w-[min(92vw,72rem)] sm:[--drawer-content-width:min(92vw,72rem)]'

  return (
    <div className="desktop-openmaus relative flex h-dvh w-full min-h-0 flex-row overflow-hidden bg-[var(--workspace-chrome-surface)]" data-cases-shell={shellModule === 'cases' || undefined} data-mobile={isMobile ? 'true' : 'false'} style={isMobile ? { paddingBlock: 'env(safe-area-inset-top) env(safe-area-inset-bottom)' } : undefined}>
      {!mobileChatOpen && <WorkspaceRail
          {...learningSpaces}
          onSelect={(space) => void learningSpaces.select(space)}
          onReload={() => void learningSpaces.reload()}
          onNavigate={(next) => useApp.getState().setView(next)}
          workspacePickerOpen={workspacePickerOpen}
          onWorkspacePickerOpenChange={setWorkspacePickerOpen}
        />}
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--workspace-chrome-surface)] ${isMobile ? '' : 'pe-2 pt-2'}`}>
        {navigationError && <Alert variant="destructive" className="mb-2 w-auto shrink-0"><AlertDescription className="flex items-center justify-between gap-3"><span>{navigationError}</span><Button variant="outline" size="sm" onClick={() => void retryWebNavigation()}>重试</Button></AlertDescription></Alert>}
        <div data-ui-page={view} data-shell-module={shellModule} aria-busy={navigationPending || undefined} className={`relative ${isMobile ? '' : 'mb-2 rounded-[14px] border border-border'} min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-foreground`}>
          <ShellNavContext.Provider value={mobileNav}>
          <ShellNavTriggerContext.Provider value={!isMobile && shellModule === 'chat' ? <Button type="button" variant="ghost" size="icon"
            aria-label={sidebarOpen ? '收起会话列表' : '展开会话列表'} aria-expanded={sidebarOpen} aria-controls="conversations"
            onClick={() => setSidebarOpen(value => !value)} className="size-8 shrink-0 rounded-lg text-muted-foreground hover:bg-accent"><PanelLeft className="size-4" strokeWidth={1.7} /></Button> : null}>
          <div key={`conversation:${scope}`} style={shellModule === 'slides' || directPage ? { position: 'absolute', inset: 0, visibility: 'hidden', opacity: 0, pointerEvents: 'none' } : undefined} inert={shellModule === 'slides' || directPage} aria-hidden={shellModule === 'slides' || directPage} className="h-full min-h-0 min-w-0">
          <ResizablePanelGroup
            id="desktop-conversation-layout"
            orientation="horizontal"
            className="desktop-im-grid min-h-0 min-w-0"
            data-mobile-conversation-page={isMobile ? mobileChatOpen ? 'chat' : 'list' : undefined}
            onLayoutChanged={handleSidebarLayoutChanged}
          >
            <ResizablePanel id="conversations" panelRef={sidebarPanel} collapsible={!isMobile && shellModule === 'chat'} collapsedSize={0}
              onResize={size => { if (!isMobile && shellModule === 'chat') setSidebarOpen(size.inPixels > 0) }}
              aria-hidden={!isMobile && shellModule === 'chat' && !sidebarOpen} inert={!isMobile && shellModule === 'chat' && !sidebarOpen}
              data-shell-panel-hidden={isMobile && mobileChatOpen} defaultSize={sidebarWidth} minSize={isMobile ? 0 : LEFT_COLUMN_MIN} maxSize={isMobile ? '100%' : LEFT_COLUMN_MAX} groupResizeBehavior="preserve-pixel-size" className="min-h-0 min-w-0">
              <div className="flex h-full min-h-0 flex-col bg-sidebar" data-secondary-sidebar={shellModule}>
                {secondary}
              </div>
            </ResizablePanel>
            <ResizableHandle data-shell-panel-hidden={isMobile || shellModule === 'chat' && !sidebarOpen} withHandle className="desktop-panel-resize-handle" aria-label="调整侧边栏宽度" title="拖动调整侧边栏宽度，双击恢复默认"
              onDoubleClick={resetSidebarWidth} />
            <ResizablePanel id="conversation-workspace" data-shell-panel-hidden={isMobile && !mobileChatOpen} minSize={isMobile ? 0 : MIDDLE_COLUMN_MIN} className="relative min-h-0 min-w-0">
              <div style={!chatActive ? { position: 'absolute', inset: 0, visibility: 'hidden', opacity: 0, pointerEvents: 'none' } : undefined} aria-hidden={!chatActive} inert={!chatActive} className="h-full min-h-0 min-w-0">{chatPage}</div>
              {!chatActive && !directPage && animatedPage}
            </ResizablePanel>
          </ResizablePanelGroup>
          </div>
          {keepSlides && selectedWorkspaceId && <div key={`slides:${scope}`} style={!slidesActive ? { position: 'absolute', inset: 0, visibility: 'hidden', opacity: 0, pointerEvents: 'none' } : undefined} aria-hidden={!slidesActive} inert={!slidesActive} className="h-full min-h-0 min-w-0">
            <SlidesSidebarLayout active={slidesActive}><Suspense fallback={<ResourceSkeleton variant="list" label="正在加载演示文稿" />}><SlidesPage projectId={selectedWorkspaceId} active={slidesActive} /></Suspense></SlidesSidebarLayout>
          </div>}
          {shellModule === 'slides' && !slidesActive && animatedPage}
          {directPage && shellModule !== 'slides' && animatedPage}
          </ShellNavTriggerContext.Provider>
          </ShellNavContext.Provider>
        </div>
      </div>
      {isMobile && shellModule === 'course' ? <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" showCloseButton={false} className="gap-0 p-0 data-[side=left]:w-[min(20rem,calc(100vw-3rem))] motion-reduce:animate-none motion-reduce:transition-none" style={{ paddingBlock: 'env(safe-area-inset-top) env(safe-area-inset-bottom)' }}>
          <SheetTitle className="sr-only">课程导航</SheetTitle>
          <SheetDescription className="sr-only">切换当前模块的页面</SheetDescription>
          <CourseNav space={learningSpaces.activeSpace} onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet> : null}

      <Drawer open={drawerOpen} onOpenChange={(open) => { if (!open) closeDrawer() }} direction="right">
        <DrawerContent className={drawerWidth} style={isMobile ? { top: 'env(safe-area-inset-top)', bottom: 'env(safe-area-inset-bottom)' } : undefined}>
          <DrawerTitle className="sr-only">{drawerTitle}</DrawerTitle>
          <DrawerDescription className="sr-only">{drawerTitle}</DrawerDescription>
          <RightPanelHeader title={drawerTitle} onClose={closeDrawer} closeLabel={`关闭${drawerTitle}`} />
          <div className="min-h-0 flex-1 overflow-hidden">
            <Suspense fallback={<div className="flex h-full flex-col">{documentId ? <DocumentSkeleton /> : <ResourceSkeleton variant="detail" label={`正在打开${drawerTitle}`} />}</div>}>
              {drawerContent}
            </Suspense>
          </div>
        </DrawerContent>
      </Drawer>

      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      {settingsOpen && <SettingsDialog />}
      <SourceDetailOverlay />
    </div>
  )
}
