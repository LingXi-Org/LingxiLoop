import type { ComponentProps } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type ResourceSkeletonVariant = 'list' | 'cards' | 'detail' | 'media' | 'table'

interface ResourceSkeletonProps extends Omit<ComponentProps<'div'>, 'children'> {
  variant?: ResourceSkeletonVariant
  count?: number
  compact?: boolean
  label?: string
}

function SkeletonRow({ compact = false }: { compact?: boolean }) {
  return <div className={cn('flex items-center gap-3', compact ? 'px-2.5 py-2' : 'px-4 py-3')}>
    <Skeleton className={cn('shrink-0 rounded-lg', compact ? 'size-7' : 'size-9')} />
    <div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-2.5 w-5/12" /></div>
  </div>
}

function SkeletonCard() {
  return <div className="rounded-xl border border-border/60 bg-card p-4">
    <div className="flex items-center gap-3"><Skeleton className="size-9 shrink-0 rounded-lg" /><div className="min-w-0 flex-1 space-y-2"><Skeleton className="h-3.5 w-3/5" /><Skeleton className="h-2.5 w-2/5" /></div></div>
    <Skeleton className="mt-4 h-2.5 w-full" /><Skeleton className="mt-2 h-2.5 w-4/5" />
  </div>
}

function SkeletonDetail() {
  return <div className="flex h-full min-h-48 flex-col">
    <div className="flex items-center gap-3 border-b border-border/60 p-4"><Skeleton className="size-10 shrink-0 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-2.5 w-1/5" /></div></div>
    <div className="flex-1 space-y-4 p-5"><Skeleton className="h-6 w-2/5" /><div className="space-y-2.5"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-11/12" /><Skeleton className="h-3 w-4/5" /></div><Skeleton className="h-28 w-full rounded-xl" /></div>
  </div>
}

function SkeletonTable({ count }: { count: number }) {
  return <div className="overflow-hidden rounded-xl border border-border/60">
    <div className="grid grid-cols-4 gap-4 border-b border-border/60 p-3">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-3 w-3/4" />)}</div>
    {Array.from({ length: count }, (_, row) => <div key={row} className="grid grid-cols-4 gap-4 border-b border-border/40 p-3 last:border-b-0">{Array.from({ length: 4 }, (_, column) => <Skeleton key={column} className="h-3 w-full" />)}</div>)}
  </div>
}

export function ResourceSkeleton({ variant = 'list', count = 3, compact = false, label = '正在加载资源', className, ...props }: ResourceSkeletonProps) {
  const safeCount = Math.max(1, Math.min(count, 8))
  return <div data-resource-skeleton="" data-resource-skeleton-variant={variant} role="status" aria-label={label} className={cn('pointer-events-none w-full', className)} {...props}>
    <span className="sr-only">{label}</span>
    {variant === 'list' && Array.from({ length: safeCount }, (_, index) => <SkeletonRow key={index} compact={compact} />)}
    {variant === 'cards' && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: safeCount }, (_, index) => <SkeletonCard key={index} />)}</div>}
    {variant === 'detail' && <SkeletonDetail />}
    {variant === 'media' && <Skeleton className="aspect-video h-full min-h-40 w-full rounded-xl" />}
    {variant === 'table' && <SkeletonTable count={safeCount} />}
  </div>
}
