import { SkeletonRegion } from '@/components/ResourceSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

export function CaseListSkeleton({ featured }: { featured: boolean }) {
  return <SkeletonRegion label="正在加载教学案例" aria-busy="true" className="case-skeleton">
    {featured && <div className="case-featured">
      <Skeleton className="case-card-cover case-skeleton-featured-cover" />
      <div className="flex min-w-0 flex-col gap-[22px]">
        <div className="space-y-3"><Skeleton className="h-[26px] w-[92%]" /><Skeleton className="h-[26px] w-[64%]" /></div>
        <div className="space-y-[11px]">{['100%', '96%', '58%'].map(width => <Skeleton key={width} className="h-[13px]" style={{ width }} />)}</div>
        <div className="flex items-center gap-2"><Skeleton className="size-[22px] shrink-0 rounded-full" /><Skeleton className="h-3 w-24" /></div>
      </div>
    </div>}
    <div className="case-filters">
      <div className="case-categories">{[52, 84, 72, 86, 84, 72].map((width, index) => <Skeleton key={index} className="h-[30px] rounded-full" style={{ width }} />)}</div>
      <Skeleton className="ms-auto h-[30px] w-[220px] max-w-full rounded-full" />
    </div>
    <div className="case-grid">{Array.from({ length: 6 }, (_, index) => <div key={index} className="case-card">
      <Skeleton className="case-card-cover" />
      <div className="space-y-2.5 px-0.5">
        <div className="space-y-2"><Skeleton className="h-[15px] w-[88%]" /><Skeleton className="h-[15px] w-[54%]" /></div>
        <div className="space-y-2"><Skeleton className="h-[11px] w-full" /><Skeleton className="h-[11px] w-[76%]" /></div>
        <Skeleton className="h-[11px] w-[84px]" />
      </div>
    </div>)}</div>
  </SkeletonRegion>
}

export function CaseDetailSkeleton() {
  return <SkeletonRegion label="正在加载案例" aria-busy="true" className="case-skeleton case-reader">
    <div className="case-reader-heading">
      <Skeleton className="h-[22px] w-[76px]" />
      <div className="space-y-3"><Skeleton className="h-8 w-[86%]" /><Skeleton className="h-8 w-[52%]" /></div>
      <div className="flex items-center gap-2.5"><Skeleton className="size-[26px] shrink-0 rounded-full" /><Skeleton className="h-[13px] w-[200px] max-w-[70%]" /></div>
    </div>
    <div className="case-reading-layout">
      <div className="case-reading-column case-skeleton-body">
        <Skeleton className="case-reader-cover w-full" />
        <div className="space-y-3.5">{['100%', '98%', '100%', '62%'].map((width, index) => <Skeleton key={index} className="h-3.5" style={{ width }} />)}</div>
        <div className="pt-2.5"><Skeleton className="h-5 w-[180px] max-w-full" /></div>
        <div className="space-y-3.5">{['100%', '96%', '100%', '99%', '40%'].map((width, index) => <Skeleton key={index} className="h-3.5" style={{ width }} />)}</div>
        <div className="flex items-center gap-3.5 rounded-xl border border-border p-3">
          <Skeleton className="h-16 w-24 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2.5"><Skeleton className="h-3 w-[40%]" /><Skeleton className="h-3 w-[64%]" /></div>
        </div>
        <div className="space-y-3.5">{['100%', '94%', '70%'].map(width => <Skeleton key={width} className="h-3.5" style={{ width }} />)}</div>
      </div>
      <div className="case-outline">
        <p>本文目录</p>
        <div className="border-s border-border">{['72%', '88%', '80%', '64%'].map(width => <div key={width} className="py-[7px] ps-3"><Skeleton className="h-[11px]" style={{ width }} /></div>)}</div>
      </div>
    </div>
  </SkeletonRegion>
}
