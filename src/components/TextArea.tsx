import { forwardRef } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Show coral border/ring instead of the default sky focus ring. */
  invalid?: boolean
  /** Visual density. `md` (default) matches the form-modal scale. */
  inputSize?: 'sm' | 'md'
}

/**
 * Canonical LingxiLoop multi-line text field. Shares the Input chrome (paper bg,
 * 1.5px ink-100 border, 10px radius, sky focus ring) and adds vertical resize
 * + 1.5 line-height suited for prose.
 */
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { className, invalid, inputSize = 'md', ...rest },
  ref,
) {
  return (
    <Textarea
      ref={ref}
      className={cn(
        'leading-[1.5] resize-y',
        inputSize === 'sm' ? 'text-[12.5px]' : 'text-[13.5px]',
        className,
      )}
      {...rest}
      aria-invalid={invalid || undefined}
    />
  )
})
