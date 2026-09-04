import type { Queryable } from '../../db/queryable.js'
import type { DocumentMentionDelivery, DocumentMentionRecipient } from './contracts.js'

export async function findDocumentMentionContext(db: Queryable, args: {
  documentId: string; companyId: string; mentionerId: string
}): Promise<{ documentTitle: string; projectId: string; mentionerName: string } | null> {
  const { rows } = await db.query<{
    document_title: string; project_id: string; mentioner_name: string
  }>(
    `SELECT document.title AS document_title,document.project_id,mentioner.name AS mentioner_name
       FROM documents document
       JOIN projects project
         ON project.id=document.project_id AND project.company_id=document.company_id
       JOIN participants mentioner
         ON mentioner.id=$3 AND mentioner.company_id=document.company_id AND mentioner.departed_at IS NULL
      WHERE document.id=$1 AND document.company_id=$2 AND project.status='ACTIVE'
      LIMIT 1`,
    [args.documentId, args.companyId, args.mentionerId],
  )
  const row = rows[0]
  return row ? {
    documentTitle: row.document_title,
    projectId: row.project_id,
    mentionerName: row.mentioner_name,
  } : null
}

export async function listMentionableDocumentParticipants(db: Queryable, args: {
  documentId: string; companyId: string; participantIds: string[]
}): Promise<DocumentMentionRecipient[]> {
  const { rows } = await db.query<{ id: string; kind: 'human' | 'agent'; name: string }>(
    `SELECT participant.id,participant.kind,participant.name
       FROM participants participant
       JOIN documents document
         ON document.id=$3 AND document.company_id=participant.company_id
       JOIN projects project
         ON project.id=document.project_id AND project.company_id=document.company_id
       LEFT JOIN project_memberships course_member
         ON course_member.project_id=project.id
        AND course_member.company_id=project.company_id
        AND course_member.user_id=participant.id AND course_member.status='ACTIVE'
      WHERE participant.company_id=$1 AND participant.id=ANY($2::text[])
        AND participant.departed_at IS NULL
        AND (participant.kind='agent' OR course_member.user_id IS NOT NULL)`,
    [args.companyId, args.participantIds, args.documentId],
  )
  return rows
}

export async function recordFreshDocumentMention(db: Queryable, args: {
  mentionId: string
  logId: string
  documentId: string
  companyId: string
  mentionerId: string
  mentionerName: string
  documentTitle: string
  recipient: DocumentMentionRecipient
}): Promise<boolean> {
  const lockKey = JSON.stringify([
    args.companyId,
    args.documentId,
    args.mentionerId,
    args.recipient.id,
  ])
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [lockKey])
  const { rows: recent } = await db.query<{ id: string }>(
    `SELECT id FROM document_mentions
      WHERE document_id=$1 AND company_id=$2 AND mentioner_id=$3 AND mentioned_id=$4
        AND created_at>NOW()-INTERVAL '60 seconds'
      LIMIT 1`,
    [args.documentId, args.companyId, args.mentionerId, args.recipient.id],
  )
  if (recent[0]) return false
  await db.query(
    `INSERT INTO document_mentions (id,document_id,company_id,mentioner_id,mentioned_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [args.mentionId, args.documentId, args.companyId, args.mentionerId, args.recipient.id],
  )
  if (args.recipient.kind === 'agent') {
    await db.query(
      `INSERT INTO agent_log (id,agent_id,company_id,kind,body,ref)
       VALUES ($1,$2,$3,'doc_mention',$4,$5::jsonb)`,
      [args.logId, args.recipient.id, args.companyId,
        `${args.mentionerName} @-mentioned you in doc "${args.documentTitle}"`,
        JSON.stringify({ documentId: args.documentId, mentionerId: args.mentionerId })],
    )
  }
  return true
}

export async function insertDocumentMentionDelivery(db: Queryable, args: {
  id: string
  companyId: string
  documentId: string
  projectId: string
  mentionerId: string
  mentionerName: string
  documentTitle: string
  recipients: DocumentMentionRecipient[]
}): Promise<void> {
  await db.query(
    `INSERT INTO document_mention_deliveries
       (id,company_id,document_id,project_id,mentioner_id,mentioner_name,document_title,recipients)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [args.id, args.companyId, args.documentId, args.projectId, args.mentionerId,
      args.mentionerName, args.documentTitle, JSON.stringify(args.recipients)],
  )
}

export async function claimDocumentMentionDelivery(
  db: Queryable,
  workerId: string,
  leaseMs: number,
): Promise<DocumentMentionDelivery | null> {
  const { rows } = await db.query<{
    id: string
    company_id: string
    document_id: string
    project_id: string
    mentioner_id: string
    mentioner_name: string
    document_title: string
    recipients: DocumentMentionRecipient[]
    attempts: number
  }>(
    `SELECT id,company_id,document_id,project_id,mentioner_id,mentioner_name,document_title,recipients,attempts
       FROM document_mention_deliveries
      WHERE status IN ('queued','processing') AND available_at<=NOW()
        AND (leased_until IS NULL OR leased_until<NOW())
      ORDER BY available_at,created_at
      FOR UPDATE SKIP LOCKED LIMIT 1`,
  )
  const row = rows[0]
  if (!row) return null
  await db.query(
    `UPDATE document_mention_deliveries
        SET status='processing',leased_until=NOW()+($2::int*INTERVAL '1 millisecond'),
            leased_by=$3,attempts=attempts+1,updated_at=NOW()
      WHERE id=$1`,
    [row.id, leaseMs, workerId],
  )
  return {
    id: row.id,
    companyId: row.company_id,
    documentId: row.document_id,
    projectId: row.project_id,
    mentionerId: row.mentioner_id,
    mentionerName: row.mentioner_name,
    documentTitle: row.document_title,
    recipients: row.recipients,
    leaseOwner: workerId,
    attempts: row.attempts + 1,
  }
}

export async function completeDocumentMentionDelivery(
  db: Queryable,
  delivery: Pick<DocumentMentionDelivery, 'id' | 'leaseOwner' | 'attempts'>,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE document_mention_deliveries
        SET status='completed',leased_until=NULL,leased_by=NULL,last_error=NULL,
            completed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status='processing' AND leased_by=$2 AND attempts=$3`,
    [delivery.id, delivery.leaseOwner, delivery.attempts],
  )
  return (result.rowCount ?? 0) === 1
}

export async function failDocumentMentionDelivery(db: Queryable, args: {
  delivery: Pick<DocumentMentionDelivery, 'id' | 'leaseOwner' | 'attempts'>
  error: string
  final: boolean
  retryDelayMs: number
}): Promise<boolean> {
  const result = await db.query(
    `UPDATE document_mention_deliveries
        SET status=$4,last_error=$5,leased_until=NULL,leased_by=NULL,
            available_at=CASE WHEN $4='queued'
              THEN NOW()+($6::int*INTERVAL '1 millisecond') ELSE available_at END,
            updated_at=NOW()
      WHERE id=$1 AND status='processing' AND leased_by=$2 AND attempts=$3`,
    [args.delivery.id, args.delivery.leaseOwner, args.delivery.attempts,
      args.final ? 'failed' : 'queued', args.error.slice(0, 2_000), args.retryDelayMs],
  )
  return (result.rowCount ?? 0) === 1
}
