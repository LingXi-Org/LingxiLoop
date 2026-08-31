import type { Queryable } from '../../db/queryable.js'

export interface AgentKnowledgeSourceRow {
  id: string
  title: string
  kind: string
  status: string
  external_source_id: string | null
  visibility_scope: 'PRIVATE' | 'PROJECT'
  owner_user_id: string
  created_by_user_id: string
  created_via: 'USER' | 'AGENT'
  excluded: boolean
}

export async function listAgentKnowledgeSources(
  db: Queryable,
  input: { companyId: string; projectId: string; conversationId: string; authorizationUserId: string },
): Promise<AgentKnowledgeSourceRow[]> {
  const { rows } = await db.query<AgentKnowledgeSourceRow>(
    `SELECT source.id,source.title,source.kind,source.status,source.external_source_id,
            source.visibility_scope,source.owner_user_id,source.created_by_user_id,source.created_via,
            (exclusion.source_id IS NOT NULL) AS excluded
       FROM knowledge_sources source
       LEFT JOIN conversation_source_exclusions exclusion
         ON exclusion.source_id=source.id AND exclusion.conversation_id=$1 AND exclusion.user_id=$4
      WHERE source.company_id=$2 AND source.project_id=$3 AND source.deleted_at IS NULL
        AND (source.visibility_scope='PROJECT' OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4))
      ORDER BY source.created_at DESC`,
    [input.conversationId, input.companyId, input.projectId, input.authorizationUserId],
  )
  return rows
}

export async function findAgentKnowledgeSource(
  db: Queryable,
  input: { sourceId: string; companyId: string; projectId: string; authorizationUserId: string },
): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query(
    `SELECT source.id,source.title,source.kind,source.mime_type AS "mimeType",
            source.size_bytes AS "sizeBytes",source.original_url AS "originalUrl",
            source.status,source.stage,source.error,source.created_at AS "createdAt",
            source.updated_at AS "updatedAt",source.external_source_id AS "externalSourceId",
            source.visibility_scope AS "visibilityScope",source.owner_user_id AS "ownerUserId",
            source.created_by_user_id AS "createdByUserId",source.created_via AS "createdVia"
       FROM knowledge_sources source
      WHERE source.id=$1 AND source.company_id=$2 AND source.project_id=$3 AND source.deleted_at IS NULL
        AND (source.visibility_scope='PROJECT' OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4))`,
    [input.sourceId, input.companyId, input.projectId, input.authorizationUserId],
  )
  return rows[0] as Record<string, unknown> | undefined ?? null
}

export async function insertAgentKnowledgeSource(db: Queryable, input: {
  id: string; companyId: string; projectId: string; conversationId: string; kind: 'text'|'url'|'file'
  title: string; mime: string | null; size: number; storageKey: string | null; originalUrl: string | null
  authorizationUserId: string
}): Promise<void> {
  await db.query(
    `INSERT INTO knowledge_sources
       (id,company_id,project_id,conversation_id,kind,title,mime_type,size_bytes,storage_key,original_url,
        status,stage,visibility_scope,owner_user_id,created_by_user_id,created_via)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued','queued','PRIVATE',$11,$11,'AGENT')
     ON CONFLICT (id) DO NOTHING`,
    [input.id,input.companyId,input.projectId,input.conversationId,input.kind,input.title,input.mime,
      input.size,input.storageKey,input.originalUrl,input.authorizationUserId],
  )
}

export async function findAgentSourceExternalId(
  db: Queryable,
  input: { sourceId: string; companyId: string; projectId: string; authorizationUserId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ external_source_id: string | null }>(
    `SELECT source.external_source_id FROM knowledge_sources source
      WHERE source.id=$1 AND source.company_id=$2 AND source.project_id=$3 AND source.deleted_at IS NULL
        AND (source.visibility_scope='PROJECT' OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4))`,
    [input.sourceId,input.companyId,input.projectId,input.authorizationUserId],
  )
  return rows[0]?.external_source_id ?? null
}

export async function setAgentSourceExcluded(db: Queryable, input: {
  sourceId: string; companyId: string; projectId: string; conversationId: string
  authorizationUserId: string; excluded: boolean
}): Promise<void> {
  if (!input.excluded) {
    await db.query(
      `DELETE FROM conversation_source_exclusions exclusion
        USING conversations conversation,knowledge_sources source
       WHERE exclusion.conversation_id=$1 AND exclusion.source_id=$2 AND exclusion.user_id=$5
         AND conversation.id=exclusion.conversation_id AND conversation.company_id=$3 AND conversation.project_id=$4
         AND source.id=exclusion.source_id AND source.company_id=$3 AND source.project_id=$4
         AND (source.visibility_scope='PROJECT' OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$5))`,
      [input.conversationId,input.sourceId,input.companyId,input.projectId,input.authorizationUserId],
    )
    return
  }
  await db.query(
    `INSERT INTO conversation_source_exclusions (conversation_id,source_id,user_id)
     SELECT conversation.id,source.id,$5 FROM conversations conversation
     JOIN knowledge_sources source ON source.id=$2 AND source.company_id=$3 AND source.deleted_at IS NULL
      AND source.project_id=$4
      AND (source.visibility_scope='PROJECT' OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$5))
      WHERE conversation.id=$1 AND conversation.company_id=$3 AND conversation.project_id=$4
     ON CONFLICT (conversation_id,source_id,user_id) DO NOTHING`,
    [input.conversationId,input.sourceId,input.companyId,input.projectId,input.authorizationUserId],
  )
}
