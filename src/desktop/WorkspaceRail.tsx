import { BubbleChatIcon, PlusSignIcon, Settings02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type FormEvent, useState } from 'react'
import { BrandAvatar } from '@/components/BrandAvatar'
import { BRAND_AVATAR_BASE_EXPRESSION } from '@/components/brand-avatar-controller'
import { NavUser } from '@/components/nav-user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { userFacingError } from '@/lib/userFacingError'
import { cn } from '@/lib/utils'
import { useApp } from '@/stores/app'
import { useAuth } from '@/stores/auth'
import type { ViewKey } from '@/types'

export function WorkspaceRail({ spaces, activeSpace, loading, error, pending, onSelect, onReload, onNavigate }: {
  spaces: LearningSpace[]
  activeSpace?: LearningSpace
  loading: boolean
  error: string
  pending: boolean
  onSelect(space: LearningSpace): void
  onReload(): void
  onNavigate(view: ViewKey['view']): void
}) {
  const view = useApp((state) => state.view)
  const user = useAuth((state) => state.user)
  const participantAvatar = useParticipants((state) => user ? state.byId[user.id]?.avatarUrl : undefined)
  const companyId = useAuth((state) => state.activeCompanyId)
  const canCreate = useAuth((state) => state.companies[0]?.role === 'teacher')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const menu = [
    { view: 'conversations' as const, label: '对话', icon: BubbleChatIcon, management: false },
    ...(activeSpace ? getLearningDashboardMenu(activeSpace).map((item) => ({ ...item, view: viewForLearningSection(item.section) })) : []),
  ]
  const managementMenu = menu.filter((item) => item.management)
  const activeManagement = managementMenu.find((item) => item.view === view)

  const handleCreateCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    if (!name || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      if (!companyId) throw new Error('暂时无法确认你的公司，请重新登录后再试。')
      const course = await toastAction(learningApi.createCourse({
        name, description: String(data.get('description') ?? '').trim(),
      }, companyId), { loading: '正在创建课程与课程对话', success: '课程已创建', error: '创建课程失败' })
      await selectLearningSpace({ companyId, projectId: course.projectId })
      onReload()
      form.reset()
      setCreateOpen(false)
      onNavigate('learning')
    } catch (reason) {
      setCreateError(userFacingError(reason, '课程创建失败，请稍后重试。'))
    } finally { setCreating(false) }
  }

  return <nav aria-label="工作区与功能" className="server-rail flex h-full w-16 shrink-0 flex-col items-center overflow-hidden bg-[var(--workspace-chrome-surface)] pb-2 pt-[var(--im-navigation-top)] text-foreground">
    <div className="im-navigation-row flex w-full items-center justify-center">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" disabled={pending || creating} aria-label={`切换工作区${activeSpace ? `：${activeSpace.title}` : ''}`} className="size-11 rounded-xl p-1">
                {activeSpace ? <CourseAvatar courseId={activeSpace.courseId ?? activeSpace.projectId} avatarUrl={activeSpace.avatarUrl} title={activeSpace.title} className="size-9 rounded-lg" /> : <BrandAvatar expression={BRAND_AVATAR_BASE_EXPRESSION} className="size-9 rounded-lg" />}
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
      {menu.filter((item) => !item.management).map((item) => <Tooltip key={item.view}>
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
    {user ? <div className="shrink-0 px-2 pt-2"><NavUser compact user={{ id: user.id, name: user.name, email: user.email, avatar: user.avatarUrl ?? participantAvatar }} /></div> : null}
    {canCreate ? <Dialog open={createOpen} onOpenChange={(open) => { if (creating) return; setCreateOpen(open); if (!open) setCreateError(null) }}>
      <DialogContent>
        <DialogHeader><DialogTitle>新建课程</DialogTitle><DialogDescription>创建后会同时准备专属课程对话，并进入新的课程看板。</DialogDescription></DialogHeader>
        <form id="workspace-rail-create-course" onSubmit={handleCreateCourse}>
          <FieldGroup>
            <Field><FieldLabel htmlFor="workspace-rail-course-name">课程名称</FieldLabel><Input id="workspace-rail-course-name" name="name" required autoFocus placeholder="例如：产品设计基础" /></Field>
            <Field><FieldLabel htmlFor="workspace-rail-course-description">课程简介</FieldLabel><Textarea id="workspace-rail-course-description" name="description" placeholder="简要说明课程目标与内容" /><FieldDescription>简介可稍后在基本资料中继续完善。</FieldDescription></Field>
            {createError ? <Alert variant="destructive"><AlertTitle>创建失败</AlertTitle><AlertDescription>{createError}</AlertDescription></Alert> : null}
          </FieldGroup>
        </form>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={creating}>取消</Button></DialogClose><Button type="submit" form="workspace-rail-create-course" disabled={creating}>{creating ? '正在创建…' : '创建课程'}</Button></DialogFooter>
      </DialogContent>
    </Dialog> : null}
  </nav>
}
