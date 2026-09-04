import type { SubscriptionStatus } from '../../domain/subscription/public.js'

/** External billing boundary. Runtime implementations are added only after a provider is selected. */
export interface BillingProvider {
  createSubscription(input: { accountReference: string; planCode: string }): Promise<{ providerSubscriptionId: string; status: SubscriptionStatus }>
  cancelSubscription(providerSubscriptionId: string): Promise<void>
}
