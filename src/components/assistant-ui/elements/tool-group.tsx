// Adapted from assistant-ui's MIT-licensed ToolGroup, sharing its disclosure with ToolFallback.
// https://www.assistant-ui.com/elements/tool-group
import { ChevronDownIcon, LoaderIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ToolFallback } from './tool-fallback'

export function ToolGroup({ count, active, children }: { count: number; active: boolean; children: ReactNode }) {
  return <ToolFallback.Root data-slot="tool-group-root" className="rounded-xl border border-border/60 px-3 py-2">
    <CollapsibleTrigger data-slot="tool-group-trigger" className="group flex w-full items-center gap-2 rounded-md py-1 text-start text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
      {active && <LoaderIcon aria-hidden className="size-4 motion-safe:animate-spin" />}
      <span className="flex-1">{count} 项工具调用{active ? ' · 执行中' : ''}</span>
      <ChevronDownIcon aria-hidden className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
    </CollapsibleTrigger>
    <CollapsibleContent data-slot="tool-group-content" className="mt-2 grid min-w-0 gap-2 border-t border-border/60 pt-2">{children}</CollapsibleContent>
  </ToolFallback.Root>
}
