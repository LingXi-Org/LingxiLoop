import { HugeiconsIcon } from '@hugeicons/react'
import { ResourceSkeleton } from '@/components/ResourceSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Sidebar, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar'
import type { LearningSpace } from '@/features/learning/contracts'
import { LearningDashboardPanel } from '@/features/learning/dashboard/LearningDashboardPanel'
import { getLearningDashboardMenu, learningSectionForView, viewForLearningSection } from '@/features/learning/dashboard/navigation'
import { useApp } from '@/stores/app'
import type { ViewKey } from '@/types'

export function PersonalDashboard({ view, space, loading, error, onRetry }: {
  view: ViewKey['view']
  space?: LearningSpace
  loading: boolean
  error: string
  onRetry(): void
}) {
  if (loading) return <ResourceSkeleton variant="detail" label="正在加载学习空间" className="p-6" />
  if (!space) return error ? (
    <div className="p-6"><Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button variant="outline" size="sm" onClick={onRetry}>重试</Button></AlertDescription></Alert></div>
  ) : (
    <div className="grid h-full place-items-center p-6 text-center"><div><p className="font-heading text-base font-medium">当前没有可用的学习空间</p><p className="mt-1 text-sm text-muted-foreground">请点击左上角头像选择工作区，或创建、加入课程。</p></div></div>
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
