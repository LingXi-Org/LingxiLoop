// Memos ui/button, ui/input, ui/textarea and MemoContent tagStyles source adaptation (MIT).
// Native elements replace its Base UI dependency; styles and quiet controls are retained.
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { tagStyles } from './markdownStyles'

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none'
const variants = {
  default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
  outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'font-normal text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
}
export function Button({ className, variant = 'default', size = 'default', type = 'button', ...props }: ComponentProps<'button'> & { variant?: keyof typeof variants; size?: 'default' | 'sm' }) {
  return <button type={type} className={cn('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 shrink-0 [&_svg]:size-4 [&_svg]:shrink-0',
    focus, size === 'sm' ? 'h-7 gap-1.5 px-2' : 'h-8 px-3', variants[variant], className)} {...props} />
}
export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-border flex h-8 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm disabled:opacity-50 md:text-sm', focus, className)} {...props} />
}
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('border-border placeholder:text-muted-foreground flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs disabled:cursor-not-allowed disabled:opacity-50', focus, className)} {...props} />
}
export function Label({ className, ...props }: ComponentProps<'label'>) {
  return <label className={cn('text-[13px] font-medium text-foreground', className)} {...props} />
}
export function MemoTag({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn(tagStyles.base, tagStyles.defaultColor, 'text-xs', className)} {...props} />
}
export function MemoSelect({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn('h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm text-foreground', focus, className)} {...props} />
}
