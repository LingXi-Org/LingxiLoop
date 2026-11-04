import { SearchIcon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type HugeiconsIconProps } from '@hugeicons/react'
import type { ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

/** The nested sidebar column every module renders into. Same surface, header
 * height and gutters as the conversation list so switching modules only swaps content. */
export function SecondaryPane({ label, header, children, footer }: {
  label: string
  header: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const isMobile = useIsMobile()
  return (
    <aside aria-label={label} data-slot="sidebar" data-secondary-pane className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-sidebar text-sidebar-foreground">
      <div className={cn('select-none flex h-14 min-w-0 shrink-0 items-center gap-2', isMobile ? 'px-3' : 'px-2')}>{header}</div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto pb-3', isMobile ? 'px-3' : 'px-2')}>{children}</div>
      {footer ? <div className={cn('shrink-0 border-t border-[var(--im-divider-weak)] py-2', isMobile ? 'px-3' : 'px-2')}>{footer}</div> : null}
    </aside>
  )
}

/** The pane's search field, identical to the conversation search. */
export function SecondarySearch({ value, onChange, placeholder, label, inputRef }: {
  value: string
  onChange(value: string): void
  placeholder: string
  label: string
  inputRef?: Ref<HTMLInputElement>
}) {
  const isMobile = useIsMobile()
  return (
    <InputGroup className={cn('min-w-0 flex-1 rounded-lg border-transparent bg-sidebar-accent shadow-none', isMobile ? 'h-11' : 'h-9')}>
      <InputGroupInput ref={inputRef} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') onChange('') }} placeholder={placeholder} aria-label={label} className={cn('px-2 text-sm', isMobile ? 'h-11' : 'h-9')} />
      <InputGroupAddon><HugeiconsIcon icon={SearchIcon} strokeWidth={2} className="size-4" /></InputGroupAddon>
      {value && <InputGroupAddon align="inline-end"><Button type="button" variant="ghost" size="icon-xs" className={isMobile ? 'size-8' : undefined} onClick={() => onChange('')} aria-label="清除搜索"><HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} /></Button></InputGroupAddon>}
    </InputGroup>
  )
}

/** A pane header that names the module instead of searching it. */
export function SecondaryTitle({ title, description, media, action }: { title: string; description?: string; media?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
      {media}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-5 text-foreground">{title}</p>
        {description ? <p className="truncate text-xs leading-4 text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function SecondaryGroup({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('py-2 first:pt-0', className)}>
      {label ? <p className="flex h-8 items-center px-3 text-xs font-medium text-muted-foreground">{label}</p> : null}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  )
}

/** One navigation row. Hover, selected and focus each look different. */
export function SecondaryItem({ label, icon, selected = false, onSelect, meta, depth = 0, disabled, title }: {
  label: ReactNode
  icon?: HugeiconsIconProps['icon']
  selected?: boolean
  onSelect(): void
  meta?: ReactNode
  depth?: 0 | 1
  disabled?: boolean
  title?: string
}) {
  const isMobile = useIsMobile()
  return (
    <li>
      <button
        type="button"
        title={title}
        disabled={disabled}
        aria-current={selected ? 'page' : undefined}
        onClick={onSelect}
        className={cn(
          'relative flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 text-start text-sm text-sidebar-foreground outline-none transition-colors duration-100 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
          isMobile ? 'min-h-11' : depth === 1 ? 'h-8' : 'h-9',
          depth === 1 && 'px-2.5 text-[13px] text-muted-foreground hover:text-foreground',
          selected && 'bg-muted font-medium text-foreground hover:bg-muted',
          selected && depth === 1 && 'bg-transparent text-foreground hover:bg-muted/60',
        )}
      >
        {depth === 1 && selected ? <span aria-hidden="true" className="absolute -start-[9.5px] top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-sidebar-primary" /> : null}
        {icon ? <HugeiconsIcon icon={icon} strokeWidth={1.8} className={cn('size-4 shrink-0', selected ? 'text-sidebar-primary' : 'text-muted-foreground')} /> : null}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {meta ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{meta}</span> : null}
      </button>
    </li>
  )
}

/** Nested rows under a SecondaryItem (shadcn SidebarMenuSub): a guide line, 32px rows. */
export function SecondarySub({ label, children }: { label: string; children: ReactNode }) {
  return <li>
    <ul aria-label={label} className="ms-5 flex flex-col gap-0.5 border-s border-[var(--im-divider)] py-0.5 ps-2">{children}</ul>
  </li>
}
