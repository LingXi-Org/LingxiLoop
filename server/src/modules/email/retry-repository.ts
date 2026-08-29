import type { Queryable } from '../../db/queryable.js'
import type { EmailRetryAttachment, EmailRetryCandidate } from './contracts.js'

interface RetryCandidateRow {
  message_id: string
  conversation_id: string
  company_id: string
  smtp_message_id: string | null
  in_reply_to: string | null
  references_chain: string[]
  subject: string
  from_addr: string
  to_addrs: string[]
  cc_addrs: string[]
  body: string
  auto_submitted: boolean
  retry_attempts: number
}

export async function claimDueEmailRetries(
  db: Queryable,
  limit: number,
): Promise<EmailRetryCandidate[]> {
  const { rows } = await db.query<RetryCandidateRow>(
    `SELECT email.message_id, email.conversation_id, email.company_id,
            email.smtp_message_id, email.in_reply_to, email.references_chain,
            email.subject, email.from_addr, email.to_addrs, email.cc_addrs,
            email.body, email.auto_submitted, email.retry_attempts
       FROM email_messages email
      WHERE email.direction = 'out'
        AND email.transport_status = 'failed'
        AND email.next_retry_at IS NOT NULL
        AND email.next_retry_at <= NOW()
      ORDER BY email.next_retry_at ASC
      LIMIT $1
      FOR UPDATE OF email SKIP LOCKED`,
    [limit],
  )

  if (rows.length > 0) {
    await db.query(
      `UPDATE email_messages email
          SET next_retry_at = NOW() + INTERVAL '5 minutes'
         FROM unnest($1::text[], $2::text[]) AS claimed(company_id, message_id)
        WHERE email.company_id = claimed.company_id
          AND email.message_id = claimed.message_id`,
      [rows.map((row) => row.company_id), rows.map((row) => row.message_id)],
    )
  }

  return rows.map((row) => ({
    messageId: row.message_id,
    conversationId: row.conversation_id,
    companyId: row.company_id,
    smtpMessageId: row.smtp_message_id,
    inReplyTo: row.in_reply_to,
    references: row.references_chain,
    subject: row.subject,
    fromAddress: row.from_addr,
    toAddresses: row.to_addrs,
    ccAddresses: row.cc_addrs,
    body: row.body,
    autoSubmitted: row.auto_submitted,
    retryAttempts: row.retry_attempts,
  }))
}

export async function findEmailRetryAttachments(
  db: Queryable,
  companyId: string,
  messageId: string,
): Promise<EmailRetryAttachment[]> {
  const { rows } = await db.query<{
    filename: string
    mime_type: string
    size_bytes: number
    storage_key: string | null
    truncated: boolean
  }>(
    `SELECT filename, mime_type, size_bytes, storage_key, truncated
       FROM email_attachments
      WHERE company_id = $1 AND message_id = $2
      ORDER BY created_at`,
    [companyId, messageId],
  )
  return rows.map((row) => ({
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    storageKey: row.storage_key,
    truncated: row.truncated,
  }))
}

export async function markEmailRetrySent(
  db: Queryable,
  input: {
    companyId: string
    messageId: string
    smtpMessageId: string | null
    retryAttempts: number
  },
): Promise<void> {
  await db.query(
    `UPDATE email_messages
        SET transport_status = 'sent', transport_error = NULL,
            smtp_message_id = COALESCE($3, smtp_message_id),
            retry_attempts = $4, next_retry_at = NULL
      WHERE company_id = $1 AND message_id = $2`,
    [input.companyId, input.messageId, input.smtpMessageId, input.retryAttempts],
  )
}

export async function markEmailRetryFailed(
  db: Queryable,
  input: {
    companyId: string
    messageId: string
    error: string | null
    retryAttempts: number
    nextRetryAt: Date | null
  },
): Promise<void> {
  await db.query(
    `UPDATE email_messages
        SET transport_error = $3, retry_attempts = $4, next_retry_at = $5
      WHERE company_id = $1 AND message_id = $2`,
    [input.companyId, input.messageId, input.error, input.retryAttempts, input.nextRetryAt],
  )
}
