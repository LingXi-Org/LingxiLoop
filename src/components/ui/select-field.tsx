import type { ReactNode } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export interface SelectFieldOption<T extends string = string> {
  value: T
  label: string
  hint?: ReactNode
  disabled?: boolean
}

interface SelectFieldProps<T extends string = string> {
  value: T
  options: readonly SelectFieldOption<T>[]
  onValueChange: (value: T) => void
  id?: string
  ariaLabel: string
  disabled?: boolean
  className?: string
  triggerClassName?: string
  size?: 'compact' | 'default'
}

const encodeValue = (value: string) => `option:${value}`

/**
 * The one project-level single-select composition. Accessibility, keyboard
 * navigation and portal behavior stay owned by the official shadcn primitive.
 */
export function SelectField<T extends string = string>({
  value,
  options,
  onValueChange,
  id,
  ariaLabel,
  disabled = false,
  className,
  triggerClassName,
  size = 'default',
}: SelectFieldProps<T>) {
  const selected = options.find((option) => option.value === value)

  return (
    <Select
      value={encodeValue(value)}
      disabled={disabled}
      onValueChange={(encoded) => {
        const option = options.find((candidate) => encodeValue(candidate.value) === encoded)
        if (option && !option.disabled) onValueChange(option.value)
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'border-ink-100 bg-cloud text-ink-900 focus:ring-sky2-100',
          size === 'compact' && 'h-7 px-2 text-xs',
          className,
          triggerClassName,
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label ?? options[0]?.label ?? ''}</span>
        {selected?.hint ? <span className="shrink-0 text-xs text-ink-400">{selected.hint}</span> : null}
      </SelectTrigger>
      <SelectContent position="popper" className="border-ink-100 bg-panel text-ink-900">
        {options.map((option) => (
          <SelectItem
            key={encodeValue(option.value)}
            value={encodeValue(option.value)}
            disabled={option.disabled}
            className="focus:bg-sky2-50 focus:text-skype-deep"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.hint ? <span className="shrink-0 text-xs text-ink-400">{option.hint}</span> : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
