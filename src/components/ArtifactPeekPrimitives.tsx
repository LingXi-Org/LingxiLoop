import { Cancel01Icon, Maximize01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'

export function PeekHeader({
  icon,
  label,
  title,
  meta,
  onClose,
  onOpenFull,
}: {
  icon: ReactNode
  label: string
  title: string
  meta?: string
  onClose: () => void
  onOpenFull?: () => void
}) {
  return (
    <header className="shrink-0 border-b border-[var(--im-divider-weak)] bg-card px-4 py-3">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-muted text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <h2 className="mt-0.5 truncate text-base font-semibold leading-tight">{title}</h2>
          {meta && <div className="mt-1 truncate text-xs text-muted-foreground">{meta}</div>}
        </div>
        {onOpenFull && (
          <Button
            type="button"
            onClick={onOpenFull}
            variant="ghost"
            size="icon-sm"
            title="打开完整工作区"
            aria-label="打开完整工作区"
          >
            <HugeiconsIcon icon={Maximize01Icon} />
          </Button>
        )}
        <Button
          type="button"
          onClick={onClose}
          variant="ghost"
          size="icon-sm"
          title="关闭"
          aria-label="关闭"
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </div>
    </header>
  )
}

export function PeekLoading({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="relative h-full space-y-3 bg-card p-4" aria-label={label}>
      <Skeleton className="h-12" />
      <Skeleton className="h-48" />
      <div className="pointer-events-none absolute start-4 top-4 grid size-10 place-items-center text-primary" aria-hidden>{icon}</div>
    </div>
  )
}

export function PeekUnavailable({
  icon,
  title,
  detail,
  onClose,
}: {
  icon: ReactNode
  title: string
  detail: string
  onClose: () => void
}) {
  return (
    <div className="grid h-full place-items-center bg-card px-8 text-center">
      <Empty><EmptyHeader><EmptyMedia variant="icon">{icon}</EmptyMedia><EmptyTitle>{title}</EmptyTitle><EmptyDescription>{detail}</EmptyDescription></EmptyHeader><Button variant="outline" onClick={onClose}>关闭</Button></Empty>
    </div>
  )
}

export function formatShortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '最近'
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', year: 'numeric' })
}
