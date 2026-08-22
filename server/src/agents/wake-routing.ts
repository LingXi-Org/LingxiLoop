import { resolveMailboxDelivery, type AgentActivation } from './mailbox-delivery.js'

export type WakeDispatchRoute = 'queue-only' | 'managed-server' | 'wake-bus'

/**
 * Complete, side-effect-free dispatch contract for a scheduler wake.
 *
 * `message.new` is different from synthetic/manual wakes: the durable row is
 * already in the mailbox, so merely calling the low-level scheduler API is not
 * proof that work should start. Human input activates by default; Agent input
 * activates only when an internal handoff/follow-up explicitly marks it as a
 * trigger. Missing author/activation context is therefore queue-only.
 */
export function resolveWakeDispatch(args: {
  reason: 'message.new' | 'idle' | 'manual' | 'background_scan' | 'poll.updated'
  message?: {
    authorKind: 'human' | 'agent' | 'unknown'
    activation?: AgentActivation
  }
  hostKind: 'cloud' | 'local' | 'vps' | null
  managedAgentExecution: 'pod' | 'server'
  reasoningRuntime: 'legacy' | 'lingxigraph'
}): WakeDispatchRoute {
  if (args.reason === 'message.new') {
    if (!args.message) return 'queue-only'
    const mailbox = resolveMailboxDelivery({
      authorKind: args.message.authorKind,
      activation: args.message.activation,
      targetBusy: false,
    })
    if (!mailbox.activate) return 'queue-only'
  }

  const byoa = args.hostKind === 'local' || args.hostKind === 'vps'
  if (!byoa && args.managedAgentExecution === 'server' && args.reasoningRuntime === 'lingxigraph') {
    return 'managed-server'
  }
  return 'wake-bus'
}
