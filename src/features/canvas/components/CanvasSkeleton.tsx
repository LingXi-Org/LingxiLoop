import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function CanvasSkeleton() {
  return <SkeletonRegion label="正在加载画布" className="flex h-full min-h-64 flex-col overflow-hidden bg-background">
    <div className="flex items-center gap-3 border-b p-4"><Skeleton className="h-5 w-32" /><Skeleton className="ms-auto h-8 w-24" /></div>
    <div className="relative flex-1 bg-muted/20 p-6"><div className="flex gap-3 rounded-2xl border bg-card p-3 w-fit">{[0, 1, 2, 3].map(index => <Skeleton key={index} className="size-7 rounded-lg" />)}</div><div className="mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-2"><Skeleton className="h-48 rounded-xl" /><Skeleton className="hidden h-48 rounded-xl sm:block" /></div></div>
  </SkeletonRegion>
}
