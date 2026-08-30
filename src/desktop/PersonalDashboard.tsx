import {
  BookOpen01Icon,
  Calendar03Icon,
  DashboardSquare01Icon,
  Folder01Icon,
  Mail01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
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
import { CalendarView } from '@/features/calendar/components/CalendarView'
import { CompanyCourseManagement } from '@/features/companies/components/CompanyCourseManagement'
import { SidebarUserFooter } from '@/features/conversations/components/ConversationsPane'
import { DocumentsView } from '@/features/documents/components/DocumentsView'
import { useWorkspace } from '@/features/knowledge/workspace'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import { LearningCenter } from '@/features/learning/components/LearningCenter'
import { useApp } from '@/stores/app'
import type { ViewKey } from '@/types'
import { getDashboardScopes } from './dashboardScope'

type DashboardView = Exclude<ViewKey['view'], 'conversations'>

const DASHBOARD_ITEMS: Array<{
  value: Exclude<DashboardView, 'courses'>
  label: string
  icon: typeof DashboardSquare01Icon
}> = [
  { value: 'learning', label: '我的学习', icon: DashboardSquare01Icon },
  { value: 'mail', label: '邮件', icon: Mail01Icon },
  { value: 'calendar', label: '日历', icon: Calendar03Icon },
  { value: 'library', label: '资料库', icon: Folder01Icon },
]

function MailPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card text-card-foreground">
      <header className="flex h-12 shrink-0 items-center border-b border-[var(--im-divider-weak)] px-4">
        <h1 className="font-heading text-sm font-medium">邮件</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <Empty className="h-full border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon"><HugeiconsIcon icon={Mail01Icon} strokeWidth={2} /></EmptyMedia>
            <EmptyTitle>邮件收件箱即将接入</EmptyTitle>
            <EmptyDescription>现有邮件撰写流程保持可用，收件箱业务将在后续迁移到本人看板。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    </div>
  )
}

function DashboardPage({ view, workspaceId, personal }: {
  view: DashboardView
  workspaceId: string
  personal: boolean
}) {
  if (view === 'learning') return <LearningCenter workspaceId={workspaceId} allowOnboarding={personal} />
  if (view === 'courses') return <CompanyCourseManagement projectId={workspaceId} />
  if (view === 'mail') return <MailPage />
  if (view === 'calendar') return <CalendarView />
  return <DocumentsView />
}

export function PersonalDashboard({
  view,
  defaultLayout,
  onLayoutChanged,
}: {
  view: DashboardView
  defaultLayout: Layout
  onLayoutChanged: (layout: Layout, meta: LayoutChangedMeta) => void
}) {
  const workspaces = useWorkspace((state) => state.list)
  const selectedWorkspaceId = useWorkspace((state) => state.selectedId)
  const selectWorkspace = useWorkspace((state) => state.select)
  const [pagePending, setPagePending] = useState(false)
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scopes = getDashboardScopes(workspaces)
  const activeWorkspace = scopes.visible.find((workspace) => workspace.id === selectedWorkspaceId)
    ?? scopes.courses[0]
    ?? scopes.personal
  const personalPage = activeWorkspace?.id === scopes.personal?.id

  useEffect(() => () => {
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
  }, [])

  const openView = (next: DashboardView) => {
    if (next === view) return
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
    setPagePending(true)
    useApp.getState().setView(next)
    transitionTimer.current = setTimeout(() => {
      setPagePending(false)
      transitionTimer.current = null
    }, 120)
  }
  const openWorkspacePage = (workspaceId: string) => {
    if (workspaceId === selectedWorkspaceId) return
    const targetIsPersonal = workspaceId === scopes.personal?.id
    const nextView = targetIsPersonal && view === 'courses' ? 'learning' : view
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
    setPagePending(true)
    const selection = selectWorkspace(workspaceId)
    useApp.getState().setView(nextView)
    void selection.catch(() => undefined).finally(() => setPagePending(false))
  }

  return (
    <SidebarProvider
      className="h-full min-h-0 bg-card"
      style={{ '--sidebar-width': '100%' } as React.CSSProperties}
    >
      <ResizablePanelGroup
        id="dashboard-two-panel-layout"
        orientation="horizontal"
        className="min-h-0 min-w-0"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel id="conversations" defaultSize="25%" minSize={280} maxSize={420} className="min-h-0 min-w-0">
          <Sidebar collapsible="none" className="w-full shrink-0 bg-card text-card-foreground">
        <SidebarHeader className="omb-drag h-12 shrink-0 justify-center p-2">
          <Select value={activeWorkspace?.id} onValueChange={openWorkspacePage}>
            <SelectTrigger aria-label="切换个人学习区或课程" className="omb-no-drag h-8 w-full bg-input/50 shadow-none">
              <SelectValue placeholder="选择学习空间" />
            </SelectTrigger>
            <SelectContent>
              {scopes.personal && (
                <SelectItem value={scopes.personal.id}>
                  <span className="flex items-center gap-2"><CourseAvatar courseId={scopes.personal.id} title={scopes.personal.name} size="sm" /><span>个人学习区</span></span>
                </SelectItem>
              )}
              {scopes.courses.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  <span className="flex items-center gap-2"><CourseAvatar courseId={workspace.id} title={workspace.name} size="sm" /><span>{workspace.name}</span></span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SidebarHeader>
        <SidebarContent className="gap-1 px-2 pb-2 pt-0.5">
          <SidebarGroup className="p-0">
            <SidebarGroupLabel>{personalPage ? '个人学习区' : activeWorkspace?.name ?? '课程'}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={view === 'learning'} onClick={() => openView('learning')}>
                    <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />
                    <span>{personalPage ? '我的学习' : '课程首页'}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {!personalPage && <SidebarMenuItem>
                  <SidebarMenuButton isActive={view === 'courses'} onClick={() => openView('courses')}>
                    <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} />
                    <span>课程</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>}
                {DASHBOARD_ITEMS.slice(1).map((item) => (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton isActive={view === item.value} onClick={() => openView(item.value)}>
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
        <ResizableHandle withHandle className="desktop-panel-resize-handle" aria-label="调整看板侧边栏宽度" title="拖动调整侧边栏宽度，双击恢复默认" />
        <ResizablePanel id="conversation" defaultSize="75%" minSize={320} className="min-h-0 min-w-0">
          <SidebarInset className="@container/dashboard-content h-full min-h-0 min-w-0 overflow-hidden bg-card text-card-foreground">
            {pagePending ? (
              <div className="flex h-full min-h-0 flex-col" role="status" aria-label="正在切换看板页面">
                <span className="sr-only">正在切换看板页面</span>
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--im-divider-weak)] px-4">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-24 rounded-xl" />
                </div>
                <div className="grid min-h-0 flex-1 gap-4 p-4 @min-[48rem]/dashboard-content:grid-cols-[minmax(0,1.4fr)_minmax(16rem,.6fr)] @min-[48rem]/dashboard-content:p-6">
                  <div className="space-y-4"><Skeleton className="h-10 w-full rounded-xl" /><Skeleton className="h-44 w-full rounded-4xl" /><Skeleton className="h-44 w-full rounded-4xl" /></div>
                  <div className="space-y-4"><Skeleton className="h-28 w-full rounded-4xl" /><Skeleton className="h-52 w-full rounded-4xl" /></div>
                </div>
              </div>
            ) : activeWorkspace && (
              <DashboardPage
                key={activeWorkspace.id}
                view={view}
                workspaceId={activeWorkspace.id}
                personal={personalPage}
              />
            )}
          </SidebarInset>
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarProvider>
  )
}
