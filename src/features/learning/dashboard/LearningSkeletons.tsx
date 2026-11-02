import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function OverviewSkeleton({ perspective = 'learner' }: { perspective?: 'learner' | 'teacher' }) {
  return <SkeletonRegion label={perspective === 'teacher' ? '正在加载教学概览' : '正在加载学习概览'} className="@container/learning-grid space-y-4">
    <div className="flex items-center justify-between"><Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-16" /></div>
    <div className="grid gap-4 @min-[36rem]/learning-grid:grid-cols-2 @min-[64rem]/learning-grid:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="space-y-3 rounded-xl border bg-card p-5">
        <Skeleton className="h-4 w-20" /><Skeleton className="h-8 w-16" /><Skeleton className="h-4 w-3/4" />
      </div>)}
    </div>
    <div className="grid gap-4 @min-[56rem]/learning-grid:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-4 rounded-xl border bg-card p-5"><Skeleton className="h-4 w-28" /><Skeleton className="h-56 w-full" /></div>
      <div className="space-y-3 rounded-xl border bg-card p-5"><Skeleton className="h-4 w-20" />{[0, 1, 2, 3].map(row => <Skeleton key={row} className="h-10 w-full" />)}</div>
    </div>
    <div className="space-y-3 rounded-xl border bg-card p-5"><Skeleton className="h-4 w-24" />{[0, 1, 2, 3, 4].map(row => <Skeleton key={row} className="h-9 w-full" />)}</div>
  </SkeletonRegion>
}

export function CourseSettingsSkeleton({ section }: { section: string }) {
  return <SkeletonRegion label="正在加载课程管理" className="space-y-5">
    {section === 'members' || section === 'course-members' ? <>
      <Skeleton className="h-10 w-40" />
      <div className="space-y-0 rounded-xl border">{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex gap-4 border-b p-4 last:border-0"><Skeleton className="size-9 shrink-0 rounded-full" /><Skeleton className="h-5 flex-1" /><Skeleton className="h-5 w-16" /></div>)}</div>
    </> : <div className="space-y-6 rounded-xl border bg-card p-6">
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: section === 'status' || section === 'course-status' ? 1 : 3 }, (_, index) => <div key={index} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className={index === 1 ? 'h-24 w-full' : 'h-10 w-full'} /></div>)}
      <Skeleton className="h-9 w-24" />
    </div>}
  </SkeletonRegion>
}
