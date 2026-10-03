import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function SourceFoldersSkeleton() {
  return <SkeletonRegion label="正在加载班级资料" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    {[0, 1, 2, 3].map(index => <div key={index} className="flex min-h-56 flex-col items-start gap-4 rounded-2xl border bg-card p-5"><Skeleton className="size-20 rounded-4xl" /><Skeleton className="h-5 w-3/4" /><div className="mt-auto flex w-full justify-between gap-4"><Skeleton className="h-5 w-14" /><Skeleton className="h-4 w-16" /></div></div>)}
  </SkeletonRegion>
}

export function SourceCardsSkeleton() {
  return <SkeletonRegion label="正在加载资料库" className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
    {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex min-h-64 flex-col gap-4 rounded-2xl border bg-card p-5"><Skeleton className="size-16 rounded-4xl" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-3 w-1/2" /><Skeleton className="mt-auto h-6 w-20" /></div>)}
  </SkeletonRegion>
}
