import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function ConversationSkeleton() {
  return <SkeletonRegion label="正在加载消息" className="flex-1 space-y-8 px-4 py-6 sm:px-6">
    {[0, 1, 2].map(index => <div key={index} className="flex items-start gap-3">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="w-full max-w-2xl space-y-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" />{index === 1 && <Skeleton className="h-4 w-2/3" />}</div>
    </div>)}
  </SkeletonRegion>
}
