import { legacyVisualizeReferences } from '../../../shared/retired-visualize.js'
import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { withTransaction } from '../db/transaction.js'
import { HttpError } from '../http/errors.js'
import { createPermissionService } from '../modules/access/public.js'
import { nativeText } from './message-types.js'

export interface ArchiveActor { companyId: string; channelId: string; userId: string }
interface ArchivedDocument {
  path: string; html: string; version: number; run_id: string; agent_id: string; created_by: string;
  source_hash: string; request_version: number | null; updated_at: Date;
}

/** Authorization is refreshed for each archive/replay, including teacher rooms. */
export async function assertArchiveActor(db: Queryable, input: ArchiveActor, action: 'conversation:read' | 'conversation:write' = 'conversation:read') {
  await createPermissionService(db, { lockDependencies: db !== pool }).assertCan({ companyId: input.companyId,
    actorUserId: input.userId, action, resource: { type: 'conversation', id: input.channelId } })
  const { assertTeacherRoomAccessible } = await import('../modules/learning/public.js')
  await assertTeacherRoomAccessible(input.channelId, input.companyId, input.userId, db)
  const result = await db.query(`SELECT 1 FROM conversations room JOIN participants person ON person.company_id=room.company_id
    AND person.id=$3 AND person.kind='human' AND person.departed_at IS NULL WHERE room.company_id=$1 AND room.id=$2
    AND room.members @> to_jsonb(ARRAY[$3::text])${db === pool ? '' : ' FOR SHARE OF room,person'}`,
    [input.companyId, input.channelId, input.userId])
  if (!result.rows.length) throw new HttpError(403, 'The archive requires current conversation membership.')
}

/** Retention only: read PostgreSQL, never execute HTML or reconstruct a guest. */
export async function exportRetiredVisualize(input: ArchiveActor & { path: string; sourceMessageId: string }, database?: Queryable) {
  const read = async (db: Queryable) => {
    await assertArchiveActor(db, input)
    const source = (await db.query<ArchivedDocument>(`SELECT path,html,version,run_id,agent_id,created_by,source_hash,request_version,updated_at
      FROM im_visualize_documents WHERE company_id=$1 AND channel_id=$2 AND path=$3${db === pool ? '' : ' FOR SHARE'}`,
      [input.companyId, input.channelId, input.path])).rows[0]
    if (!source) throw new HttpError(404, 'The archived visualization was not found.')
    const { imMessagesApplication } = await import('./messages-facade.js')
    const messages = await imMessagesApplication.readMessages({ ...input, messageIds: [input.sourceMessageId] }, db)
    const message = messages?.find(item => item.messageId === input.sourceMessageId || item.clientMsgNo === input.sourceMessageId)
    if (!message || message.payload.role !== 'assistant' || message.payload.status.type !== 'complete'
      || message.fromUid !== source.agent_id || message.payload.metadata.custom.runId !== source.run_id
      || !legacyVisualizeReferences(nativeText(message.payload)).some(reference => reference.path === source.path)) {
      throw new HttpError(403, 'The archive must match an existing delivered assistant reference.')
    }
    const state = (await db.query<{ state: unknown; updated_at: Date }>(`SELECT state,updated_at FROM im_visualize_states
      WHERE company_id=$1 AND channel_id=$2 AND path=$3 AND user_id=$4${db === pool ? '' : ' FOR SHARE'}`,
      [input.companyId, input.channelId, input.path, input.userId])).rows[0]
    // Only this person's non-secret page metadata is portable. Cap large old
    // page histories explicitly; all rows remain retained in PostgreSQL.
    const pages = await db.query<{ id: string; document_version: number; source_message_id: string; created_at: Date; expires_at: Date; revoked_at: Date | null }>(
      `SELECT id,document_version,source_message_id,created_at,expires_at,revoked_at FROM im_visualize_pages
       WHERE company_id=$1 AND channel_id=$2 AND path=$3 AND user_id=$4 ORDER BY created_at,id LIMIT 1001`,
      [input.companyId, input.channelId, input.path, input.userId])
    // Recheck after external durable-message retrieval. Revocation may have
    // arrived while WuKongIM answered; the transaction retains authorization locks.
    await assertArchiveActor(db, input)
    return { format: 'lingxiloop.visualize-archive', schemaVersion: 1, retired: true,
      notice: 'Visualize is retired. This JSON preserves source and your saved state as data. Legacy scripts and interactions are not run. Review the source before manually recreating content in Design; no automatic conversion is claimed.',
      sourceMessage: { id: message.messageId, clientMsgNo: message.clientMsgNo, body: nativeText(message.payload) },
      document: { path: source.path, html: source.html, version: source.version, sourceHash: source.source_hash,
        runId: source.run_id, agentId: source.agent_id, createdBy: source.created_by, requestVersion: source.request_version, updatedAt: source.updated_at },
      userState: state ? { state: state.state, updatedAt: state.updated_at } : null,
      pages: pages.rows.slice(0, 1000), pageRecordsTruncated: pages.rows.length > 1000,
      retained: { documents: true, states: true, pages: true, databaseMigrationsUnchanged: true },
    }
  }
  return database ? read(database) : withTransaction(pool, read)
}
