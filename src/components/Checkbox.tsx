import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  id?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
  ariaLabel?: string
}

export function Checkbox({
  id,
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className,
  ariaLabel,
}: CheckboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group flex min-h-11 items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left transition',
        checked
          ? 'border-sky2-200 bg-sky2-50 text-skype-deep shadow-soft'
          : 'border-ink-100 bg-cloud text-ink-700 hover:border-sky2-200 hover:bg-sky2-50/70',
        disabled && 'cursor-not-allowed opacity-55 hover:border-ink-100 hover:bg-cloud',
        !disabled && 'cursor-pointer active:scale-[0.99]',
        className,
      )}
    >
      <span className="relative grid h-5 w-5 shrink-0 place-items-center">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(e) => onCheckedChange(e.currentTarget.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 rounded-[7px] border transition duration-200 ease-out peer-focus-visible:ring-4 peer-focus-visible:ring-sky2-100',
            checked
              ? 'border-skype bg-skype shadow-[0_5px_14px_-8px_rgba(0,120,200,0.75)]'
              : 'border-ink-200 bg-paper shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] group-hover:border-sky2-300',
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-[3px] rounded-[5px] transition duration-200 ease-out',
            checked ? 'scale-100 bg-white/18 opacity-100' : 'scale-75 opacity-0',
          )}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 12 10"
          className={cn(
            'pointer-events-none relative h-2.5 w-3 text-white transition duration-200 ease-out motion-safe:group-active:scale-90',
            checked ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
          )}
          fill="none"
        >
          <path
            d="M1.5 5.2 4.5 8 10.5 1.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && <span className="block text-[12.5px] font-semibold leading-[1.2]">{label}</span>}
          {description && (
            <span className={cn('mt-0.5 block text-[11.5px] leading-[1.35]', checked ? 'text-skype-deep/75' : 'text-ink-400')}>
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  )
}
