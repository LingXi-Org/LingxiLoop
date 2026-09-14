import { AgentStatus } from '@/components/assistant-ui/elements/agent-status'
import { useChatThreadStore } from '../runtime/store'
import { getLingxiMessageMetadata } from '../runtime/model'
import { harnessLabel } from '../runtime/harness'

export function ConversationActivity({ conversationId }: { conversationId: string }) {
  const messages = useChatThreadStore(state => state.conversations[conversationId]?.messages)
  const active = messages?.map(getLingxiMessageMetadata).reverse().find(metadata =>
    metadata.harness && ['queued','leased','waiting'].includes(metadata.harness.lifecycle ?? ''))
  if (!active?.harness) return null
  return <div className="flex w-full shrink-0 justify-center px-3 py-1.5" data-chat-agent-status>
    <AgentStatus state={active.harness.lifecycle === 'waiting' ? 'waiting' : 'working'}
      label={`${active.senderName} · ${harnessLabel(active.harness)}`} role="status" aria-live="polite" />
  </div>
}
