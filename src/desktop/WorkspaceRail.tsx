import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type FormEvent, useState } from 'react'
import { BrandAvatar, useBrandAvatarInteraction } from '@/components/BrandAvatar'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { selectLearningSpace, useWorkspace } from '@/features/knowledge/workspace'
import { learningApi } from '@/features/learning/api'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import { notifyAction, toastAction } from '@/lib/actionToast'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { useAuth, useMe } from '@/stores/auth'
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
              active && 'ring-2 ring-sidebar-primary/40 ring-offset-2 ring-offset-accent',
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
  const personalCompanyId = useAuth((state) => state.personalCompanyId)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const brandAvatar = useBrandAvatarInteraction()
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
    } catch (error) {
      notifyAction({
        title: '学习区切换失败',
        description: userFacingError(error, '暂时无法打开这个学习区，请稍后重试。'),
        type: 'error',
      })
    } finally {
      setPendingId(null)
    }
  }

  const handleCreateCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    if (!name || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      if (!personalCompanyId) throw new Error('暂时无法确认你的个人学习区，请重新登录后再试。')
      const course = await toastAction(learningApi.createCourse({
        name,
        description: String(data.get('description') ?? '').trim(),
      }, personalCompanyId), {
        loading: '正在创建课程与课程对话',
        success: '课程已创建',
        error: '创建课程失败',
      })
      await selectLearningSpace({ companyId: personalCompanyId, projectId: course.projectId })
      form.reset()
      setCreateOpen(false)
      onOpenDashboard()
    } catch (error) {
      setCreateError(userFacingError(error, '课程创建失败，请稍后重试。'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <TooltipProvider delayDuration={120}>
      <nav
        aria-label="工作区"
        className="server-rail flex h-full w-16 shrink-0 flex-col items-center overflow-hidden bg-[var(--workspace-chrome-surface)] pb-2 pt-[26px] text-foreground"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="打开学习看板"
              aria-current={dashboardActive ? 'page' : undefined}
              onClick={() => {
                brandAvatar.registerClick()
                onOpenDashboard()
              }}
              className={cn(
                'mb-[6px] size-9 shrink-0 translate-x-px overflow-hidden rounded-lg bg-transparent p-0 hover:bg-transparent',
                dashboardActive && 'ring-2 ring-sidebar-primary/40 ring-offset-2 ring-offset-accent',
              )}
            >
              <BrandAvatar expression={brandAvatar.expression} className="size-9 rounded-lg" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={10}>学习看板</TooltipContent>
        </Tooltip>
        <div className="server-rail-scroll flex min-h-0 w-full translate-x-px flex-1 flex-col items-center overflow-y-auto overflow-x-hidden pb-3 pt-0.5">
          <WorkspaceRailGroup workspaces={enterprise} dashboardActive={dashboardActive} activeId={activeId} pendingId={pendingId} onSelect={(id) => void handleSelect(id)} />
          <WorkspaceRailGroup workspaces={personal} dashboardActive={dashboardActive} activeId={activeId} pendingId={pendingId} onSelect={(id) => void handleSelect(id)} />
          <Dialog open={createOpen} onOpenChange={(open) => {
            setCreateOpen(open)
            if (!open) setCreateError(null)
          }}>
            <div className="flex h-15 min-h-15 max-h-15 w-full shrink-0 items-center justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="新建课程"
                      className="size-9 shrink-0 rounded-lg border border-dashed border-sidebar-primary/35 bg-transparent text-sidebar-primary shadow-none hover:bg-sidebar-accent hover:text-sidebar-primary focus-visible:border-sidebar-primary/50 focus-visible:ring-sidebar-primary/20"
                    >
                      <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
                    </Button>
                  </DialogTrigger>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>新建课程</TooltipContent>
              </Tooltip>
            </div>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建课程</DialogTitle>
                <DialogDescription>创建后会同时准备专属课程对话，并进入新的课程看板。</DialogDescription>
              </DialogHeader>
              <form id="workspace-rail-create-course" onSubmit={handleCreateCourse}>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="workspace-rail-course-name">课程名称</FieldLabel>
                    <Input id="workspace-rail-course-name" name="name" required autoFocus placeholder="例如：产品设计基础" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="workspace-rail-course-description">课程简介</FieldLabel>
                    <Textarea id="workspace-rail-course-description" name="description" placeholder="简要说明课程目标与内容" />
                    <FieldDescription>简介可稍后在课程管理中继续完善。</FieldDescription>
                  </Field>
                  {createError && (
                    <Alert variant="destructive">
                      <AlertTitle>创建失败</AlertTitle>
                      <AlertDescription>{createError}</AlertDescription>
                    </Alert>
                  )}
                </FieldGroup>
              </form>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={creating}>取消</Button></DialogClose>
                <Button type="submit" form="workspace-rail-create-course" disabled={creating}>
                  {creating ? '正在创建…' : '创建课程'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </nav>
    </TooltipProvider>
  )
}
