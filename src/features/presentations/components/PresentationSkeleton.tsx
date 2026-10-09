import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function PresentationSkeleton() {
  return <SkeletonRegion label="正在加载演示文稿" className="flex h-full min-h-64 flex-col bg-background">
    <div className="flex items-center gap-3 border-b p-4"><Skeleton className="h-5 w-40" /><Skeleton className="ms-auto h-8 w-20" /></div>
    <div className="flex min-h-0 flex-1 gap-4 p-4"><div className="hidden w-28 shrink-0 space-y-3 sm:block">{[0, 1, 2].map(index => <Skeleton key={index} className="aspect-video rounded-lg" />)}</div><div className="flex min-w-0 flex-1 flex-col justify-center gap-4"><Skeleton className="aspect-video w-full rounded-xl" /><Skeleton className="mx-auto h-8 w-32" /></div></div>
  </SkeletonRegion>
}
