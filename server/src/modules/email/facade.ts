import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
import {
  computeAgentAddress,
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
import { AgentEmailApplication } from './agent-application.js'
import type {
  AgentEmailCommandIdentity,
  AgentEmailContact,
  AgentEmailDeliveryResult,
  AgentEmailThread,
  AgentEmailThreadView,
  EmailScope,
  OutboundAttachmentInput,
} from './contracts.js'

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

const agentEmailApplication = new AgentEmailApplication(pool, emailApplication, {
  addressingConfigured: () => Boolean(env.EMAIL_DOMAIN),
  computeAgentAddress,
  ensureAddress: async (userId, companyId) => ensureParticipantAddress(userId, companyId),
})

export function isAgentEmailAddressingConfigured(): boolean {
  return agentEmailApplication.isAddressingConfigured()
}

export function getAgentEmailIdentity(scope: EmailScope): Promise<{
  email: string
  displayName: string
} | null> {
  return agentEmailApplication.whoami(scope)
}

export function listAgentEmailContacts(scope: EmailScope, query: string): Promise<AgentEmailContact[]> {
  return agentEmailApplication.contacts(scope, query)
}

export function listAgentEmailInbox(
  scope: EmailScope,
  input: { unreadOnly: boolean; limit: number },
): Promise<AgentEmailThread[]> {
  return agentEmailApplication.inbox(scope, input)
}

export function getAgentEmailThread(
  scope: EmailScope,
  conversationId: string,
  limit: number,
): Promise<AgentEmailThreadView> {
  return agentEmailApplication.thread(scope, conversationId, limit)
}

export function sendAgentEmail(
  scope: EmailScope,
  input: {
    to: string[]
    cc: string[]
    subject: string
    body: string
    attachments: OutboundAttachmentInput[]
  },
  identity: AgentEmailCommandIdentity,
): Promise<AgentEmailDeliveryResult> {
  return agentEmailApplication.send(scope, input, identity)
}

export function replyToAgentEmail(
  scope: EmailScope,
  messageId: string,
  input: { body: string; cc: string[]; attachments: OutboundAttachmentInput[] },
  identity: AgentEmailCommandIdentity,
): Promise<AgentEmailDeliveryResult> {
  return agentEmailApplication.reply(scope, messageId, input, identity)
}

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
