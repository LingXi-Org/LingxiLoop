import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useState } from 'react'
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SidebarUserFooter } from '@/features/conversations/components/ConversationsPane'
import { learningApi } from '@/features/learning/api'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import { LearningDashboardPanel } from '@/features/learning/dashboard/LearningDashboardPanel'
import {
  getLearningDashboardDefaultSection,
  getLearningDashboardMenu,
  isLearningDashboardSectionAvailable,
  type LearningDashboardSection,
} from '@/features/learning/dashboard/navigation'
import type { LearningSpace } from '@/features/learning/contracts'
import { selectLearningSpace, useWorkspace } from '@/features/knowledge/workspace'
import { useIsMobile } from '@/hooks/use-mobile'
import { toastAction } from '@/lib/actionToast'
import { userFacingError } from '@/lib/userFacingError'
import { useApp } from '@/stores/app'
import type { ViewKey } from '@/types'
import { getLearningSpaceScopes } from './dashboardScope'

type DashboardView = Exclude<ViewKey['view'], 'conversations'>
const MAX_SPACE_PAGES = 50

function initialSection(view: DashboardView): LearningDashboardSection {
  if (view === 'calendar') return 'calendar'
  if (view === 'library') return 'resources'
  if (view === 'courses') return 'settings'
  return 'overview'
}

function appViewForSection(section: LearningDashboardSection): DashboardView {
  if (section === 'calendar') return 'calendar'
  if (section === 'resources') return 'library'
  if (section === 'settings') return 'courses'
  return 'learning'
}

export function PersonalDashboard({
  view,
  sidebarWidth,
  onLayoutChanged,
}: {
  view: DashboardView
  sidebarWidth: number
  onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
}) {
  const isMobile = useIsMobile()
  const selectedWorkspaceId = useWorkspace((state) => state.selectedId)
  const selectedCompanyId = useWorkspace((state) => state.companyId)
  const [spaces, setSpaces] = useState<LearningSpace[]>([])
  const [spacesLoading, setSpacesLoading] = useState(true)
  const [spaceError, setSpaceError] = useState('')
  const [pagePending, setPagePending] = useState(false)
  const [section, setSection] = useState<LearningDashboardSection>(() => initialSection(view))

  const loadSpaces = useCallback(async () => {
    setSpacesLoading(true)
    setSpaceError('')
    try {
      const byProjectId = new Map<string, LearningSpace>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      for (let pageIndex = 0; pageIndex < MAX_SPACE_PAGES; pageIndex += 1) {
        const page = await learningApi.listSpaces({ cursor, limit: 100 })
        for (const space of page.data) byProjectId.set(space.projectId, space)
        if (!page.nextCursor) {
          cursor = undefined
          break
        }
        if (cursors.has(page.nextCursor)) throw new Error('repeated learning spaces cursor')
        cursors.add(page.nextCursor)
        cursor = page.nextCursor
      }
      if (cursor) throw new Error('learning spaces page limit exceeded')
      setSpaces([...byProjectId.values()])
    } catch (reason) {
      setSpaceError(userFacingError(reason, '学习区暂时无法加载，请稍后重试。'))
    } finally {
      setSpacesLoading(false)
    }
  }, [])

  useEffect(() => { void loadSpaces() }, [loadSpaces, selectedCompanyId])
  useEffect(() => {
    const refresh = () => void loadSpaces()
    window.addEventListener('lingxiloop:learning-spaces-updated', refresh)
    return () => window.removeEventListener('lingxiloop:learning-spaces-updated', refresh)
  }, [loadSpaces])

  const scopes = getLearningSpaceScopes(spaces)
  const activeSpace = scopes.visible.find(
    (space) => space.companyId === selectedCompanyId && space.projectId === selectedWorkspaceId,
  )
  const personal = activeSpace?.projectKind === 'PERSONAL_LEARNING'
  const menu = activeSpace ? getLearningDashboardMenu({ personal, perspective: activeSpace.perspective }) : []

  useEffect(() => {
    if (!activeSpace) return
    const context = { personal: activeSpace.projectKind === 'PERSONAL_LEARNING', perspective: activeSpace.perspective }
    setSection((current) => isLearningDashboardSectionAvailable(current, context)
      ? current
      : getLearningDashboardDefaultSection(context))
  }, [activeSpace?.projectId, activeSpace?.perspective, activeSpace?.projectKind])

  const openSection = (next: LearningDashboardSection) => {
    setSection(next)
    const nextView = appViewForSection(next)
    if (nextView !== view) useApp.getState().setView(nextView)
  }

  const openWorkspace = async (projectId: string, destination: DashboardView = 'learning') => {
    const target = scopes.visible.find((space) => space.projectId === projectId)
    if (!target || (target.projectId === selectedWorkspaceId && target.companyId === selectedCompanyId)) return
    const previous = activeSpace
    setPagePending(true)
    const selection = selectLearningSpace({ companyId: target.companyId, projectId: target.projectId }).catch(
      async (reason) => {
        if (previous) {
          await selectLearningSpace({ companyId: previous.companyId, projectId: previous.projectId }).catch(
            () => undefined,
          )
          useApp.getState().setView(view)
        }
        throw reason
      },
    )
    useApp.getState().setView(destination)
    try {
      await toastAction(selection, {
        loading: '正在切换学习区',
        success: `已切换到${target.title}`,
        error: (reason) => userFacingError(reason, '切换学习区失败，已恢复原学习区。'),
      })
    } catch {
      // Toast owns the visible error state and the previous selection has been restored.
    } finally {
      setPagePending(false)
    }
  }

  const workspaceSelector = spacesLoading && spaces.length === 0 ? <Skeleton className={isMobile ? 'h-11 w-full rounded-2xl' : 'h-8 w-full rounded-xl'} /> : (
    <Select
      value={activeSpace?.projectId}
      disabled={pagePending}
      onValueChange={(projectId) => void openWorkspace(projectId)}
    >
      <SelectTrigger aria-label="切换个人学习区或课程" className={isMobile ? 'h-11 min-w-0 w-full rounded-2xl bg-muted/60 px-3 shadow-none' : 'h-8 min-w-0 w-full bg-input/50 shadow-none'}>
        <SelectValue placeholder="选择学习区" />
      </SelectTrigger>
      <SelectContent>
        {scopes.personal && (
          <SelectItem value={scopes.personal.projectId}>
            <span className="flex min-w-0 items-center gap-2"><CourseAvatar courseId={scopes.personal.projectId} title={scopes.personal.title} size="sm" /><span className="truncate">{scopes.personal.title || '个人学习区'}</span></span>
          </SelectItem>
        )}
        {scopes.courses.map((space) => (
          <SelectItem key={space.projectId} value={space.projectId}>
            <span className="flex min-w-0 items-center gap-2"><CourseAvatar courseId={space.courseId ?? space.projectId} title={space.title} size="sm" /><span className="truncate">{space.title}</span></span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
  const dashboardContent = pagePending || (spacesLoading && !activeSpace) ? <DashboardSkeleton /> : spaceError && !activeSpace ? (
    <div className="p-6"><Alert variant="destructive"><AlertDescription>{spaceError}</AlertDescription></Alert></div>
  ) : activeSpace ? <LearningDashboardPanel
    key={activeSpace.projectId}
    space={activeSpace}
    spaces={scopes.visible}
    section={section}
    onOpenLearningSpace={(projectId) => void openWorkspace(projectId, 'library')}
  /> : (
    <div className="grid h-full place-items-center p-6 text-center"><div><p className="font-heading text-base font-medium">{scopes.visible.length > 0 ? '当前学习区不可用' : '还没有学习区'}</p><p className="mt-1 text-sm text-muted-foreground">{scopes.visible.length > 0 ? '请从左上方选择一个可访问的学习区。' : '创建个人学习区或加入课程后会显示在这里。'}</p></div></div>
  )

  if (isMobile) {
    return <Tabs
      value={section}
      onValueChange={(value) => openSection(value as LearningDashboardSection)}
      className="@container/mobile-dashboard-nav flex h-full min-h-0 min-w-0 flex-col gap-0 bg-card"
      data-mobile-dashboard
    >
      <header className="shrink-0 space-y-2 bg-card px-3 pb-2 pt-3 shadow-xs">
        <div>
          <p className="mb-1 px-1 text-[11px] font-medium text-muted-foreground">学习看板 · 当前学习区</p>
          {workspaceSelector}
        </div>
        <TabsList aria-label="切换看板栏目" className="h-12 w-full rounded-2xl bg-muted/60 p-1">
          {menu.map((item) => (
            <TabsTrigger
              key={item.section}
              value={item.section}
              disabled={pagePending}
              className="min-w-0 rounded-xl px-2 text-xs"
              aria-label={item.label}
            >
              <HugeiconsIcon icon={item.icon} strokeWidth={2} />
              <span className="truncate @max-[20rem]/mobile-dashboard-nav:sr-only">{item.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </header>
      <TabsContent value={section} forceMount className="m-0 min-h-0 min-w-0 flex-1 overflow-hidden">
        {dashboardContent}
      </TabsContent>
    </Tabs>
  }

  return (
    <SidebarProvider className="h-full min-h-0 bg-card" style={{ '--sidebar-width': '100%' } as React.CSSProperties}>
      <ResizablePanelGroup id="dashboard-two-panel-layout" orientation="horizontal" className="min-h-0 min-w-0" onLayoutChanged={onLayoutChanged}>
        <ResizablePanel id="conversations" defaultSize={sidebarWidth} minSize={240} maxSize={360} groupResizeBehavior="preserve-pixel-size" className="min-h-0 min-w-0">
          <Sidebar collapsible="none" className="w-full shrink-0 bg-card text-card-foreground">
            <SidebarHeader className="omb-drag h-12 shrink-0 justify-center p-2">
              <div className="omb-no-drag w-full">{workspaceSelector}</div>
            </SidebarHeader>
            <SidebarContent className="gap-1 px-2 pb-2 pt-0.5">
              <SidebarGroup className="p-0">
                <SidebarGroupLabel>{personal ? '个人学习区' : activeSpace?.title ?? '学习看板'}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {menu.map((item) => (
                      <SidebarMenuItem key={item.section}>
                        <SidebarMenuButton isActive={section === item.section} onClick={() => openSection(item.section)}>
                          <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarUserFooter />
          </Sidebar>
        </ResizablePanel>
        <ResizableHandle withHandle className="desktop-panel-resize-handle" aria-label="调整看板侧边栏宽度" title="拖动调整看板侧边栏宽度，双击恢复默认" />
        <ResizablePanel id="conversation" defaultSize="75%" minSize={320} className="min-h-0 min-w-0">
          <SidebarInset className="h-full min-h-0 min-w-0 overflow-hidden bg-card text-card-foreground">
            {dashboardContent}
          </SidebarInset>
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarProvider>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col" role="status" aria-label="正在加载学习看板">
      <span className="sr-only">正在加载学习看板</span>
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--im-divider-weak)] px-4"><Skeleton className="size-6 rounded-lg" /><Skeleton className="h-4 w-28" /><Skeleton className="ms-auto h-6 w-14 rounded-full" /></div>
      <div className="grid min-h-0 flex-1 gap-4 p-4 @min-[48rem]:grid-cols-2 @min-[48rem]:p-6"><Skeleton className="h-32 rounded-4xl" /><Skeleton className="h-32 rounded-4xl" /><Skeleton className="h-64 rounded-4xl @min-[48rem]:col-span-2" /></div>
    </div>
  )
}
