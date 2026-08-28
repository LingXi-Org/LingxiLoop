import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
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

export async function sendCalendarReminderEmail(args: {
  to: string
  subject: string
  text: string
  html: string
}): Promise<void> {
  assertEmailProviderConfigured()
  if (!env.EMAIL_DOMAIN) throw new Error('EMAIL_DOMAIN is required')
  const result = await sendViaProvider({
    from: formatAddress(`reminders@${env.EMAIL_DOMAIN}`, 'LingxiLoop Calendar'),
    to: [args.to],
    subject: args.subject,
    text: args.text,
    html: args.html,
    messageId: mintMessageId(),
    autoSubmitted: 'auto-generated',
  })
  if (!result.ok) throw new Error(result.error ?? 'calendar reminder email failed')
}
