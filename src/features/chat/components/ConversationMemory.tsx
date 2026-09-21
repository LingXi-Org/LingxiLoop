import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MemoryChips } from '@/components/assistant-ui/elements/memory-chips'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useWorkspace } from '@/features/knowledge/workspace'
import { useAuth } from '@/stores/auth'
import { harnessApi, type MemorySummaryPage } from '../runtime/harness-api'

export function ConversationMemory(props: { conversationId: string; threadId: string | null; revision: string }) {
  const userId = useAuth(state => state.user?.id)
  const companyId = useAuth(state => state.activeCompanyId)
  const projectId = useWorkspace(state => state.selectedId)
  if (!userId || !companyId) return null
  return <MemoryPanel key={JSON.stringify([userId, companyId, projectId, props.conversationId, props.threadId])} {...props} />
}

function MemoryPanel({ conversationId, threadId, revision }: { conversationId: string; threadId: string | null; revision: string }) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<MemorySummaryPage>({ items: [], nextCursor: null })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const request = useRef<AbortController | null>(null)
  const load = useCallback(async (cursor?: string) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setError(false)
    if (!cursor) setPage({ items: [], nextCursor: null })
    try {
      const next = await harnessApi.memories(conversationId, { ...(threadId ? { threadId } : {}), ...(cursor ? { cursor } : {}) },
        AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]))
      if (controller.signal.aborted) return
      setPage(previous => ({ nextCursor: next.nextCursor, items: [...new Map(
        [...(cursor ? previous.items : []), ...next.items].map(item => [JSON.stringify([item.agentId, item.id]), item]),
      ).values()] }))
    } catch {
      if (!controller.signal.aborted) { setError(true); setPage({ items: [], nextCursor: null }) }
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [conversationId, threadId])

  useEffect(() => {
    if (!open) return
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('focus', refresh); request.current?.abort() }
  }, [open, load, revision])

  const groups = new Map<string, MemorySummaryPage['items']>()
  for (const item of page.items) groups.set(item.agentId, [...(groups.get(item.agentId) ?? []), item])
  return <Collapsible open={open} onOpenChange={setOpen} className="shrink-0 border-b border-border/60 px-3 py-1.5 sm:px-4">
    <CollapsibleTrigger asChild>
      <Button variant="ghost" size="sm" className="h-7 w-full justify-start gap-1.5 px-1 text-xs text-muted-foreground">
        <BrainIcon aria-hidden className="size-3.5" />记忆摘要
        {page.items.length > 0 && <span className="tabular-nums">{page.items.length}{page.nextCursor ? '+' : ''}</span>}
        <ChevronDownIcon aria-hidden className={`ms-auto size-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div className="grid max-h-[min(35vh,18rem)] gap-4 overflow-y-auto px-1 py-3" aria-busy={loading}>
        {[...groups].map(([agentId, items]) => <div key={agentId} className="grid min-w-0 gap-2">
          <h3 className="text-xs font-medium">{items[0].agentName}</h3>
          <MemoryChips chips={items} />
        </div>)}
        {loading && <p role="status" className="text-xs text-muted-foreground">正在加载记忆摘要…</p>}
        {error ? <div role="alert" className="flex items-center gap-2 text-xs text-muted-foreground">
          记忆摘要加载失败<Button variant="link" size="sm" onClick={() => void load()}>重试</Button>
        </div> : !loading && !page.items.length && !page.nextCursor && <p className="text-xs text-muted-foreground">暂无记忆摘要</p>}
        {page.nextCursor && <Button variant="ghost" size="sm" disabled={loading} onClick={() => void load(page.nextCursor!)}>加载更多</Button>}
      </div>
    </CollapsibleContent>
  </Collapsible>
}
