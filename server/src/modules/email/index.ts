// Transactional invitation email only; never exposed to Agent tools.
export { formatAddress, mintMessageId } from './addressing.js'
export { __setEmailProviderOverrideForTesting, assertEmailProviderConfigured, sendViaProvider } from './provider.js'
export type { ProviderSendResult, SendArgs } from './provider.js'
