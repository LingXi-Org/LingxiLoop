import type { Queryable } from '../../db/queryable.js'

export interface AgentKnowledgeSourceRow {
  id: string
  title: string
  kind: string
  status: string
  external_source_id: string | null
  excluded: boolean
}

export async function findAgentProjectId(
  db: Queryable,
  companyId: string,
  conversationId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ project_id: string | null }>(
    `SELECT project_id FROM conversations WHERE id=$1 AND company_id=$2 AND kind='group'`,
    [conversationId, companyId],
  )
  return rows[0]?.project_id ?? null
}

export async function listAgentKnowledgeSources(
  db: Queryable,
  input: { companyId: string; projectId: string; conversationId: string },
): Promise<AgentKnowledgeSourceRow[]> {
  const { rows } = await db.query<AgentKnowledgeSourceRow>(
    `SELECT source.id,source.title,source.kind,source.status,source.external_source_id,
            (exclusion.source_id IS NOT NULL) AS excluded
       FROM knowledge_sources source
       LEFT JOIN conversation_source_exclusions exclusion
         ON exclusion.source_id=source.id AND exclusion.conversation_id=$1
      WHERE source.company_id=$2 AND source.project_id=$3 AND source.deleted_at IS NULL
      ORDER BY source.created_at DESC`,
    [input.conversationId, input.companyId, input.projectId],
  )
  return rows
}

export async function findAgentKnowledgeSource(
  db: Queryable,
  input: { sourceId: string; companyId: string; projectId: string },
): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query(
    `SELECT id,title,kind,mime_type AS "mimeType",size_bytes AS "sizeBytes",original_url AS "originalUrl",
            status,stage,error,created_at AS "createdAt",updated_at AS "updatedAt",
            external_source_id AS "externalSourceId"
       FROM knowledge_sources
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [input.sourceId, input.companyId, input.projectId],
  )
  return rows[0] as Record<string, unknown> | undefined ?? null
}

export async function insertAgentKnowledgeSource(db: Queryable, input: {
  id: string; companyId: string; projectId: string; conversationId: string; kind: 'text'|'url'|'file'
  title: string; mime: string | null; size: number; storageKey: string | null; originalUrl: string | null; agentId: string
}): Promise<void> {
  await db.query(
    `INSERT INTO knowledge_sources
       (id,company_id,project_id,conversation_id,kind,title,mime_type,size_bytes,storage_key,original_url,
        status,stage,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued','queued',$11)`,
    [input.id,input.companyId,input.projectId,input.conversationId,input.kind,input.title,input.mime,
      input.size,input.storageKey,input.originalUrl,input.agentId],
  )
}

export async function upsertAgentNoteBindings(db: Queryable, input: {
  companyId: string; projectId: string; agentId: string
  bindings: Array<{ id: string; externalId: string; title: string }>
}): Promise<Map<string, string>> {
  for (const binding of input.bindings) {
    await db.query(
      `INSERT INTO knowledge_note_bindings (id,company_id,project_id,external_note_id,title,created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (external_note_id) DO NOTHING`,
      [binding.id,input.companyId,input.projectId,binding.externalId,binding.title,input.agentId],
    )
    await db.query(
      `UPDATE knowledge_note_bindings SET title=$4,updated_at=NOW()
        WHERE company_id=$1 AND project_id=$2 AND external_note_id=$3`,
      [input.companyId,input.projectId,binding.externalId,binding.title],
    )
  }
  const { rows } = await db.query<{ id: string; external_note_id: string }>(
    `SELECT id,external_note_id FROM knowledge_note_bindings WHERE company_id=$1 AND project_id=$2`,
    [input.companyId,input.projectId],
  )
  return new Map(rows.map((row) => [row.external_note_id,row.id]))
}

export async function findAgentNoteExternalId(
  db: Queryable,
  input: { noteId: string; companyId: string; projectId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ external_note_id: string }>(
    `SELECT external_note_id FROM knowledge_note_bindings WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [input.noteId,input.companyId,input.projectId],
  )
  return rows[0]?.external_note_id ?? null
}

export async function deleteAgentNoteBinding(
  db: Queryable,
  input: { noteId: string; companyId: string; projectId: string },
): Promise<void> {
  await db.query(`DELETE FROM knowledge_note_bindings WHERE id=$1 AND company_id=$2 AND project_id=$3`,
    [input.noteId,input.companyId,input.projectId])
}

export async function findAgentSourceExternalId(
  db: Queryable,
  input: { sourceId: string; companyId: string; projectId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ external_source_id: string | null }>(
    `SELECT external_source_id FROM knowledge_sources
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [input.sourceId,input.companyId,input.projectId],
  )
  return rows[0]?.external_source_id ?? null
}

export async function upsertAgentInsightBindings(db: Queryable, input: {
  companyId: string; sourceId: string; bindings: Array<{ id: string; externalId: string }>
}): Promise<Map<string, string>> {
  for (const binding of input.bindings) {
    await db.query(
      `INSERT INTO knowledge_insight_bindings (id,company_id,source_id,external_insight_id)
       SELECT $1,$2,source.id,$4 FROM knowledge_sources source
        WHERE source.id=$3 AND source.company_id=$2 AND source.deleted_at IS NULL
       ON CONFLICT (external_insight_id) DO NOTHING`,
      [binding.id,input.companyId,input.sourceId,binding.externalId],
    )
  }
  const { rows } = await db.query<{ id: string; external_insight_id: string }>(
    `SELECT id,external_insight_id FROM knowledge_insight_bindings WHERE company_id=$1 AND source_id=$2`,
    [input.companyId,input.sourceId],
  )
  return new Map(rows.map((row) => [row.external_insight_id,row.id]))
}

export async function findAgentInsightBinding(db: Queryable, input: {
  insightId: string; companyId: string; projectId: string
}): Promise<{ externalId: string; sourceId: string } | null> {
  const { rows } = await db.query<{ external_insight_id: string; source_id: string }>(
    `SELECT insight.external_insight_id,insight.source_id
       FROM knowledge_insight_bindings insight
       JOIN knowledge_sources source
         ON source.id=insight.source_id AND source.company_id=insight.company_id
      WHERE insight.id=$1 AND insight.company_id=$2 AND source.project_id=$3 AND source.deleted_at IS NULL`,
    [input.insightId,input.companyId,input.projectId],
  )
  return rows[0] ? { externalId: rows[0].external_insight_id, sourceId: rows[0].source_id } : null
}

export async function deleteAgentInsightBinding(db: Queryable, input: {
  insightId: string; companyId: string; projectId: string
}): Promise<void> {
  await db.query(
    `DELETE FROM knowledge_insight_bindings insight
      USING knowledge_sources source
      WHERE insight.id=$1 AND insight.company_id=$2 AND source.id=insight.source_id
        AND source.company_id=$2 AND source.project_id=$3`,
    [input.insightId,input.companyId,input.projectId],
  )
}

export async function insertAgentSourceChat(db: Queryable, input: {
  id: string; companyId: string; projectId: string; sourceId: string; agentId: string; externalSessionId: string
}): Promise<void> {
  await db.query(
    `INSERT INTO knowledge_source_chat_sessions (id,company_id,project_id,source_id,agent_id,external_session_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [input.id,input.companyId,input.projectId,input.sourceId,input.agentId,input.externalSessionId],
  )
}

export async function findAgentSourceChat(db: Queryable, input: {
  sessionId: string; companyId: string; projectId: string; agentId: string
}): Promise<{ externalSessionId: string; externalSourceId: string } | null> {
  const { rows } = await db.query<{ external_session_id: string; external_source_id: string }>(
    `SELECT chat.external_session_id,source.external_source_id
       FROM knowledge_source_chat_sessions chat
       JOIN knowledge_sources source ON source.id=chat.source_id AND source.company_id=chat.company_id
      WHERE chat.id=$1 AND chat.company_id=$2 AND chat.project_id=$3 AND chat.agent_id=$4
        AND chat.deleted_at IS NULL AND source.deleted_at IS NULL`,
    [input.sessionId,input.companyId,input.projectId,input.agentId],
  )
  const row = rows[0]
  return row?.external_source_id
    ? { externalSessionId: row.external_session_id, externalSourceId: row.external_source_id }
    : null
}

export async function updateAgentSourceTitle(db: Queryable, input: {
  sourceId: string; companyId: string; projectId: string; title: string | null
}): Promise<void> {
  await db.query(
    `UPDATE knowledge_sources SET title=COALESCE($4,title),updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [input.sourceId,input.companyId,input.projectId,input.title],
  )
}

export async function setAgentSourceExcluded(db: Queryable, input: {
  sourceId: string; companyId: string; projectId: string; conversationId: string; agentId: string; excluded: boolean
}): Promise<void> {
  if (!input.excluded) {
    await db.query(
      `DELETE FROM conversation_source_exclusions exclusion
        USING conversations conversation,knowledge_sources source
       WHERE exclusion.conversation_id=$1 AND exclusion.source_id=$2
         AND conversation.id=exclusion.conversation_id AND conversation.company_id=$3 AND conversation.project_id=$4
         AND source.id=exclusion.source_id AND source.company_id=$3 AND source.project_id=$4`,
      [input.conversationId,input.sourceId,input.companyId,input.projectId],
    )
    return
  }
  await db.query(
    `INSERT INTO conversation_source_exclusions (conversation_id,source_id,created_by)
     SELECT conversation.id,source.id,$5 FROM conversations conversation
     JOIN knowledge_sources source ON source.id=$2 AND source.company_id=$3 AND source.project_id=$4 AND source.deleted_at IS NULL
      WHERE conversation.id=$1 AND conversation.company_id=$3 AND conversation.project_id=$4
     ON CONFLICT (conversation_id,source_id) DO NOTHING`,
    [input.conversationId,input.sourceId,input.companyId,input.projectId,input.agentId],
  )
}

export async function softDeleteAgentSource(db: Queryable, input: {
  sourceId: string; companyId: string; projectId: string
}): Promise<boolean> {
  const result = await db.query(
    `UPDATE knowledge_sources SET deleted_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND deleted_at IS NULL`,
    [input.sourceId,input.companyId,input.projectId],
  )
  return (result.rowCount ?? 0) > 0
}
