import type { InboundEmailPayload, ResendEmailReceivedEvent } from './contracts.js'
import type { InboundDeliveryResult } from './inbound-application.js'

export class ResendInboundApplicationError extends Error {
  constructor(readonly code: 'unavailable' | 'invalid_signature' | 'invalid_event', message: string) {
    super(message)
  }
}

export interface ResendWebhookHeaders {
  id: string
  timestamp: string
  signature: string
}

export interface ResendInboundInfrastructure {
  verify(rawBody: Buffer, headers: ResendWebhookHeaders): ResendEmailReceivedEvent | { type: string }
  retrieve(emailId: string): Promise<InboundEmailPayload>
  deliver(payload: InboundEmailPayload): Promise<InboundDeliveryResult>
  metric(name: 'email.inbound.bad_signature'): void
}

export type ResendInboundResult =
  | { kind: 'ignored'; eventType: string }
  | { kind: 'processed'; delivery: InboundDeliveryResult }

export class ResendInboundApplication {
  constructor(private readonly infrastructure: ResendInboundInfrastructure) {}

  async handle(rawBody: Buffer, headers: ResendWebhookHeaders): Promise<ResendInboundResult> {
    let event: ResendEmailReceivedEvent | { type: string }
    try {
      event = this.infrastructure.verify(rawBody, headers)
    } catch (error) {
      this.infrastructure.metric('email.inbound.bad_signature')
      throw new ResendInboundApplicationError(
        'invalid_signature',
        error instanceof Error ? error.message : 'invalid Resend webhook signature',
      )
    }
    if (event.type !== 'email.received') return { kind: 'ignored', eventType: event.type }
    if (!('data' in event) || typeof event.data !== 'object' || !event.data || !('email_id' in event.data)) {
      throw new ResendInboundApplicationError('invalid_event', 'Resend email.received event is missing email_id')
    }
    try {
      const payload = await this.infrastructure.retrieve(String(event.data.email_id))
      return { kind: 'processed', delivery: await this.infrastructure.deliver(payload) }
    } catch (error) {
      if (error instanceof ResendInboundApplicationError) throw error
      throw new ResendInboundApplicationError(
        'unavailable',
        error instanceof Error ? error.message : 'Resend inbound retrieval failed',
      )
    }
  }
}
