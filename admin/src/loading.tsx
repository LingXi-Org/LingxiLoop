import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

function Metrics({ groups = 1 }: { groups?: number }) {
  return <div className="space-y-8">{Array.from({ length: groups }, (_, group) => <div key={group} className="admin-kpi-grid">{[0, 1, 2, 3].map(index => <div key={index} className="space-y-4 rounded-xl border bg-card p-6"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-9 w-20" /><Skeleton className="h-3 w-2/3" /></div>)}</div>)}</div>
}

export function AdminMetricsSkeleton({ groups = 1 }: { groups?: number }) {
  return <SkeletonRegion label="正在加载统计数据"><Metrics groups={groups} /></SkeletonRegion>
}

export function AdminDashboardSkeleton() {
  return <SkeletonRegion label="正在加载管理概览" className="space-y-8">
    <Skeleton className="h-8 w-36" /><Metrics groups={2} /><Skeleton className="h-80 w-full rounded-xl" />
    <div className="grid gap-6 xl:grid-cols-[2fr_1fr]"><Skeleton className="h-64 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /></div>
  </SkeletonRegion>
}

export function AdminShellSkeleton() {
  return <div className="flex h-dvh min-w-0 gap-4 bg-background p-4">
    <div aria-hidden="true" className="hidden w-64 shrink-0 space-y-6 rounded-xl border bg-card p-5 md:block"><Skeleton className="h-10 w-3/4" />{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-9 w-full rounded-lg" />)}</div>
    <div className="min-w-0 flex-1 overflow-hidden p-2 sm:p-5"><AdminDashboardSkeleton /></div>
  </div>
}

export function AdminTabSkeleton({ tab }: { tab: string }) {
  return <SkeletonRegion label={tab === 'authentication' ? '正在加载身份与安全设置' : tab === 'status' ? '正在加载服务监控' : '正在加载运行分析'} className="space-y-6">
    <Skeleton className="h-8 w-40" />
    {tab === 'status' && <Skeleton className="h-24 w-full rounded-xl" />}
    <Metrics />
    <div className={`grid gap-6 ${tab === 'status' ? 'xl:grid-cols-2' : 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}`}>
      {tab === 'authentication' ? [0, 1].map(index => <div key={index} className="space-y-5 rounded-xl border bg-card p-6"><Skeleton className="h-5 w-28" />{[0, 1, 2].map(row => <div key={row} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-full" /></div>)}</div>) : <><Skeleton className="h-80 w-full rounded-xl" /><Skeleton className="h-80 w-full rounded-xl" /></>}
    </div>
    {tab !== 'status' && tab !== 'authentication' && <Skeleton className="h-56 w-full rounded-xl" />}
  </SkeletonRegion>
}

export function AdminRecordSkeleton() {
  return <SkeletonRegion label="正在加载记录详情" className="space-y-6">
    <Skeleton className="h-8 w-28" /><div className="flex items-center gap-5 rounded-xl border bg-card p-6"><Skeleton className="size-16 rounded-full" /><div className="flex-1 space-y-3"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-3 w-1/2" /></div></div>
    <Skeleton className="h-10 w-64 max-w-full" /><Metrics /><div className="grid gap-6 md:grid-cols-2">{[0, 1].map(index => <Skeleton key={index} className="h-52 w-full rounded-xl" />)}</div>
  </SkeletonRegion>
}
