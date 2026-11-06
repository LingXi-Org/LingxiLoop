import type { ComponentProps } from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { StatusNotice } from './status-notice'
import { cn } from '@/lib/utils'
import { ShimmerLabel } from './surfaces'

export function ErrorState({ title, detail, retrying, onRetry, retryLabel = '重试', retryingLabel = '正在重试', disabled, className, ...props }: Omit<ComponentProps<'div'>, 'children' | 'role'> & {
  title: string; detail: string; retrying: boolean; onRetry?: () => void; retryLabel?: string; retryingLabel?: string; disabled?: boolean
}) {
  if (retrying) return <div data-slot="error-state" key="retrying" role="status" className={cn(
    'fade-in animate-in flex w-full items-center gap-2.5 text-sm duration-300 motion-reduce:animate-none', className,
  )} {...props}>
    <RefreshCwIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground motion-safe:animate-spin" />
    <ShimmerLabel className="relative inline-block text-muted-foreground">{retryingLabel}</ShimmerLabel>
  </div>
  return <StatusNotice data-slot="error-state" key="error" tone="error" title={title} detail={detail}
    action={onRetry ? { label: retryLabel, onClick: onRetry, disabled } : undefined}
    className={cn('fade-in animate-in duration-300 motion-reduce:animate-none', className)} {...props} />
}
