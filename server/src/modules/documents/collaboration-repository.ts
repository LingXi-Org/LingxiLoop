import { createPermissionService } from '../access/public.js'
import type { Queryable } from '../../db/queryable.js'

/** One MVCC snapshot includes compaction and its remaining update tail. */
export async function readPersistedDocument(db: Queryable, documentId: string, companyId: string) {
  const { rows } = await db.query<{ revision: string; state_bytes: Buffer | null; updates: Buffer[] | null }>(`SELECT document.updated_at::text AS revision,
      snapshot.state_bytes,ARRAY(SELECT update_log.update_bytes FROM document_updates update_log
        WHERE update_log.document_id=document.id AND update_log.id>COALESCE(snapshot.snapshot_at_update_id,0)
        ORDER BY update_log.id) AS updates
    FROM documents document LEFT JOIN document_snapshots snapshot ON snapshot.document_id=document.id
    WHERE document.id=$1 AND document.company_id=$2`, [documentId,companyId])
  const result = rows[0]
  if (!result) throw new Error('document not found')
  const bytes = (result.state_bytes?.byteLength ?? 0) + (result.updates ?? []).reduce((total, update) => total + update.byteLength, 0)
  if (bytes > 16 * 1024 * 1024) throw new Error('document snapshot exceeds 16 MiB')
  return result
}

export async function lockTenantDocument(
  db: Queryable,
  documentId: string,
  companyId: string,
): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM documents WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [documentId, companyId],
  )
  if (!rows[0]) throw new Error('document not found')
}

export async function loadDocumentSnapshot(
  db: Queryable,
  documentId: string,
  companyId: string,
): Promise<{ state: Uint8Array | null; lastIncluded: bigint }> {
  const { rows } = await db.query<{ state_bytes: Buffer | null; snapshot_at_update_id: string | null }>(
    `SELECT snapshot.state_bytes, snapshot.snapshot_at_update_id
       FROM documents document
       LEFT JOIN document_snapshots snapshot ON snapshot.document_id=document.id
      WHERE document.id=$1 AND document.company_id=$2`,
    [documentId, companyId],
  )
  const row = rows[0]
  if (!row) throw new Error('document not found')
  return {
    state: row.state_bytes ? new Uint8Array(row.state_bytes) : null,
    lastIncluded: row.snapshot_at_update_id ? BigInt(row.snapshot_at_update_id) : 0n,
  }
}

export async function loadDocumentUpdatesAfter(
  db: Queryable,
  documentId: string,
  companyId: string,
  afterId: bigint,
): Promise<Array<{ id: bigint; bytes: Uint8Array }>> {
  const { rows } = await db.query<{ id: string; update_bytes: Buffer }>(
    `SELECT update_log.id, update_log.update_bytes
       FROM document_updates update_log
       JOIN documents document ON document.id=update_log.document_id
      WHERE update_log.document_id=$1 AND document.company_id=$2 AND update_log.id>$3
      ORDER BY update_log.id ASC`,
    [documentId, companyId, afterId.toString()],
  )
  return rows.map((row) => ({ id: BigInt(row.id), bytes: new Uint8Array(row.update_bytes) }))
}

export async function persistDocumentUpdate(db: Queryable, args: {
  documentId: string; companyId: string; authorId: string; bytes: Uint8Array
}): Promise<void> {
  const { rows } = await db.query<{ document_id: string }>(
    `INSERT INTO document_updates (document_id, author_id, update_bytes)
     SELECT document.id,$3,$4 FROM documents document
      WHERE document.id=$1 AND document.company_id=$2
     RETURNING document_id`,
    [args.documentId, args.companyId, args.authorId, Buffer.from(args.bytes)],
  )
  if (!rows[0]) throw new Error('document not found')
  await db.query(
    `UPDATE documents SET updated_at=NOW() WHERE id=$1 AND company_id=$2`,
    [args.documentId, args.companyId],
  )
}

export async function compactDocumentUpdates(
  db: Queryable,
  documentId: string,
  companyId: string,
  state: Uint8Array,
): Promise<void> {
  const { rows } = await db.query<{ max_id: string | null }>(
    `SELECT MAX(update_log.id)::text AS max_id
       FROM document_updates update_log
       JOIN documents document ON document.id=update_log.document_id
      WHERE update_log.document_id=$1 AND document.company_id=$2`,
    [documentId, companyId],
  )
  const maxId = rows[0]?.max_id ? BigInt(rows[0].max_id) : 0n
  await db.query(
    `INSERT INTO document_snapshots (document_id, state_bytes, snapshot_at_update_id, updated_at)
     SELECT document.id,$3,$4,NOW() FROM documents document
      WHERE document.id=$1 AND document.company_id=$2
     ON CONFLICT (document_id)
       DO UPDATE SET state_bytes=EXCLUDED.state_bytes,
                     snapshot_at_update_id=EXCLUDED.snapshot_at_update_id,
                     updated_at=NOW()`,
    [documentId, companyId, Buffer.from(state), maxId.toString()],
  )
  await db.query(
    `DELETE FROM document_updates update_log
      USING documents document
      WHERE update_log.document_id=$1 AND update_log.id<=$3
        AND document.id=update_log.document_id AND document.company_id=$2`,
    [documentId, companyId, maxId.toString()],
  )
}

export async function listProjectDocumentIds(
  db: Queryable,
  companyId: string,
  projectId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM documents WHERE company_id=$1 AND project_id=$2`,
    [companyId, projectId],
  )
  return rows.map((row) => row.id)
}

export async function humanWriteAuthorization(db: Queryable, authorId: string): Promise<string | null> {
  const { rows } = await db.query<{ authorization: string }>(`SELECT COALESCE(access_revoked_at::text,'') AS authorization
    FROM users WHERE id=$1 AND departed_at IS NULL AND suspended_at IS NULL AND deleted_at IS NULL FOR SHARE`, [authorId])
  return rows[0]?.authorization ?? null
}

export async function canPersistHumanUpdate(db: Queryable, documentId: string, companyId: string, authorId: string, authorization: string | null): Promise<boolean> {
  // Compare the captured database marker, independent of clocks on Web/API hosts.
  if (authorization === null || await humanWriteAuthorization(db, authorId) !== authorization) return false
  return (await createPermissionService(db, { lockDependencies: true }).can({
    actorUserId: authorId, companyId, action: 'document:write', resource: { type: 'document', id: documentId },
  })).allowed
}
