import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusNoticeTone = 'error' | 'incomplete' | 'offline' | 'undelivered'

const ICONS: Record<StatusNoticeTone, ReactNode> = {
  error: <path d="M18 6 6 18M6 6l12 12" />,
  incomplete: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
  offline: <><path d="M2 8.5a15 15 0 0 1 20 0M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01" /><path d="m3 3 18 18" /></>,
  undelivered: <path d="M12 19V5M5 12l7-7 7 7" />,
}

export type StatusNoticeAction = { label: string; onClick: () => void; disabled?: boolean; busy?: boolean }

/** One card for failed, interrupted and undelivered work: what happened, then the one next step. */
export function StatusNotice({ tone, title, detail, action, secondary, className, ...props }: Omit<ComponentProps<'div'>, 'title' | 'children'> & {
  tone: StatusNoticeTone
  title: ReactNode
  detail?: ReactNode
  action?: StatusNoticeAction
  secondary?: StatusNoticeAction
}) {
  return <div data-slot="status-notice" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}
    className={cn('status-notice flex w-full max-w-[420px] items-center gap-3 rounded-xl bg-card py-2.5 ps-3 pe-2.5', className)} {...props}>
    <span aria-hidden="true" className="status-notice-icon grid size-7 shrink-0 place-items-center rounded-full">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="size-[15px]">{ICONS[tone]}</svg>
    </span>
    <span className="flex min-w-0 flex-1 flex-col gap-px">
      <span data-slot="status-notice-title" className="text-[13.5px] font-medium text-foreground">{title}</span>
      {detail && <span data-slot="status-notice-detail" className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">{detail}</span>}
    </span>
    {secondary && <button type="button" onClick={secondary.onClick} disabled={secondary.disabled || secondary.busy}
      className="h-7 shrink-0 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 max-md:min-h-11">{secondary.label}</button>}
    {action && <button type="button" onClick={action.onClick} disabled={action.disabled || action.busy} aria-busy={action.busy || undefined}
      className="status-notice-action h-7 shrink-0 whitespace-nowrap rounded-lg px-2.5 text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40 max-md:min-h-11">{action.label}</button>}
  </div>
}
