import { HugeiconsIcon } from '@hugeicons/react'
import { DashboardSkeleton } from './DashboardSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar'
import type { LearningSpace } from '@/features/learning/contracts'
import { LearningDashboardPanel } from '@/features/learning/dashboard/LearningDashboardPanel'
import { getLearningDashboardMenu, learningSectionForView, viewForLearningSection } from '@/features/learning/dashboard/navigation'
import { useApp } from '@/stores/app'
import type { ViewKey } from '@/types'

export function PersonalDashboard({ view, space, loading, error, onRetry, hasSpaces = false, canCreateCourse = false, onChooseWorkspace, onCreateCourse }: {
  view: ViewKey['view']
  space?: LearningSpace
  loading: boolean
  error: string
  onRetry(): void
  hasSpaces?: boolean
  canCreateCourse?: boolean
  onChooseWorkspace?(): void
  onCreateCourse?(): void
}) {
  if (loading && !error) return <DashboardSkeleton view={view} perspective={space?.perspective} />
  if (!space) return error ? (
    <div className="p-6"><Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button variant="outline" size="sm" onClick={onRetry}>重试</Button></AlertDescription></Alert></div>
  ) : (
    <div className="grid h-full place-items-center p-6 text-center"><div className="max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">当前没有可用的学习空间</h1>
      <p className="text-sm text-muted-foreground">{hasSpaces ? '选择一个工作区，继续查看学习进展。' : canCreateCourse ? '创建课程，开始安排学习内容。' : '请向老师索取课程邀请链接，加入后刷新。'}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {hasSpaces && onChooseWorkspace ? <Button className="min-h-11" onClick={onChooseWorkspace}>选择工作区</Button>
          : canCreateCourse && onCreateCourse ? <Button className="min-h-11" onClick={onCreateCourse}>新建课程</Button> : null}
        <Button className="min-h-11" variant={hasSpaces || canCreateCourse ? 'outline' : 'default'} onClick={onRetry}>刷新</Button>
      </div>
    </div></div>
  )
  const section = learningSectionForView(view)
  const managementMenu = getLearningDashboardMenu(space).filter((item) => item.management)
  const content = <LearningDashboardPanel key={`${space.companyId}:${space.projectId}`} space={space} section={section} />
  if (!managementMenu.some((item) => item.section === section)) return content
  return <SidebarProvider className="h-full min-h-0 min-w-0 flex-col md:flex-row">
    <Sidebar collapsible="none" className="h-auto w-full shrink-0 border-b border-sidebar-border md:h-full md:w-52 md:border-b-0 md:border-e">
      <SidebarHeader className="px-4 py-3"><h2 className="text-sm font-medium">课程管理</h2></SidebarHeader>
      <SidebarContent className="px-2 pb-2">
        <nav aria-label="课程管理栏目">
          <SidebarMenu className="grid grid-cols-2 md:flex md:flex-col">
            {managementMenu.map((item) => <SidebarMenuItem key={item.section}>
              <SidebarMenuButton type="button" isActive={section === item.section} aria-current={section === item.section ? 'page' : undefined} onClick={() => useApp.getState().setView(viewForLearningSection(item.section))} className="h-11">
                <HugeiconsIcon icon={item.icon} /><span>{item.label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>)}
          </SidebarMenu>
        </nav>
      </SidebarContent>
    </Sidebar>
    <div className="min-h-0 min-w-0 flex-1">{content}</div>
  </SidebarProvider>
}
