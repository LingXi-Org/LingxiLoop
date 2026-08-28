import type { Queryable } from '../../db/queryable.js'
import type { PersistEmailMessageInput, PersistedEmailAttachment } from './contracts.js'

export async function findPersistedEmailMessage(
  db: Queryable,
  companyId: string,
  conversationId: string,
  messageId: string,
): Promise<{ sequence: number } | null> {
  const { rows } = await db.query<{ sequence: number }>(
    `SELECT sequence
       FROM messages
      WHERE id = $1 AND company_id = $2 AND conversation_id = $3`,
    [messageId, companyId, conversationId],
  )
  return rows[0] ?? null
}

export async function persistEmailProjection(
  db: Queryable,
  input: PersistEmailMessageInput,
  messageId: string,
  attachments: PersistedEmailAttachment[],
  normalized: {
    smtpMessageId: string | null
    inReplyTo: string | null
    references: string[]
  },
): Promise<number> {
  const counter = await db.query<{ sequence: number }>(
    `INSERT INTO conversation_counters (conversation_id, next_sequence)
     SELECT conversation.id, 2
       FROM conversations conversation
      WHERE conversation.id = $1 AND conversation.company_id = $2
     ON CONFLICT (conversation_id)
     DO UPDATE SET next_sequence = conversation_counters.next_sequence + 1
     RETURNING next_sequence - 1 AS sequence`,
    [input.conversationId, input.companyId],
  )
  const sequence = counter.rows[0]?.sequence
  if (sequence === undefined) {
    throw new Error(`email conversation ${input.conversationId} does not belong to ${input.companyId}`)
  }

  await db.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id)
     VALUES ($1, $2, $3, 'email', $4, $5, $6)`,
    [messageId, input.conversationId, input.authorId, input.body, sequence, input.companyId],
  )
  const nextRetryAt = input.direction === 'out' && input.transportStatus === 'failed'
    ? new Date(Date.now() + 60_000)
    : null
  await db.query(
    `INSERT INTO email_messages (
        message_id, conversation_id, company_id, direction, transport_status,
        transport_error, smtp_message_id, in_reply_to, references_chain,
        subject, from_addr, to_addrs, cc_addrs, bcc_addrs, html, raw_size_bytes,
        auto_submitted, next_retry_at
     ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9::jsonb,
        $10, $11, $12::jsonb, $13::jsonb, $14::jsonb, $15, $16,
        $17, $18
     )`,
    [
      messageId,
      input.conversationId,
      input.companyId,
      input.direction,
      input.transportStatus,
      input.transportError ?? null,
      normalized.smtpMessageId,
      normalized.inReplyTo,
      JSON.stringify(normalized.references),
      input.subject.slice(0, 1000),
      input.fromAddr.slice(0, 320),
      JSON.stringify(input.toAddrs.slice(0, 64)),
      JSON.stringify((input.ccAddrs ?? []).slice(0, 64)),
      JSON.stringify((input.bccAddrs ?? []).slice(0, 64)),
      input.html ?? null,
      input.rawSizeBytes ?? null,
      Boolean(input.autoSubmitted),
      nextRetryAt,
    ],
  )
  for (const attachment of attachments) {
    await db.query(
      `INSERT INTO email_attachments
         (id, message_id, conversation_id, company_id, filename, mime_type, size_bytes, storage_key, truncated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        attachment.id,
        messageId,
        input.conversationId,
        input.companyId,
        attachment.filename,
        attachment.mimeType,
        attachment.sizeBytes,
        attachment.storageKey,
        attachment.truncated,
      ],
    )
  }
  await db.query(
    `UPDATE conversations SET updated_at = NOW() WHERE id = $1 AND company_id = $2`,
    [input.conversationId, input.companyId],
  )
  return sequence
}

export async function completeOutboundDelivery(
  db: Queryable,
  companyId: string,
  messageId: string,
  input: { status: 'sent' | 'failed'; error: string | null; smtpMessageId: string | null },
): Promise<void> {
  await db.query(
    `UPDATE email_messages
        SET transport_status = $3,
            transport_error = $4,
            smtp_message_id = $5,
            next_retry_at = CASE WHEN $3 = 'failed' THEN NOW() + INTERVAL '60 seconds' ELSE NULL END
      WHERE message_id = $1 AND company_id = $2 AND direction = 'out'`,
    [messageId, companyId, input.status, input.error, input.smtpMessageId],
  )
}
