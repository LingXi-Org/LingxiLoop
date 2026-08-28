import type { Queryable } from '../../db/queryable.js'
import type { ProviderSendResult, SendArgs } from '../../email.js'
import type {
  EmailHtmlPayload,
  EmailScope,
  EmailSendPayload,
  OutboundAttachmentInput,
  ReplyEmailInput,
  SendEmailInput,
} from './contracts.js'
import {
  findCompletedOutboundByKey,
  findEmailHtml,
  findEmailParticipant,
  findEmailReplyTarget,
  findTenantMemberIdsByAddresses,
  findUserEmail,
  markEmailConversationRead,
} from './repository.js'

type Address = { addr: string; name: string | null }
type Sender = { email: string; displayName: string }
type ResolvedAttachment = OutboundAttachmentInput & { publicUrl: string }

export type EmailErrorCode =
  | 'message_not_found'
  | 'thread_forbidden'
  | 'address_unavailable'
  | 'recipient_unresolved'
  | 'reply_recipient_missing'

export class EmailApplicationError extends Error {
  constructor(readonly code: EmailErrorCode, message: string) {
    super(message)
  }
}

export interface EmailInfrastructure {
  assertAvailable(): void
  publicUrl(key: string): Promise<string>
  parseAddress(raw: string): Address | null
  formatAddress(address: string, name: string | null): string
  sanitizeSubject(raw: string): string
  sanitizeHtml(raw: string): string
  ensureAddress(userId: string, companyId: string): Promise<Sender | null>
  mintMessageId(): string
  normalizeMessageId(raw: string | null | undefined): string | null
  splitReplyAddresses(args: {
    originalFrom: string
    originalTo: string[]
    originalCc: string[]
    selfAddresses: string[]
  }): { to: string[]; cc: string[] }
  send(args: SendArgs): Promise<ProviderSendResult>
  completeDelivery(messageId: string, result: ProviderSendResult, fallbackSmtpMessageId: string): Promise<void>
  findOrCreateConversation(args: {
    companyId: string
    inReplyTo: string | null
    references: string[]
    subject: string
    memberIds: string[]
    idempotencyKey?: string
  }): Promise<{ conversationId: string }>
  persist(args: {
    conversationId: string
    companyId: string
    authorId: string
    direction: 'out'
    transportStatus: 'queued' | 'sent' | 'failed'
    transportError?: string | null
    smtpMessageId: string | null
    inReplyTo: string | null
    references: string[]
    subject: string
    fromAddr: string
    toAddrs: string[]
    ccAddrs: string[]
    body: string
    attachments: Array<{
      filename: string
      mimeType: string
      sizeBytes: number
      storageKey: string
    }>
    idempotencyKey?: string
  }): Promise<{ messageId: string }>
}

export class EmailApplication {
  constructor(
    private readonly db: Queryable,
    private readonly infrastructure: EmailInfrastructure,
  ) {}

  async send(scope: EmailScope, input: SendEmailInput): Promise<EmailSendPayload> {
    this.infrastructure.assertAvailable()
    const replay = await findCompletedOutboundByKey(this.db, scope.companyId, input.idempotencyKey)
    if (replay) return {
      messageId: replay.messageId, conversationId: replay.conversationId,
      transportStatus: replay.transportStatus, ...(replay.error ? { error: replay.error } : {}),
    }
    const subject = this.infrastructure.sanitizeSubject(input.subject)
    if (!subject) throw new EmailApplicationError('recipient_unresolved', 'subject required')
    const attachments = await this.resolveAttachments(input.attachments)
    const sender = await this.requireSender(scope)
    const to = await this.resolveRecipients(scope.companyId, input.to, 'recipient')
    const cc = await this.resolveRecipients(scope.companyId, input.cc, 'cc')
    const memberIds = new Set<string>([scope.userId])
    for (const id of await findTenantMemberIdsByAddresses(
      this.db,
      scope.companyId,
      [...to, ...cc].map((address) => address.addr),
    )) memberIds.add(id)

    const messageId = this.infrastructure.mintMessageId()
    const conversation = await this.infrastructure.findOrCreateConversation({
      companyId: scope.companyId,
      inReplyTo: null,
      references: [],
      subject,
      memberIds: [...memberIds],
      idempotencyKey: input.idempotencyKey,
    })
    const from = this.infrastructure.formatAddress(sender.email, sender.displayName)
    const persisted = await this.infrastructure.persist({
      conversationId: conversation.conversationId,
      companyId: scope.companyId,
      authorId: scope.userId,
      direction: 'out',
      transportStatus: 'queued',
      smtpMessageId: messageId,
      inReplyTo: null,
      references: [],
      subject,
      fromAddr: from,
      toAddrs: to.map((address) => this.infrastructure.formatAddress(address.addr, address.name)),
      ccAddrs: cc.map((address) => this.infrastructure.formatAddress(address.addr, address.name)),
      body: input.body,
      attachments: this.persistedAttachments(attachments),
      idempotencyKey: input.idempotencyKey,
    })
    const result = await this.infrastructure.send({
      from,
      to: to.map((address) => this.infrastructure.formatAddress(address.addr, address.name)),
      cc: cc.length
        ? cc.map((address) => this.infrastructure.formatAddress(address.addr, address.name))
        : undefined,
      subject,
      text: input.body,
      messageId,
      idempotencyKey: input.idempotencyKey,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        path: attachment.publicUrl,
      })),
    })
    await this.infrastructure.completeDelivery(persisted.messageId, result, messageId)
    return this.sendPayload(persisted.messageId, conversation.conversationId, result)
  }

  async html(scope: EmailScope, messageId: string): Promise<EmailHtmlPayload> {
    const row = await findEmailHtml(this.db, scope.companyId, messageId)
    if (!row) throw new EmailApplicationError('message_not_found', 'unknown email message')
    if (!row.members?.includes(scope.userId)) {
      throw new EmailApplicationError('thread_forbidden', 'not a member of this thread')
    }
    return row.html ? { kind: 'html', html: this.infrastructure.sanitizeHtml(row.html) } : { kind: 'empty' }
  }

  async reply(scope: EmailScope, targetId: string, input: ReplyEmailInput): Promise<EmailSendPayload> {
    this.infrastructure.assertAvailable()
    const replay = await findCompletedOutboundByKey(this.db, scope.companyId, input.idempotencyKey)
    if (replay) return {
      messageId: replay.messageId, conversationId: replay.conversationId,
      transportStatus: replay.transportStatus, ...(replay.error ? { error: replay.error } : {}),
    }
    const target = await findEmailReplyTarget(this.db, scope.companyId, targetId)
    if (!target) throw new EmailApplicationError('message_not_found', 'unknown email message')
    if (!target.members?.includes(scope.userId)) {
      throw new EmailApplicationError('thread_forbidden', 'not a member of this thread')
    }
    const attachments = await this.resolveAttachments(input.attachments)
    const sender = await this.requireSender(scope)
    const authEmail = await findUserEmail(this.db, scope.userId)
    const selfAddresses = [sender.email.toLowerCase(), ...(authEmail ? [authEmail.toLowerCase()] : [])]
    const addresses = this.infrastructure.splitReplyAddresses({
      originalFrom: target.from_addr,
      originalTo: target.to_addrs ?? [],
      originalCc: target.cc_addrs ?? [],
      selfAddresses,
    })
    if (addresses.to.length === 0) {
      throw new EmailApplicationError('reply_recipient_missing', 'no other recipients to reply to')
    }
    const extraCc = await this.resolveRecipients(scope.companyId, input.cc, 'cc')
    const combinedCc = this.mergeCc(addresses.to, addresses.cc, selfAddresses, extraCc)
    const subject = /^(re|fwd|fw)\s*:/i.test(target.subject)
      ? this.infrastructure.sanitizeSubject(target.subject)
      : this.infrastructure.sanitizeSubject(`Re: ${target.subject}`)
    const references = [...(target.references_chain ?? []), ...(target.smtp_message_id ? [target.smtp_message_id] : [])]
      .filter(Boolean)
    const inReplyTo = this.infrastructure.normalizeMessageId(target.smtp_message_id)
    const messageId = this.infrastructure.mintMessageId()
    const from = this.infrastructure.formatAddress(sender.email, sender.displayName)
    const persisted = await this.infrastructure.persist({
      conversationId: target.conversation_id,
      companyId: scope.companyId,
      authorId: scope.userId,
      direction: 'out',
      transportStatus: 'queued',
      smtpMessageId: messageId,
      inReplyTo,
      references,
      subject,
      fromAddr: from,
      toAddrs: addresses.to,
      ccAddrs: combinedCc,
      body: input.body,
      attachments: this.persistedAttachments(attachments),
      idempotencyKey: input.idempotencyKey,
    })
    const result = await this.infrastructure.send({
      from,
      to: addresses.to,
      cc: combinedCc.length ? combinedCc : undefined,
      subject,
      text: input.body,
      inReplyTo: inReplyTo ?? undefined,
      references,
      messageId,
      idempotencyKey: input.idempotencyKey,
      attachments: attachments.map((attachment) => ({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        path: attachment.publicUrl,
      })),
    })
    await this.infrastructure.completeDelivery(persisted.messageId, result, messageId)
    await markEmailConversationRead(this.db, scope.companyId, scope.userId, target.conversation_id)
    return this.sendPayload(persisted.messageId, target.conversation_id, result)
  }

  private async requireSender(scope: EmailScope): Promise<Sender> {
    const sender = await this.infrastructure.ensureAddress(scope.userId, scope.companyId)
    if (!sender) {
      throw new EmailApplicationError(
        'address_unavailable',
        'no email address available for your account in this workspace',
      )
    }
    return sender
  }

  private async resolveRecipients(companyId: string, inputs: string[], label: string): Promise<Address[]> {
    const resolved: Address[] = []
    for (const raw of inputs) {
      if (raw.startsWith('external:')) {
        throw new EmailApplicationError('recipient_unresolved', `unresolved ${label}: ${raw}`)
      }
      const direct = this.infrastructure.parseAddress(raw)
      if (direct) {
        resolved.push(direct)
        continue
      }
      const participant = await findEmailParticipant(this.db, companyId, raw)
      const address = participant?.kind === 'agent'
        ? participant.participant_email
        : participant?.user_email
      if (!participant || !address) {
        throw new EmailApplicationError('recipient_unresolved', `unresolved ${label}: ${raw}`)
      }
      resolved.push({ addr: address.toLowerCase(), name: participant.name })
    }
    return resolved
  }

  private async resolveAttachments(inputs: OutboundAttachmentInput[]): Promise<ResolvedAttachment[]> {
    return Promise.all(inputs.map(async (attachment) => ({
      ...attachment,
      publicUrl: await this.infrastructure.publicUrl(attachment.key),
    })))
  }

  private persistedAttachments(attachments: ResolvedAttachment[]) {
    return attachments.map((attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      storageKey: attachment.key,
    }))
  }

  private mergeCc(to: string[], originalCc: string[], self: string[], extra: Address[]): string[] {
    const addressOf = (value: string) => (/<([^>]+)>/.exec(value)?.[1] ?? value).toLowerCase()
    const seen = new Set([...self, ...to.map(addressOf), ...originalCc.map(addressOf)])
    const combined = [...originalCc]
    for (const address of extra) {
      if (seen.has(address.addr)) continue
      seen.add(address.addr)
      combined.push(this.infrastructure.formatAddress(address.addr, address.name))
    }
    return combined
  }

  private sendPayload(messageId: string, conversationId: string, result: ProviderSendResult): EmailSendPayload {
    return {
      messageId,
      conversationId,
      transportStatus: result.ok ? 'sent' : 'failed',
      ...(result.error ? { error: result.error } : {}),
    }
  }
}
