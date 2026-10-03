import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function CalendarSkeleton({ mode = 'week' }: { mode?: 'month' | 'week' | 'day' }) {
  const columns = mode === 'day' ? 1 : 7
  return <SkeletonRegion label="正在加载日历" className="grid min-h-0 flex-1 overflow-hidden @min-[48rem]/calendar:grid-cols-[minmax(0,1fr)_320px]">
    <div className="flex min-h-0 flex-col">
      <div className="grid shrink-0 gap-px border-b bg-border/60" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: columns }, (_, index) => <div key={index} className="bg-card p-2"><Skeleton className="mx-auto h-4 w-6" /></div>)}</div>
      <div className="grid min-h-0 flex-1 gap-px bg-border/60 p-px" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${mode === 'month' ? 5 : 8}, minmax(3rem, 1fr))` }}>{Array.from({ length: columns * (mode === 'month' ? 5 : 8) }, (_, index) => <div key={index} className="min-w-0 bg-card p-2"><Skeleton className={mode === 'month' ? 'h-3 w-4 rounded-sm' : 'h-3 w-1/3 rounded-sm'} /></div>)}</div>
    </div>
    <aside className="hidden min-h-0 space-y-3 border-s p-3 @min-[48rem]/calendar:block"><Skeleton className="h-6 w-28" />{[0, 1, 2].map(index => <Skeleton key={index} className="h-24 rounded-2xl" />)}</aside>
  </SkeletonRegion>
}
