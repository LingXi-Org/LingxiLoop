import { useId, type ReactNode } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

interface CheckboxFieldProps {
  id?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

/** A labeled application field composed around the official shadcn checkbox. */
export function CheckboxField({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className,
  ariaLabel,
}: CheckboxFieldProps) {
  const generatedId = useId()
  const checkboxId = id ?? generatedId

  return (
    <label
      htmlFor={checkboxId}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
        checked ? 'border-sky2-200 bg-sky2-50 text-skype-deep' : 'border-ink-100 bg-cloud text-ink-700',
        disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:border-sky2-200',
        className,
      )}
    >
      <Checkbox
        id={checkboxId}
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onCheckedChange={(next) => onCheckedChange(next === true)}
        className="size-5 rounded-md border-ink-200 data-[state=checked]:border-skype data-[state=checked]:bg-skype"
      />
      {label || description ? (
        <span className="min-w-0 flex-1">
          {label ? <span className="block text-[12.5px] font-semibold leading-tight">{label}</span> : null}
          {description ? <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-400">{description}</span> : null}
        </span>
      ) : null}
    </label>
  )
}
