import { ArrowLeft01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** The single close control for panels, drawers and side sheets. */
export function PanelCloseButton({ label, onClick, back = false, className }: { label: string; onClick(): void; back?: boolean; className?: string }) {
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick} className={cn('shrink-0 text-muted-foreground hover:text-foreground max-md:size-11', className)}>
      <HugeiconsIcon icon={back ? ArrowLeft01Icon : Cancel01Icon} strokeWidth={2} className="size-4" />
    </Button>
  )
}

/** Header for every right-side panel (canvas, details, slides assistant).
 * Same 64px height and divider as PageHeader so the two line up side by side. */
export function RightPanelHeader({ eyebrow, title, actions, onClose, closeLabel = '关闭', back = false }: {
  eyebrow?: string
  title: ReactNode
  actions?: ReactNode
  onClose?: () => void
  closeLabel?: string
  back?: boolean
}) {
  return (
    <header data-right-panel-header className="select-none flex min-h-16 shrink-0 items-center gap-2 border-b border-[var(--im-divider-weak)] bg-sidebar px-4 text-sidebar-foreground max-md:px-2">
      {back && onClose ? <PanelCloseButton back label={closeLabel} onClick={onClose} /> : null}
      <div className="min-w-0 flex-1">
        {eyebrow ? <p className="truncate text-xs leading-4 text-muted-foreground">{eyebrow}</p> : null}
        <h2 className="truncate font-heading text-sm font-semibold leading-5 text-foreground">{title}</h2>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      {!back && onClose ? <PanelCloseButton label={closeLabel} onClick={onClose} /> : null}
    </header>
  )
}
