import { useEffect, useState } from 'react'
import { ws } from '@/api/core/realtime'
import { AgentStatus } from '@/components/assistant-ui/elements/agent-status'
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

  const latestByRun = new Map<string, CoworkerActivity>()
  for (const event of events) latestByRun.set(event.runId, event)
  const active = [...latestByRun.values()].reverse()
    .find((event) => event.runStatus === 'running' || event.runStatus === 'waiting_for_human')
  if (!active) return null
  return <div className="flex w-full shrink-0 justify-center px-3 py-1.5" data-chat-agent-status>
    <AgentStatus
      state={active.runStatus === 'waiting_for_human' ? 'waiting' : 'working'}
      label={`${active.agentName} · ${active.title}`}
      role="status"
      aria-live="polite"
    />
  </div>
}
