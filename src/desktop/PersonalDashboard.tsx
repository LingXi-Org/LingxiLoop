import { DashboardSkeleton } from './DashboardSkeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { AuthCompany } from '@/auth/contracts'
import type { LearningSpace } from '@/features/learning/contracts'
import { LearningDashboardPanel } from '@/features/learning/dashboard/LearningDashboardPanel'
import { learningSectionForView } from '@/features/learning/dashboard/navigation'
import type { ViewKey } from '@/types'

export function PersonalDashboard({ view, space, loading, error, onRetry, hasSpaces = false, onChooseWorkspace, companyRole }: {
  view: ViewKey['view']
  space?: LearningSpace
  loading: boolean
  error: string
  onRetry(): void
  hasSpaces?: boolean
  onChooseWorkspace?(): void
  companyRole?: AuthCompany['role']
}) {
  if (loading && !error) return <DashboardSkeleton view={view} perspective={space?.perspective} />
  if (!space) return error ? (
    <div className="p-6"><Alert variant="destructive"><AlertDescription className="flex items-center justify-between gap-3">{error}<Button variant="outline" size="sm" onClick={onRetry}>重试</Button></AlertDescription></Alert></div>
  ) : (
    <div className="grid h-full place-items-center p-6 text-center"><div className="max-w-sm space-y-3">
      <h1 className="text-xl font-semibold">当前没有可用的学习空间</h1>
      <p className="text-sm text-muted-foreground">{hasSpaces ? '选择课程，查看作业与讨论。'
        : companyRole === 'teacher' ? '请联系公司管理员，将你添加为指定课程的教师，完成后刷新。'
        : companyRole === 'student' ? '请向老师索取课程邀请链接，加入后刷新。'
        : '请刷新以确认可用的学习空间；如仍无法显示，请联系公司管理员。'}</p>
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {hasSpaces && onChooseWorkspace ? <Button className="min-h-11" onClick={onChooseWorkspace}>选择工作区</Button>
          : null}
        <Button className="min-h-11" variant={hasSpaces ? 'outline' : 'default'} onClick={onRetry}>刷新</Button>
      </div>
    </div></div>
  )
  return <LearningDashboardPanel key={`${space.companyId}:${space.projectId}`} space={space} section={learningSectionForView(view)} />
}
