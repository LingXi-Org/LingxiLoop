import { BrainIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { field, mono } from './surfaces'

export interface MemoryChip {
  id: string
  text: string
}

export function MemoryChips({ chips, fresh = false, unavailable = false, className }: {
  chips: readonly MemoryChip[]
  fresh?: boolean
  unavailable?: boolean
  className?: string
}) {
  if (!chips.length && !unavailable) return null
  const label = !chips.length ? '记忆已更新' : fresh ? `已记住 ${chips.length} 条` : '记忆'
  return <section data-slot="memory-chips" aria-label={label} className={cn('grid min-w-0 gap-2', className)}>
    <div className={cn(mono, 'flex items-center gap-1.5 text-muted-foreground')}>
      <BrainIcon aria-hidden className="size-3.5 shrink-0" />
      <span>{label}</span>
    </div>
    {chips.length > 0 && <ul className="flex min-w-0 flex-wrap gap-1.5">
      {chips.map(chip => <li key={chip.id} className={cn(
        'max-w-full rounded-2xl px-3 py-1.5 text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]',
        'motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300',
        fresh ? 'bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300' : cn(field, 'text-foreground/80'),
      )}>{chip.text}</li>)}
    </ul>}
    {unavailable && <p className="text-xs text-muted-foreground">记忆已更新，摘要暂不可用</p>}
  </section>
}
