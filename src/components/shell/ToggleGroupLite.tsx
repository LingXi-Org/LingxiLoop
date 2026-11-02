import { HugeiconsIcon, type HugeiconsIconProps } from '@hugeicons/react'
import { cn } from '@/lib/utils'

/** A segmented icon switch (grid/list and similar), shadcn toggle-group look. */
export function ToggleGroupLite<T extends string>({ label, value, onValueChange, items }: {
  label: string
  value: T
  onValueChange(value: T): void
  items: readonly { value: T; label: string; icon: HugeiconsIconProps['icon'] }[]
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-9 shrink-0 items-center rounded-lg border border-border bg-background p-0.5">
      {items.map((item) => (
        <button key={item.value} type="button" aria-label={item.label} title={item.label} aria-pressed={value === item.value} onClick={() => onValueChange(item.value)}
          className={cn('grid h-full w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-md:w-10',
            value === item.value && 'bg-muted text-foreground')}>
          <HugeiconsIcon icon={item.icon} strokeWidth={1.8} className="size-4" />
        </button>
      ))}
    </div>
  )
}
