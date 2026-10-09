import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function SourceFoldersSkeleton() {
  return <SkeletonRegion label="正在加载课程资料" className="space-y-5">
    <div className="flex items-center gap-3"><Skeleton className="h-4 w-14" /><Skeleton className="h-11 w-48 rounded-xl sm:h-9" /></div>
    <SourceCardsSkeleton />
  </SkeletonRegion>
}

export function SourceCardsSkeleton() {
  return <SkeletonRegion label="正在加载资料库" className="divide-y overflow-hidden rounded-2xl border">
    {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex min-h-20 items-center gap-3 bg-card p-4"><Skeleton className="size-10 shrink-0 rounded-xl" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-4 w-3/5" /><Skeleton className="h-3 w-2/5" /></div><Skeleton className="h-5 w-16" /></div>)}
  </SkeletonRegion>
}
