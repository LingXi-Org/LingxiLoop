import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { Storage } from '../../storage.js'
import { findCompanyUserByAuthEmail, findParticipantByEmail } from './address-repository.js'
import { formatAddress, normalizeMessageId, parseAddress, sanitizeSubject } from './addressing.js'
import type { InboundEmailPayload, PersistEmailMessageInput } from './contracts.js'
import { recordEmailContact } from './conversation-repository.js'
import { findInboundDuplicates, findInboundRecipients } from './inbound-repository.js'

export type InboundDeliveryResult =
  | { kind: 'no_recipient'; attemptedRecipients: string[] }
  | { kind: 'deduplicated'; messageId: string; companyIds: string[] }
  | {
      kind: 'delivered'
      deliveries: Array<{ companyId: string; conversationId: string; messageId: string }>
      deduplicatedCompanyIds: string[]
    }

export class InboundEmailApplicationError extends Error {
  constructor(readonly code: 'invalid' | 'storage_unavailable', message: string) {
    super(message)
  }
}

export type InboundEmailMetricName =
  | 'email.inbound.delivered'
  | 'email.inbound.dedup'
  | 'email.inbound.no_recipient'
  | 'email.inbound.attachment_upload_fail'

export interface InboundEmailInfrastructure {
  storage: Pick<Storage, 'put'>
  findOrCreateConversation(input: {
    companyId: string
    inReplyTo: string | null
    references: string[]
    subject: string
    memberIds: string[]
    idempotencyKey: string
  }): Promise<{ conversationId: string; created: boolean }>
  persistMessage(input: PersistEmailMessageInput): Promise<{ messageId: string; sequence: number }>
  metric(name: InboundEmailMetricName, labels?: Record<string, string | number | boolean>): void
  alert(input: { title: string; detail: string; level: 'warn' }): Promise<void>
}

interface UploadedAttachment {
  filename: string
  mimeType: string
  sizeBytes: number
  storageKey: string | null
  truncated: boolean
}

export class InboundEmailApplication {
  constructor(
    private readonly db: Queryable,
    private readonly infrastructure: InboundEmailInfrastructure,
  ) {}

  async deliver(payload: InboundEmailPayload): Promise<InboundDeliveryResult> {
    const senderAddress = parseAddress(payload.from)
    if (!senderAddress) throw new InboundEmailApplicationError('invalid', `unparseable from: ${payload.from}`)
    const recipients = [...payload.to, ...payload.cc]
      .map((value) => parseAddress(value))
      .filter((value): value is { addr: string; name: string | null } => Boolean(value))
    if (recipients.length === 0) throw new InboundEmailApplicationError('invalid', 'no recipients')
    const body = payload.text.trim()
    if (!body) throw new InboundEmailApplicationError('invalid', 'native inbound payload requires text')
    const smtpMessageId = normalizeMessageId(payload.messageId)
    if (!smtpMessageId) throw new InboundEmailApplicationError('invalid', 'invalid messageId')
    const subject = sanitizeSubject(payload.subject) || '(no subject)'

    const resolved = await findInboundRecipients(
      this.db,
      Array.from(new Set(recipients.map((recipient) => recipient.addr))),
    )
    const byCompany = new Map<string, typeof resolved>()
    for (const recipient of resolved) {
      const companyRecipients = byCompany.get(recipient.companyId) ?? []
      companyRecipients.push(recipient)
      byCompany.set(recipient.companyId, companyRecipients)
    }
    if (byCompany.size === 0) {
      this.infrastructure.metric('email.inbound.no_recipient')
      return { kind: 'no_recipient', attemptedRecipients: recipients.map((recipient) => recipient.addr) }
    }

    const companyIds = [...byCompany.keys()]
    const duplicates = await findInboundDuplicates(this.db, companyIds, smtpMessageId)
    const pendingCompanyIds = companyIds.filter((companyId) => !duplicates.has(companyId))
    if (pendingCompanyIds.length === 0) {
      this.infrastructure.metric('email.inbound.dedup')
      return {
        kind: 'deduplicated',
        messageId: duplicates.values().next().value ?? '',
        companyIds,
      }
    }

    const attachments = await this.uploadAttachments(payload)
    const deliveries: Array<{ companyId: string; conversationId: string; messageId: string }> = []
    for (const companyId of pendingCompanyIds) {
      const companyRecipients = byCompany.get(companyId) ?? []
      const sender = await this.resolveSender(companyId, senderAddress.addr, senderAddress.name)
      const memberIds = Array.from(new Set([
        sender.participantId,
        ...companyRecipients.map((recipient) => recipient.participantId),
      ]))
      const conversation = await this.infrastructure.findOrCreateConversation({
        companyId,
        inReplyTo: payload.inReplyTo ?? null,
        references: payload.references ?? [],
        subject,
        memberIds,
        idempotencyKey: `email/inbound/${companyId}/${smtpMessageId}`,
      })
      try {
        const persisted = await this.infrastructure.persistMessage({
          conversationId: conversation.conversationId,
          companyId,
          authorId: sender.participantId,
          direction: 'in',
          transportStatus: 'received',
          smtpMessageId,
          inReplyTo: payload.inReplyTo ?? null,
          references: payload.references ?? [],
          subject,
          fromAddr: formatAddress(senderAddress.addr, senderAddress.name),
          toAddrs: payload.to,
          ccAddrs: payload.cc,
          body,
          html: payload.html ?? null,
          rawSizeBytes: payload.rawSizeBytes ?? null,
          autoSubmitted: Boolean(payload.autoSubmitted && payload.autoSubmitted.toLowerCase() !== 'no'),
          idempotencyKey: `email/inbound/${companyId}/${smtpMessageId}`,
          attachments,
        })
        deliveries.push({ companyId, conversationId: conversation.conversationId, messageId: persisted.messageId })
      } catch (error) {
        const raced = await findInboundDuplicates(this.db, [companyId], smtpMessageId)
        if (raced.has(companyId)) {
          duplicates.set(companyId, raced.get(companyId) ?? '')
          continue
        }
        throw error
      }
    }

    if (deliveries.length === 0) {
      this.infrastructure.metric('email.inbound.dedup')
      return {
        kind: 'deduplicated',
        messageId: duplicates.values().next().value ?? '',
        companyIds: [...duplicates.keys()],
      }
    }
    this.infrastructure.metric('email.inbound.delivered', {
      auto_submitted: Boolean(payload.autoSubmitted && payload.autoSubmitted.toLowerCase() !== 'no'),
    })
    return {
      kind: 'delivered',
      deliveries,
      deduplicatedCompanyIds: [...duplicates.keys()],
    }
  }

  private async resolveSender(companyId: string, address: string, name: string | null) {
    const participant = await findParticipantByEmail(this.db, companyId, address)
    if (participant) return { participantId: participant.id, displayName: participant.name }
    const user = await findCompanyUserByAuthEmail(this.db, companyId, address)
    if (user) return { participantId: user.id, displayName: user.displayName }
    await recordEmailContact(this.db, { companyId, address, displayName: name })
    return { participantId: `external:${address}`, displayName: name }
  }

  private async uploadAttachments(payload: InboundEmailPayload): Promise<UploadedAttachment[]> {
    const uploaded: UploadedAttachment[] = []
    for (const attachment of payload.attachments) {
      const metadata = {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      }
      if (attachment.truncated) {
        uploaded.push({ ...metadata, storageKey: null, truncated: true })
        continue
      }
      if (!isCanonicalBase64(attachment.contentBase64)) {
        throw new InboundEmailApplicationError('invalid', `invalid attachment body: ${attachment.filename}`)
      }
      const bytes = Buffer.from(attachment.contentBase64, 'base64')
      if (bytes.length !== attachment.sizeBytes) {
        throw new InboundEmailApplicationError('invalid', `attachment size mismatch: ${attachment.filename}`)
      }
      const extension = attachment.filename.includes('.')
        ? attachment.filename.split('.').at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) ?? ''
        : ''
      const key = `email-attachments/${randomUUID()}${extension ? `.${extension}` : ''}`
      try {
        await this.infrastructure.storage.put(
          key,
          bytes,
          attachment.mimeType,
        )
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        this.infrastructure.metric('email.inbound.attachment_upload_fail')
        await this.infrastructure.alert({
          title: 'email inbound: attachment upload failed',
          detail: `filename=${attachment.filename} size=${attachment.sizeBytes} bytes\nerror: ${detail}`,
          level: 'warn',
        }).catch((alertError) => {
          console.warn('[email] attachment failure alert failed', alertError)
        })
        throw new InboundEmailApplicationError('storage_unavailable', `attachment storage unavailable: ${detail}`)
      }
      uploaded.push({ ...metadata, storageKey: key, truncated: false })
    }
    return uploaded
  }
}

function isCanonicalBase64(value: string): boolean {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false
  return Buffer.from(value, 'base64').toString('base64') === value
}
