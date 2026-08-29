import { cn } from '@/lib/utils'
import type { Participant } from '@/types'

const MAX_VISIBLE_AGENTS = 2

export function AgentTypingIndicator({
  agents,
  className,
}: {
  agents: Participant[]
  className?: string
}) {
  const visible = agents.slice(0, MAX_VISIBLE_AGENTS)
  if (visible.length === 0) return null

  const names = visible.map((agent) => agent.name).join('、')
  const label = `${names}${agents.length > MAX_VISIBLE_AGENTS ? ' 等' : ''}正在输入中`

  return (
    <div
      data-agent-typing-indicator
      className={cn(
        'agent-typing-indicator pointer-events-none flex min-h-9 w-full shrink-0 items-center px-4 py-1.5 sm:px-5',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="whitespace-nowrap text-[12px] font-medium text-muted-foreground">
        {label}
        <span className="agent-typing-dots" aria-hidden="true"><i /><i /><i /></span>
      </span>
    </div>
  )
}
