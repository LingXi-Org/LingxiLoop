import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function GenUiLoadingSkeleton({ label, className }: { label: string; className?: string }) {
  return <SkeletonRegion label={label} aria-busy="true" data-gen-ui-loading=""
    className={cn('pointer-events-none w-full min-w-0 space-y-3 rounded-xl border border-border/60 p-4 motion-reduce:animate-none', className)}>
    <Skeleton className="h-3 w-1/3 max-w-40 motion-reduce:animate-none" />
    <Skeleton className="h-32 w-full rounded-lg motion-reduce:animate-none sm:h-40" />
  </SkeletonRegion>
}
