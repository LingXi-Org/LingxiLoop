import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function OverviewSkeleton({ perspective = 'learner' }: { perspective?: 'learner' | 'teacher' }) {
  const teacher = perspective === 'teacher'
  return <SkeletonRegion label={teacher ? '正在加载教学概览' : '正在加载学习概览'} className="@container/learning-grid space-y-4">
    <div className="grid gap-4 @min-[48rem]/learning-grid:grid-cols-12">
      {Array.from({ length: 4 }, (_, index) => <div key={index} className={`min-w-0 space-y-4 rounded-2xl border bg-card p-6 ${(teacher ? index === 1 || index === 2 : index % 2) ? '@min-[48rem]/learning-grid:col-span-7' : '@min-[48rem]/learning-grid:col-span-5'}`}>
        <Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-7 w-32" />
        <Skeleton className={index === 0 || teacher && index === 1 ? 'mx-auto size-44 rounded-full' : 'h-44 w-full rounded-xl'} />
      </div>)}
    </div>
    <div className="grid gap-4 @min-[64rem]/learning-grid:grid-cols-[2fr_1fr]"><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>
  </SkeletonRegion>
}

export function CourseSettingsSkeleton({ section }: { section: string }) {
  return <SkeletonRegion label="正在加载课程管理" className="space-y-5">
    {section === 'members' || section === 'course-members' ? <>
      <Skeleton className="h-10 w-40" />
      <div className="space-y-0 rounded-xl border">{Array.from({ length: 5 }, (_, index) => <div key={index} className="flex gap-4 border-b p-4 last:border-0"><Skeleton className="size-9 shrink-0 rounded-full" /><Skeleton className="h-5 flex-1" /><Skeleton className="h-5 w-16" /></div>)}</div>
    </> : <div className="space-y-6 rounded-2xl border bg-card p-6">
      <Skeleton className="h-5 w-32" />
      {Array.from({ length: section === 'status' || section === 'course-status' ? 1 : 3 }, (_, index) => <div key={index} className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className={index === 1 ? 'h-24 w-full' : 'h-10 w-full'} /></div>)}
      <Skeleton className="h-9 w-24" />
    </div>}
  </SkeletonRegion>
}
