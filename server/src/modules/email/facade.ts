import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
import {
  formatAddress,
  mintMessageId,
  normalizeMessageId,
  parseAddress,
  sanitizeEmailHtml,
  sanitizeSubject,
  splitReplyAddresses,
} from './addressing.js'
import { assertEmailProviderConfigured, sendViaProvider } from './provider.js'
import {
  completeOutboundEmail,
  ensureParticipantAddress,
  findOrCreateEmailConversation,
  persistEmailMessage,
} from './runtime.js'
import { storage } from '../../storage.js'
import type { Storage } from '../../storage.js'
import { EmailApplication } from './application.js'
import { InboundEmailApplication } from './inbound-application.js'
import { createInboundEmailHttpRouter } from './inbound-router.js'
import { inc } from '../../metrics.js'
import { alertDiscord } from '../../alert.js'

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
  completeDelivery: completeOutboundEmail,
  findOrCreateConversation: (args) => findOrCreateEmailConversation(args),
  persist: (args) => persistEmailMessage(args),
})

export function createInboundEmailRouter(dependencies: { storage: Pick<Storage, 'put'> }) {
  const application = new InboundEmailApplication(pool, {
    storage: dependencies.storage,
    findOrCreateConversation: (input) => findOrCreateEmailConversation(input),
    persistMessage: (input) => persistEmailMessage(input),
    metric: (name, labels) => inc(name, labels),
    alert: async (input) => { await alertDiscord(input) },
  })
  return createInboundEmailHttpRouter({
    application,
    secret: env.EMAIL_INBOUND_HMAC_SECRET,
    metric: (name) => inc(name),
  })
}

export const inboundEmailRouter = createInboundEmailRouter({ storage })

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
