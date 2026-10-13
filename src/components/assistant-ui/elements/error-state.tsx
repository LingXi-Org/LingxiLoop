import type { ComponentProps } from 'react'
import { CircleAlertIcon, RefreshCwIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ShimmerLabel } from './surfaces'

export function ErrorState({ title, detail, retrying, onRetry, disabled, className, ...props }: Omit<ComponentProps<'div'>, 'children' | 'role'> & {
  title: string; detail: string; retrying: boolean; onRetry: () => void; disabled?: boolean
}) {
  if (retrying) return <div data-slot="error-state" key="retrying" role="status" className={cn(
    'fade-in animate-in flex w-full items-center gap-2.5 text-sm duration-300 motion-reduce:animate-none', className,
  )} {...props}>
    <RefreshCwIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground motion-safe:animate-spin" />
    <ShimmerLabel className="relative inline-block text-muted-foreground">正在重试</ShimmerLabel>
  </div>
  return <div data-slot="error-state" key="error" role="alert" className={cn(
    'fade-in animate-in flex w-full items-start gap-2.5 rounded-2xl bg-red-500/[0.06] px-4 py-3 text-sm duration-300 motion-reduce:animate-none dark:bg-red-500/10', className,
  )} {...props}>
    <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-red-500/80" />
    <div className="min-w-0 flex-1">
      <p className="font-medium text-red-600 dark:text-red-400">{title}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-red-600 dark:text-red-400">{detail}</p>
    </div>
    <button type="button" onClick={onRetry} disabled={disabled} className="ms-auto flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-red-600 outline-none transition-colors hover:bg-red-500/10 focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-40 max-md:min-h-11 dark:text-red-400">
      <RefreshCwIcon aria-hidden="true" className="size-3" />重试
    </button>
  </div>
}
