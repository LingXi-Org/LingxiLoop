import { forwardRef } from 'react'
import { Input as BaseInput } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Show coral border/ring instead of the default sky focus ring. */
  invalid?: boolean
  /** Visual density. `md` (default) matches AgentEditor / EventEditor forms. */
  inputSize?: 'sm' | 'md'
}

/**
 * Canonical LingxiLoop text field. Paper-toned background, 1.5px ink-100 border,
 * 10px radius, sky focus ring — the same look the in-app form modals
 * (AgentEditor, EventEditor, GroupCreator) used to hand-roll under three
 * different class names.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, inputSize = 'md', ...rest },
  ref,
) {
  return (
    <BaseInput
      ref={ref}
      className={cn(
        inputSize === 'sm' ? 'h-8 text-[12.5px]' : 'h-9 text-[13.5px]',
        className,
      )}
      {...rest}
      aria-invalid={invalid || undefined}
    />
  )
})
