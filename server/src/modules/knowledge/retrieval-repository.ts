import type { Queryable } from '../../db/queryable.js'

export interface KnowledgeRetrievalSource {
  id: string
  title: string
  externalSourceId: string
  originalUrl: string | null
  excluded: boolean
}

export async function findKnowledgeRetrievalProject(
  db: Queryable,
  companyId: string,
  conversationId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ project_id: string | null }>(
    `SELECT project_id FROM conversations
      WHERE id=$1 AND company_id=$2 AND kind='group'`,
    [conversationId,companyId],
  )
  return rows[0]?.project_id ?? null
}

export async function listKnowledgeRetrievalSources(
  db: Queryable,
  input: { companyId: string; projectId: string; conversationId: string },
): Promise<KnowledgeRetrievalSource[]> {
  const { rows } = await db.query<{
    id: string; title: string; external_source_id: string; original_url: string | null; excluded: boolean
  }>(
    `SELECT source.id,source.title,source.external_source_id,source.original_url,
            (exclusion.source_id IS NOT NULL) AS excluded
       FROM knowledge_sources source
       LEFT JOIN conversation_source_exclusions exclusion
         ON exclusion.source_id=source.id AND exclusion.conversation_id=$1
      WHERE source.company_id=$2 AND source.project_id=$3 AND source.status='ready'
        AND source.deleted_at IS NULL AND source.external_source_id IS NOT NULL`,
    [input.conversationId,input.companyId,input.projectId],
  )
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    externalSourceId: row.external_source_id,
    originalUrl: row.original_url,
    excluded: row.excluded,
  }))
}
