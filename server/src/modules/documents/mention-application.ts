import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type {
  DocumentMentionDelivery,
  DocumentMentionEvent,
  DocumentMentionRecipient,
} from './contracts.js'
import {
  claimDocumentMentionDelivery,
  completeDocumentMentionDelivery,
  failDocumentMentionDelivery,
  findDocumentMentionContext,
  insertDocumentMentionDelivery,
  listMentionableDocumentParticipants,
  recordFreshDocumentMention,
} from './mention-repository.js'

const DELIVERY_LEASE_MS = 60_000
const MAX_DELIVERY_ATTEMPTS = 8

export interface DocumentMentionInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  publish(event: DocumentMentionEvent): Promise<void>
  wakeAgent(args: {
    deliveryId: string
    companyId: string
    projectId: string
    mentionerId: string
    agentId: string
    documentId: string
    documentTitle: string
  }): Promise<void>
  metric(name: string, labels?: Record<string, string>, value?: number): void
}

function entityId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`
}

export class DocumentMentionApplication {
  constructor(private readonly infrastructure: DocumentMentionInfrastructure) {}

  async notify(args: {
    documentId: string
    companyId: string
    mentionerId: string
    requestedIds: string[]
  }): Promise<{ deliveryId: string | null; mentionedIds: string[] }> {
    const requestedIds = [...new Set(args.requestedIds.filter((id) => id && id !== args.mentionerId))]
    if (requestedIds.length === 0) return { deliveryId: null, mentionedIds: [] }
    return this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: args.mentionerId,
        action: 'document:write',
        companyId: args.companyId,
        resource: { type: 'document', id: args.documentId },
      })
      const context = await findDocumentMentionContext(db, args)
      if (!context) return { deliveryId: null, mentionedIds: [] }
      const candidates = await listMentionableDocumentParticipants(db, {
        documentId: args.documentId,
        companyId: args.companyId,
        participantIds: requestedIds,
      })
      const fresh: DocumentMentionRecipient[] = []
      for (const recipient of candidates) {
        const inserted = await recordFreshDocumentMention(db, {
          mentionId: entityId('dm'),
          logId: entityId('log'),
          documentId: args.documentId,
          companyId: args.companyId,
          mentionerId: args.mentionerId,
          mentionerName: context.mentionerName,
          documentTitle: context.documentTitle,
          recipient,
        })
        if (inserted) fresh.push(recipient)
      }
      if (fresh.length === 0) return { deliveryId: null, mentionedIds: [] }
      const deliveryId = entityId('dmd')
      await insertDocumentMentionDelivery(db, {
        id: deliveryId,
        companyId: args.companyId,
        documentId: args.documentId,
        projectId: context.projectId,
        mentionerId: args.mentionerId,
        mentionerName: context.mentionerName,
        documentTitle: context.documentTitle,
        recipients: fresh,
      })
      return { deliveryId, mentionedIds: fresh.map((recipient) => recipient.id) }
    })
  }

  async deliverOnce(workerId: string): Promise<boolean> {
    const delivery = await this.infrastructure.transaction((db) => (
      claimDocumentMentionDelivery(db, workerId, DELIVERY_LEASE_MS)
    ))
    if (!delivery) return false
    const startedAt = Date.now()
    try {
      await this.deliver(delivery)
      const completed = await this.infrastructure.transaction((db) => completeDocumentMentionDelivery(db, delivery))
      this.infrastructure.metric('documents.mention.delivery', { status: completed ? 'completed' : 'lost_lease' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const final = delivery.attempts >= MAX_DELIVERY_ATTEMPTS
      const retryDelayMs = Math.min(60_000, 1_000 * (2 ** Math.max(0, delivery.attempts - 1)))
      const failed = await this.infrastructure.transaction((db) => failDocumentMentionDelivery(db, {
        delivery,
        error: message,
        final,
        retryDelayMs,
      }))
      this.infrastructure.metric('documents.mention.delivery', {
        status: failed ? (final ? 'failed' : 'retry') : 'lost_lease',
      })
      if (final && failed) console.error(`[documents] mention delivery ${delivery.id} failed permanently: ${message}`)
    } finally {
      this.infrastructure.metric('documents.mention.delivery_ms', undefined, Date.now() - startedAt)
    }
    return true
  }

  private async deliver(delivery: DocumentMentionDelivery): Promise<void> {
    const event: DocumentMentionEvent = {
      type: 'doc.mention',
      deliveryId: delivery.id,
      companyId: delivery.companyId,
      documentId: delivery.documentId,
      documentTitle: delivery.documentTitle,
      mentionerId: delivery.mentionerId,
      mentionerName: delivery.mentionerName,
      mentionedIds: delivery.recipients.map((recipient) => recipient.id),
      workspaceId: delivery.projectId,
    }
    await this.infrastructure.publish(event)
    for (const recipient of delivery.recipients) {
      if (recipient.kind !== 'agent') continue
      await this.infrastructure.wakeAgent({
        deliveryId: delivery.id,
        companyId: delivery.companyId,
        projectId: delivery.projectId,
        mentionerId: delivery.mentionerId,
        agentId: recipient.id,
        documentId: delivery.documentId,
        documentTitle: delivery.documentTitle,
      })
    }
  }
}
