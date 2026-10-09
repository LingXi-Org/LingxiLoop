// Adapted from assistant-ui's MIT-licensed ToolFallback compound components.
// https://www.assistant-ui.com/elements/tool-fallback — product actions stay in NativeTool.
import { useScrollLock, useToolCallElapsed, type ToolCallMessagePartStatus } from '@assistant-ui/react'
import { AlertCircleIcon, CheckIcon, ChevronDownIcon, LoaderIcon, XCircleIcon } from 'lucide-react'
import { type ComponentProps, useRef, useState } from 'react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

function Root({ className, open: controlledOpen, onOpenChange, defaultOpen = false, ...props }: ComponentProps<typeof Collapsible>) {
  const root = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(defaultOpen)
  const lockScroll = useScrollLock(root, 200)
  return <Collapsible ref={root} data-slot="tool-fallback-root" open={controlledOpen ?? open}
    onOpenChange={next => { lockScroll(); setOpen(next); onOpenChange?.(next) }}
    className={cn('aui-tool-fallback-root min-w-0', className)} {...props} />
}

const icons = { running: LoaderIcon, complete: CheckIcon, incomplete: XCircleIcon, 'requires-action': AlertCircleIcon }
function Trigger({ toolName, label, status, className, ...props }: ComponentProps<typeof CollapsibleTrigger> & {
  toolName: string; label: string; status: ToolCallMessagePartStatus
}) {
  const elapsed = useToolCallElapsed()
  const Icon = icons[status.type]
  return <CollapsibleTrigger data-slot="tool-fallback-trigger" className={cn('group flex w-full items-center gap-2 rounded-md py-1.5 text-start text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring', className)} {...props}>
    <Icon aria-hidden className={cn('size-4 shrink-0', status.type === 'running' && 'motion-safe:animate-spin')} />
    <span className="min-w-0 flex-1 break-words"><span className="font-medium text-foreground">{toolName}</span><span className="ms-2 text-xs">{label}</span></span>
    {elapsed !== undefined && <span className="shrink-0 text-xs tabular-nums">{(Math.max(0, elapsed) / 1000).toFixed(1)} 秒</span>}
    <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
  </CollapsibleTrigger>
}

function Content({ className, ...props }: ComponentProps<typeof CollapsibleContent>) {
  return <CollapsibleContent data-slot="tool-fallback-content" className={cn('min-w-0 space-y-3 py-2 ps-6 text-sm', className)} {...props} />
}

function Args({ argsText }: { argsText: string }) {
  return <div><p className="mb-1 text-xs text-muted-foreground">参数</p><pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap break-all">{argsText}</pre></div>
}

function Result({ result, label = '结果' }: { result: unknown; label?: string }) {
  if (result === undefined) return null
  return <div><p className="mb-1 text-xs text-muted-foreground">{label}</p><pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap break-all">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</pre></div>
}

export const ToolFallback = { Root, Trigger, Content, Args, Result }
