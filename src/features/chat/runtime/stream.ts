import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import type { ActiveAgentRun } from './store'

const DEFAULT_SEQUENCE_LIMIT = 2_000

export class StreamSequenceTracker {
  private readonly latest = new Map<string, number>()

  constructor(private readonly limit = DEFAULT_SEQUENCE_LIMIT) {}

  accept(messageId: string, sequence: number | undefined): boolean {
    if (sequence === undefined) return true
    const previous = this.latest.get(messageId)
    if (previous !== undefined && sequence <= previous) return false
    this.latest.delete(messageId)
    this.latest.set(messageId, sequence)
    if (this.latest.size > this.limit) {
      const oldest = this.latest.keys().next().value
      if (oldest) this.latest.delete(oldest)
    }
    return true
  }

  clear(): void {
    this.latest.clear()
  }
}

export function runningAgentIds(runs: Record<string, ActiveAgentRun>): string[] {
  return [...new Set(Object.values(runs)
    .filter((run) => run.state === 'queued' || run.state === 'running')
    .map((run) => run.agentId))]
}

export function mergeStreamParts(
  current: readonly ThreadAssistantMessagePart[],
  update: {
    phase: 'thinking' | 'answer'
    mode: 'open' | 'append'
    text: string
    running: boolean
  },
): ThreadAssistantMessagePart[] {
  const targetType = update.phase === 'thinking' ? 'reasoning' : 'text'
  const previous = current.find((part) => part.type === targetType)
  const previousText = previous && 'text' in previous ? previous.text : ''
  const nextText = update.mode === 'open' ? update.text : `${previousText}${update.text}`
  const partStatus = update.running ? { type: 'running' as const } : { type: 'complete' as const }
  let replaced = false
  const parts = current.map((part) => {
    if (part.type === targetType) {
      replaced = true
      return { ...part, text: nextText, status: partStatus }
    }
    if (part.type === 'reasoning' && (update.phase === 'answer' || !update.running)) {
      return { ...part, status: { type: 'complete' as const } }
    }
    if (part.type === 'text' && !update.running) {
      return { ...part, status: { type: 'complete' as const } }
    }
    return part
  })
  if (replaced) return parts
  return [...parts, { type: targetType, text: nextText, status: partStatus }]
}
