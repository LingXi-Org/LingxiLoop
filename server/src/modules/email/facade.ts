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
import { inc } from '../../metrics.js'
import { notifyOperationalAlert } from '../../alerting.js'
import { AgentEmailApplication } from './agent-application.js'
import { ResendInboundApplication } from './resend-inbound-application.js'
import {
  retrieveResendInboundEmail,
  verifyResendWebhook,
} from './resend-inbound-infrastructure.js'
import { createResendInboundRouter } from './resend-inbound-router.js'
import type {
  AgentEmailCommandIdentity,
  AgentEmailContact,
  AgentEmailDeliveryResult,
  AgentEmailThread,
  AgentEmailThreadView,
  EmailScope,
  OutboundAttachmentInput,
  InboundEmailPayload,
} from './contracts.js'
import type { ResendWebhookHeaders } from './resend-inbound-application.js'
import type { ResendEmailReceivedEvent } from './contracts.js'

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

export function createResendInboundEmailRouter(dependencies: {
  storage: Pick<Storage, 'put'>
  apiKey?: string
  webhookSecret?: string
  fetcher?: typeof fetch
  verify?: (rawBody: Buffer, headers: ResendWebhookHeaders) => ResendEmailReceivedEvent | { type: string }
  retrieve?: (emailId: string) => Promise<InboundEmailPayload>
}) {
  const deliveryApplication = new InboundEmailApplication(pool, {
    storage: dependencies.storage,
    findOrCreateConversation: (input) => findOrCreateEmailConversation(input),
    persistMessage: (input) => persistEmailMessage(input),
    metric: (name, labels) => inc(name, labels),
    alert: notifyOperationalAlert,
  })
  const application = new ResendInboundApplication({
    verify: dependencies.verify ?? ((rawBody, headers) => verifyResendWebhook(
      rawBody,
      headers,
      dependencies.webhookSecret ?? env.RESEND_WEBHOOK_SECRET,
    )),
    retrieve: dependencies.retrieve ?? ((emailId) => retrieveResendInboundEmail(
      emailId,
      dependencies.apiKey ?? env.RESEND_API_KEY,
      dependencies.fetcher,
    )),
    deliver: (payload) => deliveryApplication.deliver(payload),
    metric: (name) => inc(name),
  })
  return createResendInboundRouter(application)
}

export const resendInboundEmailRouter = createResendInboundEmailRouter({ storage })

export async function sendCalendarReminderEmail(args: {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
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
    idempotencyKey: args.idempotencyKey,
    autoSubmitted: 'auto-generated',
  })
  if (!result.ok) throw new Error(result.error ?? 'calendar reminder email failed')
}
