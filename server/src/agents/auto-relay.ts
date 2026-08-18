/**
 * Assistant-text relay validation. Plain assistant text emitted by the model
 * is not directly visible in Cumora; normally the model should use
 * `cumora reply`. When it explicitly declares that a draft should be relayed,
 * this module validates the declared conversation id against the current
 * inbox. It does not infer routing from inbox shape.
 *
 * Side effects (the actual `cumora reply` shell-out, the recordEvent call,
 * the tool-call counter bump) live in turn.ts where they have access to the
 * runtime client.
 */

export interface AutoRelayInboxRow {
  conversation_id: string
  conversation_kind: string | null
  company_id?: string | null
  body?: string | null
}

export interface AutoRelayTarget {
  conversationId: string
  companyId: string | null
  /** Short, structured reason — fed straight into the agent_events row. */
  reason: string
}

export interface DeclaredAutoRelayDirective {
  action: 'none' | 'reply' | 'drop'
  conversationId: string | null
  reason?: string
}

/** Validate a model-declared relay target. The only semantic decision here
 *  is the model's explicit directive; the runtime just checks that the target
 *  is one of the conversations that woke this turn. */
export function resolveDeclaredAutoRelayTarget(
  inbox: readonly AutoRelayInboxRow[],
  directive: DeclaredAutoRelayDirective,
): AutoRelayTarget | null {
  if (directive.action !== 'reply' || !directive.conversationId) return null
  const target = inbox.find((m) => m.conversation_id === directive.conversationId)
  if (!target) return null
  return {
    conversationId: target.conversation_id,
    companyId: target.company_id ?? null,
    reason: directive.reason || 'model declared assistant text should be relayed to this conversation',
  }
}
