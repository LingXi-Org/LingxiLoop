import type { ComponentProps } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ghostButton, mono } from './surfaces'

export function MessageBranches({ variants, index, onIndexChange, className, ...props }: Omit<ComponentProps<'div'>, 'children'> & {
  variants: readonly string[]; index: number; onIndexChange: (index: number) => void
}) {
  const hasNavigation = variants.length > 1
  return <div data-slot="message-branches" className={cn('flex max-w-sm flex-col gap-2', className)} {...props}>
    <p key={index} className="fade-in slide-in-from-bottom-1 animate-in min-h-[4.25rem] text-sm leading-relaxed text-foreground/90 duration-300 motion-reduce:animate-none">{variants[index] ?? variants[0] ?? ''}</p>
    <div className="flex items-center gap-1">
      <button type="button" aria-label="上一版回复" disabled={!hasNavigation} onClick={() => onIndexChange(index === 0 ? variants.length - 1 : index - 1)} className={cn(ghostButton, 'size-6 max-md:size-11')}>
        <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
      </button>
      <span aria-live="polite" className={cn(mono, 'tabular-nums text-muted-foreground')}>{variants.length === 0 ? '0 / 0' : `${index + 1} / ${variants.length}`}</span>
      <button type="button" aria-label="下一版回复" disabled={!hasNavigation} onClick={() => onIndexChange(index === variants.length - 1 ? 0 : index + 1)} className={cn(ghostButton, 'size-6 max-md:size-11')}>
        <ChevronRightIcon aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  </div>
}
