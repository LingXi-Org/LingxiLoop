import type { Queryable } from '../../db/queryable.js'

export interface InboundRecipient {
  address: string
  companyId: string
  participantId: string
  participantName: string
  participantKind: string
}

export async function findInboundRecipients(
  db: Queryable,
  addresses: string[],
): Promise<InboundRecipient[]> {
  if (addresses.length === 0) return []
  const { rows } = await db.query<{
    address: string
    company_id: string
    participant_id: string
    participant_name: string
    participant_kind: string
  }>(
    `SELECT LOWER(participant.email) AS address,
            participant.company_id,
            participant.id AS participant_id,
            participant.name AS participant_name,
            participant.kind AS participant_kind
       FROM participants participant
      WHERE participant.departed_at IS NULL
        AND LOWER(participant.email) = ANY($1::text[])`,
    [addresses],
  )
  return rows.map((row) => ({
    address: row.address,
    companyId: row.company_id,
    participantId: row.participant_id,
    participantName: row.participant_name,
    participantKind: row.participant_kind,
  }))
}

export async function findInboundDuplicates(
  db: Queryable,
  companyIds: string[],
  smtpMessageId: string,
): Promise<Map<string, string>> {
  if (companyIds.length === 0) return new Map()
  const { rows } = await db.query<{ company_id: string; message_id: string }>(
    `SELECT company_id, message_id
       FROM email_messages
      WHERE company_id = ANY($1::text[])
        AND LOWER(smtp_message_id) = $2`,
    [companyIds, smtpMessageId],
  )
  return new Map(rows.map((row) => [row.company_id, row.message_id]))
}
