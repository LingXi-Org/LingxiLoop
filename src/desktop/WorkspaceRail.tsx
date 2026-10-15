import { BubbleChatIcon, RoboticIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeftRight } from 'lucide-react'
import { BrandAvatar } from '@/components/BrandAvatar'
import { BRAND_AVATAR_BASE_EXPRESSION } from '@/components/brand-avatar-controller'
import { NavUser } from '@/components/nav-user'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useParticipants } from '@/features/agents/state'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import type { LearningSpace } from '@/features/learning/contracts'
import { getLearningDashboardMenu, viewForLearningSection } from '@/features/learning/dashboard/navigation'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { ViewKey } from '@/types'

export function WorkspaceRail({ spaces, activeSpace, loading, error, pending, onSelect, onReload, onNavigate, workspacePickerOpen, onWorkspacePickerOpenChange }: {
  spaces: LearningSpace[]
  activeSpace?: LearningSpace
  loading: boolean
  error: string
  pending: boolean
  onSelect(space: LearningSpace): void
  onReload(): void
  onNavigate(view: ViewKey['view']): void
  workspacePickerOpen?: boolean
  onWorkspacePickerOpenChange?(open: boolean): void
}) {
  const view = useApp((state) => state.view)
  const user = useAuth((state) => state.user)
  const participantAvatar = useParticipants((state) => user ? state.byId[user.id]?.avatarUrl : undefined)
  const menu = [
    { view: 'conversations' as const, label: '对话', icon: BubbleChatIcon, management: false },
    { view: 'agents' as const, label: 'Agent', icon: RoboticIcon, management: false },
    ...(activeSpace ? getLearningDashboardMenu(activeSpace).map((item) => ({ ...item, view: viewForLearningSection(item.section) })) : []),
  ]
  const renderMenuItem = (item: typeof menu[number]) => {
    const selected = view === item.view || (item.view === 'courses' && (view === 'course-members' || view === 'course-status'))
    return <Tooltip key={item.view}>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={item.label} data-workspace-view={item.view} aria-current={selected ? 'page' : undefined} onClick={() => onNavigate(item.view)} className={cn('size-11 shrink-0 rounded-xl text-muted-foreground', selected && 'bg-sidebar-accent text-sidebar-primary')}>
          <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-6" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  }
  return <nav aria-label="工作区与功能" className="server-rail flex h-full w-16 shrink-0 flex-col items-center overflow-hidden bg-[var(--workspace-chrome-surface)] pb-2 pt-[var(--im-navigation-top)] text-foreground">
    <div className="im-navigation-row flex w-full items-center justify-center">
      <DropdownMenu open={workspacePickerOpen} onOpenChange={onWorkspacePickerOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" disabled={pending} aria-label={`切换工作区${activeSpace ? `：${activeSpace.title}` : ''}`} className="relative size-11 rounded-xl p-1">
                {activeSpace ? <CourseAvatar courseId={activeSpace.courseId ?? activeSpace.projectId} avatarUrl={activeSpace.avatarUrl} title={activeSpace.title} className="size-9 rounded-lg" /> : <BrandAvatar expression={BRAND_AVATAR_BASE_EXPRESSION} className="size-9 rounded-lg" />}
                <span aria-hidden="true" className="pointer-events-none absolute bottom-0.5 end-0.5 grid size-4 place-items-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground ring-2 ring-[var(--workspace-chrome-surface)]"><ArrowLeftRight className="size-2.5" strokeWidth={2.5} /></span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{activeSpace?.title ?? '选择工作区'} · 切换工作区</TooltipContent>
        </Tooltip>
        <DropdownMenuContent side="right" align="start" sideOffset={8} collisionPadding={12} className="w-72 max-w-[calc(100vw-24px)]">
          <DropdownMenuLabel>工作区</DropdownMenuLabel>
          {loading && spaces.length === 0 ? <p role="status" className="px-3 py-4 text-sm text-muted-foreground">正在加载工作区…</p> : null}
          {error ? <div role="alert" className="px-3 py-2 text-sm text-destructive">{error}<Button variant="ghost" size="sm" onClick={onReload}>重试</Button></div> : null}
          {!loading && !error && spaces.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">还没有可用的工作区</p> : null}
          <div className="max-h-80 overflow-y-auto">
            {spaces.map((space) => <DropdownMenuItem key={space.projectId} disabled={pending} onSelect={() => onSelect(space)} aria-current={activeSpace?.projectId === space.projectId ? 'true' : undefined}>
              <CourseAvatar courseId={space.courseId ?? space.projectId} avatarUrl={space.avatarUrl} title={space.title} size="sm" />
              <span className="min-w-0 flex-1 truncate">{space.title}</span>
              {activeSpace?.projectId === space.projectId ? <HugeiconsIcon icon={Tick02Icon} className="size-4 text-primary" aria-label="当前工作区" /> : null}
            </DropdownMenuItem>)}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="server-rail-scroll flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-2">
      {menu.filter(item => item.view !== 'learning').map(renderMenuItem)}
    </div>
    <div className="flex shrink-0 flex-col items-center px-2" data-testid="workspace-bottom-navigation">
      {menu.filter(item => item.view === 'learning').map(renderMenuItem)}
    </div>
    {user ? <div className="shrink-0 px-2 pt-2"><NavUser compact user={{ id: user.id, name: user.name, email: user.email, avatar: user.avatarUrl ?? participantAvatar }} /></div> : null}
  </nav>
}