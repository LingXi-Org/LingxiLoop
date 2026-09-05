import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function SettingsGroup({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="space-y-1 px-1">
        <h3 className="font-heading text-sm font-medium text-foreground">{title}</h3>
        {description && <p className="text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
        {children}
      </div>
    </section>
  )
}

export function SettingsRow({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-16 flex-col items-stretch justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4', className)}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 self-end sm:shrink-0 sm:self-auto">{children}</div>
    </div>
  )
}

export function SettingsPanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="正在加载设置">
      <span className="sr-only">正在加载设置</span>
      <div className="space-y-2 px-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-48 max-w-full" />
      </div>
      <div className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex min-h-16 items-center justify-between gap-4 px-4 py-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-44 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-3xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
