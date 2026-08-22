/** Explicit Agent-to-Agent communication semantics.
 *
 * A message is always durable in the conversation mailbox before this policy
 * runs. This module decides only whether delivery also activates work, and
 * which turn owns the input. Keeping the decision pure makes the timing
 * boundary regression-testable without Redis, Postgres, or a live Runtime.
 */

export type AgentActivation = 'deliver' | 'trigger'
export type MailboxDeliveryPhase = 'CURRENT_TURN' | 'NEXT_TURN'

export interface MailboxDeliveryDecision {
  /** Start a turn when idle, or request work while one is already active. */
  activate: boolean
  /** Inject at a safe point in the active run. */
  steerCurrentTurn: boolean
  /** The durable mailbox phase that owns the input. */
  phase: MailboxDeliveryPhase
}

export function resolveMailboxDelivery(args: {
  authorKind: 'human' | 'agent' | 'unknown'
  activation?: AgentActivation
  targetBusy: boolean
}): MailboxDeliveryDecision {
  // Ordinary peer communication is queue-only. It remains unread even if it
  // lands a millisecond before the current run's final output, so timing never
  // changes its hidden behavior.
  if (args.authorKind === 'agent' && args.activation !== 'trigger') {
    return { activate: false, steerCurrentTurn: false, phase: 'NEXT_TURN' }
  }

  // Human steer and formal handoff/follow-up are allowed to reopen same-work
  // planning, but only through the Runtime's safe-point steering admission.
  if (args.targetBusy) {
    return { activate: true, steerCurrentTurn: true, phase: 'CURRENT_TURN' }
  }

  // No run exists to steer. The durable mailbox input starts exactly one fresh
  // turn through the normal scheduler path.
  return { activate: true, steerCurrentTurn: false, phase: 'NEXT_TURN' }
}
