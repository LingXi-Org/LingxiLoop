// Adapted from assistant-ui's MIT-licensed Reasoning element for react 0.15.16.
// https://www.assistant-ui.com/elements/reasoning
import { useScrollLock } from '@assistant-ui/react'
import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export function Reasoning({ streaming, summary, children }: { streaming: boolean; summary?: string; children: ReactNode }) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const lockScroll = useScrollLock(root, 200)
  const open = userOpen ?? streaming

  useEffect(() => {
    if (!streaming || !open || !viewport.current || !content.current) return
    const scroll = viewport.current
    let pinned = true, lastTop = scroll.scrollTop, lastHeight = scroll.scrollHeight
    const pin = () => { if (pinned) scroll.scrollTop = scroll.scrollHeight }
    const onScroll = () => {
      if (scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 1) pinned = true
      else if (scroll.scrollTop < lastTop && scroll.scrollHeight === lastHeight) pinned = false
      lastTop = scroll.scrollTop; lastHeight = scroll.scrollHeight
    }
    pin()
    scroll.addEventListener('scroll', onScroll)
    const observer = new ResizeObserver(pin)
    observer.observe(content.current)
    return () => { observer.disconnect(); scroll.removeEventListener('scroll', onScroll) }
  }, [open, streaming])

  return <Collapsible ref={root} open={open} onOpenChange={next => { lockScroll(); setUserOpen(next) }}
    data-slot="reasoning-root" className="aui-reasoning-root min-w-0 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
    <CollapsibleTrigger data-slot="reasoning-trigger" className="group flex w-full items-center gap-2 rounded-md py-1 text-start text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
      <BrainIcon aria-hidden className="size-4 shrink-0" />
      <span className={cn('min-w-0 flex-1 break-words', streaming && 'motion-safe:shimmer')}>{summary || (streaming ? '正在思考' : '推理过程')}</span>
      <ChevronDownIcon aria-hidden className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
    </CollapsibleTrigger>
    <CollapsibleContent data-slot="reasoning-content" aria-busy={streaming}>
      <div ref={viewport} className="max-h-64 overflow-y-auto overscroll-contain py-2 ps-6 text-sm leading-relaxed text-muted-foreground">
        <div ref={content} className="space-y-3 whitespace-pre-wrap break-words">{children}</div>
      </div>
    </CollapsibleContent>
  </Collapsible>
}
