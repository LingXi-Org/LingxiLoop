import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Show coral border/ring instead of the default sky focus ring. */
  invalid?: boolean
  /** Visual density. `md` (default) matches AgentEditor / EventEditor forms. */
  inputSize?: 'sm' | 'md'
}

/**
 * Canonical Cumora text field. Paper-toned background, 1.5px ink-100 border,
 * 10px radius, sky focus ring — the same look the in-app form modals
 * (AgentEditor, EventEditor, GroupCreator) used to hand-roll under three
 * different class names.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, inputSize = 'md', ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full bg-paper text-ink-900 placeholder:text-ink-300',
        'border-[1.5px] rounded-[10px] outline-none',
        'transition-[border-color,box-shadow] duration-150',
        'disabled:opacity-60 disabled:cursor-not-allowed',
        inputSize === 'sm' ? 'px-2.5 py-1.5 text-[12.5px]' : 'px-3 py-2 text-[13.5px]',
        invalid
          ? 'border-coral focus:border-coral-deep focus:shadow-[0_0_0_3px_var(--coral-soft)]'
          : 'border-ink-100 focus:border-sky2-300 focus:shadow-[0_0_0_3px_var(--sky-50)]',
        className,
      )}
      {...rest}
    />
  )
})
