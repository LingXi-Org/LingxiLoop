import type { Queryable } from '../../db/queryable.js'

export async function listReferencedEmailAttachmentKeys(db: Queryable): Promise<Set<string>> {
  const { rows } = await db.query<{ company_id: string; storage_key: string }>(
    `SELECT company_id, storage_key
       FROM email_attachments
      WHERE storage_key IS NOT NULL`,
  )
  return new Set(rows.map((row) => row.storage_key))
}
