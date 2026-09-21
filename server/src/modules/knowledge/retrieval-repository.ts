import type { Queryable } from '../../db/queryable.js'

export interface KnowledgeRetrievalSource {
  id: string
  title: string
  externalSourceId: string | null
  status: string
  originalUrl: string | null
  excluded: boolean
}

export async function findKnowledgeRetrievalProject(
  db: Queryable,
  companyId: string,
  conversationId: string,
  authorizationUserId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ project_id: string | null }>(
    `SELECT conversation.project_id
       FROM conversations conversation
      WHERE conversation.id=$1 AND conversation.company_id=$2
        AND conversation.kind IN ('group','direct')
        AND conversation.members @> to_jsonb(ARRAY[$3::text])`,
    [conversationId, companyId, authorizationUserId],
  )
  return rows[0]?.project_id ?? null
}

export async function listKnowledgeRetrievalSources(
  db: Queryable,
  input: { companyId: string; projectId: string; conversationId: string; authorizationUserId: string; includePending?: boolean },
): Promise<KnowledgeRetrievalSource[]> {
  const { rows } = await db.query<{
    id: string; title: string; external_source_id: string | null; status: string; original_url: string | null; excluded: boolean
  }>(
    `SELECT source.id,source.title,source.external_source_id,source.status,source.original_url,
            (exclusion.source_id IS NOT NULL) AS excluded
       FROM knowledge_sources source
       LEFT JOIN conversation_source_exclusions exclusion
         ON exclusion.source_id=source.id AND exclusion.conversation_id=$1 AND exclusion.user_id=$4
      WHERE source.company_id=$2 AND source.project_id=$3 AND ($5 OR source.status='ready')
        AND (
          source.visibility_scope='PROJECT'
          OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4)
        )
        AND source.deleted_at IS NULL AND ($5 OR source.external_source_id IS NOT NULL)`,
    [input.conversationId,input.companyId,input.projectId,input.authorizationUserId,input.includePending ?? false],
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    externalSourceId: row.external_source_id,
    status: row.status,
    originalUrl: row.original_url,
    excluded: row.excluded,
  }))
}
