import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkspace } from '@/features/knowledge/workspace'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import { cn } from '@/lib/utils'
import { useMe } from '@/stores/auth'
import type { WorkspaceSummary } from '@/types'

export function workspaceInitials(name: string): string {
  const value = name.trim()
  if (!value) return '·'
  const words = value.split(/\s+/).filter(Boolean)
  return words.length > 1
    ? words.slice(0, 2).map((word) => word[0]).join('').toUpperCase()
    : Array.from(value).slice(0, 2).join('').toUpperCase()
}

function workspaceKindLabel(workspace: WorkspaceSummary): string {
  if (workspace.kind === 'PERSONAL_LEARNING') return '个人工作区'
  if (workspace.kind === 'TEACHING') return '教学工作区'
  return '课程工作区'
}

function WorkspaceRailItem({ workspace, active, pending, onSelect }: {
  workspace: WorkspaceSummary
  active: boolean
  pending: boolean
  onSelect: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onSelect}
          disabled={pending}
          aria-label={`切换到${workspace.name}`}
          aria-current={active ? 'page' : undefined}
          className="group relative h-15 min-h-15 max-h-15 w-full shrink-0 rounded-none hover:bg-transparent"
        >
          <span
            aria-hidden
            className={cn(
              'absolute start-0 bg-sidebar-primary transition-[width,height,border-radius] duration-200',
              active
                ? 'h-9 w-1 rounded-e-full shadow-[0_0_0_2px_color-mix(in_srgb,var(--sidebar-primary)_14%,transparent)]'
                : 'size-2 rounded-full shadow-[0_0_0_2px_color-mix(in_srgb,var(--sidebar-primary)_12%,transparent)] group-hover:h-5 group-hover:w-1 group-hover:rounded-e-full',
            )}
          />
          <CourseAvatar
            key={workspace.id}
            courseId={workspace.id}
            title={workspace.name}
            className={cn(
              'size-9 rounded-lg transition-transform duration-150 group-active:scale-95 [&_[data-slot=avatar-fallback]]:rounded-lg [&_[data-slot=avatar-image]]:rounded-lg',
              active && 'ring-2 ring-ring ring-offset-2 ring-offset-accent',
              pending && 'animate-pulse',
            )}
          />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10} className="max-w-64">
        <span className="font-semibold">{workspace.name}</span>
        <span className="ml-1.5 opacity-70">{workspaceKindLabel(workspace)}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function RailDivider() {
  return <div aria-hidden className="absolute inset-x-0 top-0 mx-auto h-px w-6 bg-border" />
}

function WorkspaceRailGroup({ workspaces, dashboardActive, activeId, pendingId, onSelect }: {
  workspaces: WorkspaceSummary[]
  dashboardActive: boolean
  activeId: string | null
  pendingId: string | null
  onSelect: (id: string) => void
}) {
  if (workspaces.length === 0) return null
  return (
    <section className="relative flex w-full flex-col items-center gap-0">
      <RailDivider />
      {workspaces.map((workspace) => (
        <WorkspaceRailItem
          key={workspace.id}
          workspace={workspace}
          active={!dashboardActive && workspace.id === activeId}
          pending={workspace.id === pendingId}
          onSelect={() => onSelect(workspace.id)}
        />
      ))}
    </section>
  )
}

export function WorkspaceRail({ dashboardActive, onOpenDashboard, onOpenWorkspace }: {
  dashboardActive: boolean
  onOpenDashboard: () => void
  onOpenWorkspace: () => void
}) {
  const workspaces = useWorkspace((state) => state.list)
  const activeId = useWorkspace((state) => state.selectedId)
  const select = useWorkspace((state) => state.select)
  const meId = useMe()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const visible = workspaces.filter((workspace) => workspace.status !== 'ARCHIVED' && workspace.status !== 'DELETED')
  const enterprise = visible.filter((workspace) => workspace.kind === 'INSTITUTIONAL_COURSE')
  const personal = visible
    .filter((workspace) => workspace.kind !== 'INSTITUTIONAL_COURSE')
    .map((workspace, index) => ({ workspace, index }))
    .sort((left, right) => {
      const rank = ({ workspace }: { workspace: WorkspaceSummary }) => {
        if (workspace.kind === 'PERSONAL_LEARNING' && workspace.isDefault) return 0
        if (workspace.kind === 'TEACHING' && workspace.createdBy === meId) return 1
        if (workspace.kind === 'PERSONAL_LEARNING' && workspace.createdBy !== meId) return 2
        return 3
      }
      return rank(left) - rank(right) || left.index - right.index
    })
    .map(({ workspace }) => workspace)

  const handleSelect = async (id: string) => {
    if (pendingId) return
    onOpenWorkspace()
    if (id === activeId) return
    setPendingId(id)
    try {
      await select(id)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <TooltipProvider delayDuration={120}>
      <nav
        aria-label="工作区"
        className="server-rail flex h-full w-16 shrink-0 flex-col items-center overflow-hidden bg-accent pb-2 pt-[26px] text-accent-foreground"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="打开本人看板"
              aria-current={dashboardActive ? 'page' : undefined}
              onClick={onOpenDashboard}
              className={cn(
                'mb-[6px] size-9 shrink-0 translate-x-px rounded-lg bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground',
                dashboardActive && 'ring-2 ring-ring ring-offset-2 ring-offset-accent',
              )}
            >
              L
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>本人看板</TooltipContent>
        </Tooltip>
        <div className="server-rail-scroll flex min-h-0 w-full translate-x-px flex-1 flex-col items-center gap-4 overflow-y-auto overflow-x-hidden pb-3 pt-0.5">
          <WorkspaceRailGroup workspaces={enterprise} dashboardActive={dashboardActive} activeId={activeId} pendingId={pendingId} onSelect={(id) => void handleSelect(id)} />
          <WorkspaceRailGroup workspaces={personal} dashboardActive={dashboardActive} activeId={activeId} pendingId={pendingId} onSelect={(id) => void handleSelect(id)} />
        </div>
      </nav>
    </TooltipProvider>
  )
}
