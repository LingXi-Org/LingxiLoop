import { pool } from '../../db/pool.js'
import {
  assertEmailProviderConfigured,
  ensureParticipantAddress,
  findOrCreateEmailConversation,
  formatAddress,
  mintMessageId,
  normalizeMessageId,
  parseAddress,
  persistEmailMessage,
  sanitizeEmailHtml,
  sanitizeSubject,
  sendViaProvider,
  splitReplyAddresses,
} from '../../email.js'
import { storage } from '../../storage.js'
import { EmailApplication } from './application.js'

export const emailApplication = new EmailApplication(pool, {
  assertAvailable: assertEmailProviderConfigured,
  publicUrl: (key) => storage.publicUrl(key),
  parseAddress,
  formatAddress,
  sanitizeSubject,
  sanitizeHtml: sanitizeEmailHtml,
  ensureAddress: async (userId, companyId) => ensureParticipantAddress(userId, companyId),
  mintMessageId,
  normalizeMessageId,
  splitReplyAddresses,
  send: (args) => sendViaProvider(args),
  findOrCreateConversation: (args) => findOrCreateEmailConversation(args),
  persist: (args) => persistEmailMessage(args),
})
