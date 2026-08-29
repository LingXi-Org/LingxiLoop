import type { EmailRetryAttachment, EmailRetryCandidate } from './contracts.js'
import type { ProviderSendResult, SendArgs } from './provider.js'

const BACKOFF_STEPS_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  6 * 60 * 60_000,
  24 * 60 * 60_000,
]

export function nextEmailRetryAt(attemptsAfterThis: number, nowMs = Date.now()): Date | null {
  if (attemptsAfterThis >= BACKOFF_STEPS_MS.length) return null
  return new Date(nowMs + BACKOFF_STEPS_MS[attemptsAfterThis])
}

interface RetryApplicationDependencies {
  claim(limit: number): Promise<EmailRetryCandidate[]>
  findAttachments(companyId: string, messageId: string): Promise<EmailRetryAttachment[]>
  resolveAttachment(storageKey: string): Promise<string>
  normalizeFromAddress(value: string): string
  normalizeMessageId(value: string | null): string | null
  send(args: SendArgs): Promise<ProviderSendResult>
  markSent(input: {
    companyId: string
    messageId: string
    smtpMessageId: string | null
    retryAttempts: number
  }): Promise<void>
  markFailed(input: {
    companyId: string
    messageId: string
    error: string | null
    retryAttempts: number
    nextRetryAt: Date | null
  }): Promise<void>
  metric(name: 'email.retry.ok' | 'email.retry.fail' | 'email.retry.terminal'): void
  terminalAlert(candidate: EmailRetryCandidate, error: string | null): Promise<void>
  unexpected(candidate: EmailRetryCandidate, error: unknown): void
  now(): number
}

export class EmailRetryApplication {
  constructor(private readonly dependencies: RetryApplicationDependencies) {}

  async run(maxBatch = 16): Promise<{ attempted: number }> {
    const due = await this.dependencies.claim(maxBatch)
    for (const candidate of due) {
      try {
        await this.retry(candidate)
      } catch (error) {
        this.dependencies.metric('email.retry.fail')
        this.dependencies.unexpected(candidate, error)
      }
    }
    return { attempted: due.length }
  }

  private async retry(candidate: EmailRetryCandidate): Promise<void> {
    const attachments = await this.dependencies.findAttachments(candidate.companyId, candidate.messageId)
    const providerAttachments: NonNullable<SendArgs['attachments']> = []
    for (const attachment of attachments) {
      if (attachment.truncated || !attachment.storageKey) continue
      const path = await this.dependencies.resolveAttachment(attachment.storageKey)
      providerAttachments.push({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        path,
      })
    }

    const result = await this.dependencies.send({
      from: this.dependencies.normalizeFromAddress(candidate.fromAddress),
      to: candidate.toAddresses.filter(Boolean),
      cc: candidate.ccAddresses.filter(Boolean),
      subject: candidate.subject,
      text: candidate.body,
      inReplyTo: candidate.inReplyTo,
      references: candidate.references,
      messageId: candidate.smtpMessageId,
      idempotencyKey: `email-retry/${candidate.companyId}/${candidate.messageId}`,
      autoSubmitted: candidate.autoSubmitted ? 'auto-generated' : undefined,
      attachments: providerAttachments,
    })

    const retryAttempts = candidate.retryAttempts + 1
    if (result.ok) {
      await this.dependencies.markSent({
        companyId: candidate.companyId,
        messageId: candidate.messageId,
        smtpMessageId: this.dependencies.normalizeMessageId(result.smtpMessageId),
        retryAttempts,
      })
      this.dependencies.metric('email.retry.ok')
      return
    }

    const nextRetryAt = nextEmailRetryAt(retryAttempts, this.dependencies.now())
    await this.dependencies.markFailed({
      companyId: candidate.companyId,
      messageId: candidate.messageId,
      error: result.error,
      retryAttempts,
      nextRetryAt,
    })
    if (nextRetryAt) {
      this.dependencies.metric('email.retry.fail')
      return
    }

    this.dependencies.metric('email.retry.terminal')
    await this.dependencies.terminalAlert(candidate, result.error)
  }
}
