export const ATTENTION_STATUSES = [
  'OPEN', 'ACKNOWLEDGED', 'DEFERRED', 'RESOLVED', 'DISMISSED',
] as const

export type AttentionStatus = typeof ATTENTION_STATUSES[number]
export type AttentionCommand = 'ACKNOWLEDGE' | 'DEFER' | 'RESOLVE' | 'DISMISS'

export type AttentionTransition =
  | { outcome: 'APPLIED'; status: AttentionStatus }
  | { outcome: 'ALREADY_APPLIED'; status: AttentionStatus }
  | { outcome: 'INVALID'; status: AttentionStatus }

export function transitionAttention(status: AttentionStatus, command: AttentionCommand): AttentionTransition {
  if (status === 'RESOLVED' || status === 'DISMISSED') {
    const repeated = (status === 'RESOLVED' && command === 'RESOLVE')
      || (status === 'DISMISSED' && command === 'DISMISS')
    return { outcome: repeated ? 'ALREADY_APPLIED' : 'INVALID', status }
  }
  const target = {
    ACKNOWLEDGE: 'ACKNOWLEDGED',
    DEFER: 'DEFERRED',
    RESOLVE: 'RESOLVED',
    DISMISS: 'DISMISSED',
  }[command] as AttentionStatus
  return { outcome: status === target ? 'ALREADY_APPLIED' : 'APPLIED', status: target }
}
