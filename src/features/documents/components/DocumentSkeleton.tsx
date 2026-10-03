import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function DocumentSkeleton() {
  return <SkeletonRegion label="正在加载文档" className="flex h-full min-h-64 flex-col overflow-hidden bg-card">
    <div className="flex shrink-0 items-center gap-3 border-b p-4"><Skeleton className="h-5 w-2/5" /><Skeleton className="ms-auto h-8 w-20" /></div>
    <div className="flex gap-3 border-b px-5 py-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="size-6 rounded-md" />)}</div>
    <div className="mx-auto w-full max-w-3xl space-y-5 px-6 py-8 sm:px-10"><Skeleton className="mb-8 h-8 w-3/5" />{[100, 92, 96, 70, 100, 88].map((width, index) => <Skeleton key={index} className="h-3" style={{ width: `${width}%` }} />)}</div>
  </SkeletonRegion>
}
