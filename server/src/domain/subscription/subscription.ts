export const SUBSCRIPTION_STATUSES = ['PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] as const
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number]
export type SubscriptionCommand = 'ACTIVATE' | 'MARK_PAST_DUE' | 'RENEW' | 'CANCEL' | 'EXPIRE'

const TRANSITIONS: Record<SubscriptionStatus, Partial<Record<SubscriptionCommand, SubscriptionStatus>>> = {
  PENDING: { ACTIVATE: 'ACTIVE', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' },
  ACTIVE: { ACTIVATE: 'ACTIVE', RENEW: 'ACTIVE', MARK_PAST_DUE: 'PAST_DUE', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' },
  PAST_DUE: { MARK_PAST_DUE: 'PAST_DUE', RENEW: 'ACTIVE', CANCEL: 'CANCELLED', EXPIRE: 'EXPIRED' },
  CANCELLED: { CANCEL: 'CANCELLED' },
  EXPIRED: { EXPIRE: 'EXPIRED' },
}

export function transitionSubscription(status: SubscriptionStatus, command: SubscriptionCommand): SubscriptionStatus {
  const next = TRANSITIONS[status][command]
  if (!next) throw new Error(`Cannot ${command} subscription from ${status}`)
  return next
}
