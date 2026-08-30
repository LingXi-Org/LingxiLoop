import {
  BookOpen01Icon,
  Building03Icon,
  Calendar03Icon,
  DashboardSquare01Icon,
  File01Icon,
  Folder01Icon,
  Mail01Icon,
  School01Icon,
  Shield01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import type { Layout, LayoutChangedMeta } from 'react-resizable-panels'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from '@/components/ui/sidebar'
import { CalendarView } from '@/features/calendar/components/CalendarView'
import {
  CompanyCourseManagement,
  type CourseManagementSection,
} from '@/features/companies/components/CompanyCourseManagement'
import { SidebarUserFooter } from '@/features/conversations/components/ConversationsPane'
import { DocumentsView } from '@/features/documents/components/DocumentsView'
import { LearningCenter } from '@/features/learning/components/LearningCenter'
import { TrustBoard } from '@/features/trust/components/TrustBoard'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { ViewKey } from '@/types'

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
  { value: 'trust', label: 'Trust', icon: Shield01Icon },
]

const COURSE_ITEMS: Array<{
  value: CourseManagementSection
  label: string
  icon: typeof BookOpen01Icon
  adminOnly?: boolean
}> = [
  { value: 'courses', label: '课程', icon: BookOpen01Icon },
  { value: 'projects', label: 'Projects', icon: File01Icon, adminOnly: true },
  { value: 'organization', label: '组织', icon: Building03Icon, adminOnly: true },
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

function DashboardPage({ view, courseSection }: {
  view: DashboardView
  courseSection: CourseManagementSection
}) {
  if (view === 'learning') return <LearningCenter />
  if (view === 'courses') return <CompanyCourseManagement section={courseSection} />
  if (view === 'mail') return <MailPage />
  if (view === 'calendar') return <CalendarView />
  if (view === 'trust') return <TrustBoard />
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
  const companyRole = useAuth((state) => state.companies.find((company) => company.id === state.activeCompanyId)?.role ?? 'member')
  const isAdmin = companyRole === 'owner' || companyRole === 'admin'
  const [courseSection, setCourseSection] = useState<CourseManagementSection>('courses')

  useEffect(() => {
    if (!isAdmin && courseSection !== 'courses') setCourseSection('courses')
  }, [courseSection, isAdmin])

  const openView = (next: DashboardView) => useApp.getState().setView(next)
  const openCourseSection = (next: CourseManagementSection) => {
    setCourseSection(next)
    openView('courses')
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
          <div className="flex min-w-0 items-center gap-2 px-2">
            <Avatar className="size-8 rounded-xl">
              <AvatarFallback className="rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
                <HugeiconsIcon icon={School01Icon} strokeWidth={2} className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">本人看板</p>
              <p className="truncate text-xs text-muted-foreground">学习与工作空间</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-1 px-2 pb-2 pt-0.5">
          <SidebarGroup className="p-0">
            <SidebarGroupLabel>看板</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={view === 'learning'} onClick={() => openView('learning')}>
                    <HugeiconsIcon icon={DashboardSquare01Icon} strokeWidth={2} />
                    <span>我的学习</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive={view === 'courses'} onClick={() => openCourseSection('courses')}>
                    <HugeiconsIcon icon={BookOpen01Icon} strokeWidth={2} />
                    <span>课程分组</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    {COURSE_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => (
                      <SidebarMenuSubItem key={item.value}>
                        <SidebarMenuSubButton
                          href={`#dashboard-${item.value}`}
                          isActive={view === 'courses' && courseSection === item.value}
                          onClick={(event) => {
                            event.preventDefault()
                            openCourseSection(item.value)
                          }}
                        >
                          <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                          <span>{item.label}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </SidebarMenuItem>
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
            <DashboardPage view={view} courseSection={courseSection} />
          </SidebarInset>
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarProvider>
  )
}
