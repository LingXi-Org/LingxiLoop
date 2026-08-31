import { useEffect, useState } from 'react'
import { ws } from '@/api/core/realtime'
import { agentsApi } from '@/features/agents/api'
import type { CoworkerActivity } from '@/features/agents/contracts'

export function ConversationActivity({ conversationId }: { conversationId: string }) {
  const [events, setEvents] = useState<CoworkerActivity[]>([])
  useEffect(() => {
    let cancelled = false
    setEvents([])
    const merge = (rows: CoworkerActivity[]) => {
      if (cancelled) return
      setEvents((current) => {
        const byId = new Map(current.map((event) => [event.id, event]))
        for (const event of rows) byId.set(event.id, event)
        return [...byId.values()]
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
          .slice(-12)
      })
    }
    const refresh = () => void agentsApi.getCoworkerActivity(conversationId).then(merge).catch(() => {})
    refresh()
    void ws.connect()
    const off = ws.on((event) => {
      if (event.type === 'agent.activity' && event.conversationIds.includes(conversationId)) merge([event.activity])
      else if (event.type === 'hello') refresh()
    })
    const timer = window.setInterval(refresh, 60_000)
    return () => { cancelled = true; off(); window.clearInterval(timer) }
  }, [conversationId])

  const visible = events.slice(-3)
  if (visible.length === 0) return null
  const latestByRun = new Map<string, CoworkerActivity>()
  for (const event of events) latestByRun.set(event.runId, event)
  const active = [...latestByRun.values()].reverse()
    .find((event) => event.runStatus === 'running' || event.runStatus === 'waiting_for_human')
  return (
    <div className="border-b border-[var(--im-divider-weak)] bg-background px-5 py-2" role="status" aria-label="智能助教最近活动">
      <div className="mx-auto flex max-w-[900px] items-center gap-3 overflow-hidden">
        <span className={`size-2 shrink-0 rounded-full ${active ? 'animate-pulse bg-[var(--working)]' : 'bg-[var(--avail)]'}`} />
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
          {active ? `${active.agentName}${active.runStatus === 'waiting_for_human' ? ' 正在等待你' : ' 正在工作'}` : '最近活动'}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          {visible.map((event) => (
            <span key={event.id} className="max-w-[240px] truncate rounded-full bg-muted px-2.5 py-1 text-[10.5px] text-muted-foreground" title={event.title}>
              {/completed/.test(event.kind) ? '✓' : /failed/.test(event.kind) ? '!' : '●'} {event.title}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
