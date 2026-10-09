import { BubbleChatIcon, RoboticIcon, Mail01Icon, PlusSignIcon, Settings02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeftRight } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { BrandAvatar } from '@/components/BrandAvatar'
import { BRAND_AVATAR_BASE_EXPRESSION } from '@/components/brand-avatar-controller'
import { NavUser } from '@/components/nav-user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useParticipants } from '@/features/agents/state'
import { selectLearningSpace } from '@/features/knowledge/workspace'
import { learningApi } from '@/features/learning/api'
import { CourseAvatar } from '@/features/learning/components/CourseAvatar'
import type { LearningSpace } from '@/features/learning/contracts'
import { getLearningDashboardMenu, viewForLearningSection } from '@/features/learning/dashboard/navigation'
import { toastAction } from '@/lib/actionToast'
import { getWorkspaceSession } from '@/lib/workspaceSession'
import { currentWebNavigation, isCurrentWebNavigation } from '@/lib/webNavigation'
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { ViewKey } from '@/types'

export function WorkspaceRail({ spaces, activeSpace, loading, error, pending, onSelect, onReload, onNavigate, workspacePickerOpen, onWorkspacePickerOpenChange, createCourseOpen, onCreateCourseOpenChange }: {
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
  createCourseOpen?: boolean
  onCreateCourseOpenChange?(open: boolean): void
}) {
  const view = useApp((state) => state.view)
  const user = useAuth((state) => state.user)
  const participantAvatar = useParticipants((state) => user ? state.byId[user.id]?.avatarUrl : undefined)
  const companyId = useAuth((state) => state.activeCompanyId)
  const canCreate = useAuth((state) => state.companies[0]?.role === 'teacher')
  const [localCreateOpen, setLocalCreateOpen] = useState(false)
  const createOpen = createCourseOpen ?? localCreateOpen
  const setCreateOpen = onCreateCourseOpenChange ?? setLocalCreateOpen
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null)
  const submitting = useRef(false)
  const mounted = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const menu = [
    { view: 'conversations' as const, label: '对话', icon: BubbleChatIcon, management: false },
    { view: 'agents' as const, label: 'Agent', icon: RoboticIcon, management: false },
    { view: 'mail' as const, label: '邮件', icon: Mail01Icon, management: false },
    ...(activeSpace ? getLearningDashboardMenu(activeSpace).map((item) => ({ ...item, view: viewForLearningSection(item.section) })) : []),
  ]
  const managementMenu = menu.filter((item) => item.management)
  const overview = menu.find((item) => item.view === 'learning')
  const activeManagement = managementMenu.find((item) => item.view === view)

  const handleCreateCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    if (!name || submitting.current) return
    const originalProjectId = getWorkspaceSession()?.projectId
    let navigationEpoch = currentWebNavigation()
    const isCurrentUser = () => mounted.current && useAuth.getState().user?.id === user?.id && useAuth.getState().activeCompanyId === companyId
    submitting.current = true
    setCreating(true)
    setCreateError(null)
    try {
      if (!companyId) throw new Error('暂时无法确认你的公司，请重新登录后再试。')
      let projectId = createdProjectId
      if (!projectId) {
        const course = await toastAction(learningApi.createCourse({
          name, description: String(data.get('description') ?? '').trim(),
        }, companyId), { loading: '正在创建课程', success: '课程已创建', error: '创建课程失败' })
        if (!isCurrentUser()) return
        projectId = course.projectId
        setCreatedProjectId(projectId)
      }
      if (!isCurrentWebNavigation(navigationEpoch) || getWorkspaceSession()?.projectId !== originalProjectId) return
      const selection = selectLearningSpace({ companyId, projectId })
      navigationEpoch = currentWebNavigation()
      await selection
      if (!isCurrentUser() || !isCurrentWebNavigation(navigationEpoch) || getWorkspaceSession()?.projectId !== projectId) return
      onReload()
      form.reset()
      setCreateOpen(false)
      setCreatedProjectId(null)
      onNavigate('learning')
    } catch (reason) {
      if (isCurrentUser() && isCurrentWebNavigation(navigationEpoch)) setCreateError(userFacingError(reason, '暂时无法打开课程，请稍后重试。'))
    } finally { submitting.current = false; if (mounted.current) setCreating(false) }
  }

  return <nav aria-label="工作区与功能" className="server-rail flex h-full w-16 shrink-0 flex-col items-center overflow-hidden bg-[var(--workspace-chrome-surface)] pb-2 pt-[var(--im-navigation-top)] text-foreground">
    <div className="im-navigation-row flex w-full items-center justify-center">
      <DropdownMenu open={workspacePickerOpen} onOpenChange={onWorkspacePickerOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" disabled={pending || creating} aria-label={`切换工作区${activeSpace ? `：${activeSpace.title}` : ''}`} className="relative size-11 rounded-xl p-1">
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
          {canCreate ? <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => setCreateOpen(true)}><HugeiconsIcon icon={PlusSignIcon} />新建课程</DropdownMenuItem></> : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div className="server-rail-scroll flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2 py-2">
      {menu.filter((item) => !item.management && item.view !== 'learning').map((item) => <Tooltip key={item.view}>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" disabled={pending || creating} aria-label={item.label} data-workspace-view={item.view} aria-current={view === item.view ? 'page' : undefined} onClick={() => onNavigate(item.view)} className={cn('size-11 shrink-0 rounded-xl text-muted-foreground', view === item.view && 'bg-sidebar-accent text-sidebar-primary')}>
            <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-6" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>)}
      {managementMenu.length > 0 && <Tooltip>
          <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" disabled={pending || creating} aria-label="课程管理" aria-current={activeManagement ? 'page' : undefined} onClick={() => onNavigate(activeManagement?.view ?? 'courses')} className={cn('size-11 shrink-0 rounded-xl text-muted-foreground', activeManagement && 'bg-sidebar-accent text-sidebar-primary')}>
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.8} className="size-6" />
              </Button>
          </TooltipTrigger>
          <TooltipContent side="right">课程管理{activeManagement ? ` · ${activeManagement.label}` : ''}</TooltipContent>
      </Tooltip>}
    </div>
    {overview && <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" disabled={pending || creating} aria-label={overview.label} data-workspace-view={overview.view} aria-current={view === overview.view ? 'page' : undefined} onClick={() => onNavigate(overview.view)} className={cn('size-11 shrink-0 rounded-xl text-muted-foreground', view === overview.view && 'bg-sidebar-accent text-sidebar-primary')}>
          <HugeiconsIcon icon={overview.icon} strokeWidth={1.8} className="size-6" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{overview.label}</TooltipContent>
    </Tooltip>}
    {user ? <div className="shrink-0 px-2 pt-2"><NavUser compact user={{ id: user.id, name: user.name, email: user.email, avatar: user.avatarUrl ?? participantAvatar }} /></div> : null}
    {canCreate ? <Dialog open={createOpen} onOpenChange={(open) => { if (submitting.current) return; setCreateOpen(open); if (!open) { setCreateError(null); setCreatedProjectId(null) } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>新建课程</DialogTitle></DialogHeader>
        <form id="workspace-rail-create-course" onSubmit={handleCreateCourse}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="workspace-rail-course-name">课程名称</FieldLabel><Input id="workspace-rail-course-name" name="name" required autoFocus readOnly={creating || Boolean(createdProjectId)} /></Field>
            <Field><FieldLabel htmlFor="workspace-rail-course-description">课程简介</FieldLabel><Textarea id="workspace-rail-course-description" name="description" readOnly={creating || Boolean(createdProjectId)} placeholder="简要说明课程目标与内容" /><FieldDescription>简介可稍后在基本资料中继续完善。</FieldDescription></Field>
            {createError ? <Alert variant="destructive"><AlertTitle>创建失败</AlertTitle><AlertDescription>{createError}</AlertDescription></Alert> : null}
          </FieldGroup>
        </form>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={creating}>取消</Button></DialogClose><Button type="submit" form="workspace-rail-create-course" disabled={creating}>{creating ? '正在打开…' : createdProjectId ? '重试打开课程' : '创建课程'}</Button></DialogFooter>
      </DialogContent>
    </Dialog> : null}
  </nav>
}
