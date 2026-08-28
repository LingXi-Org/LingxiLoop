export {
  createInboundEmailRouter,
  emailApplication,
  inboundEmailRouter,
  sendCalendarReminderEmail,
} from './facade.js'
export { EmailApplicationError } from './application.js'
export type { EmailHtmlPayload, EmailScope, EmailSendPayload } from './contracts.js'
export {
  computeAgentAddress,
  formatAddress,
  mintMessageId,
  normalizeMessageId,
  parseAddress,
  sanitizeEmailHtml,
  sanitizeSubject,
  splitReplyAddresses,
} from './addressing.js'
export {
  __setEmailProviderOverrideForTesting,
  assertEmailProviderConfigured,
  sendViaProvider,
} from './provider.js'
export type { ProviderSendResult, SendArgs } from './provider.js'
export {
  backfillCompanyAgentAddresses,
  ensureParticipantAddress,
  findEmailConversationByMessageIds,
  findOrCreateEmailConversation,
  findParticipantByAddress,
  findUserInCompanyByAuthEmail,
  persistEmailMessage,
  recordExternalContact,
  replyInEmailConversation,
} from './runtime.js'
