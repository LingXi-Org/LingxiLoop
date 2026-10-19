import type { Queryable } from '../../db/queryable.js'
import { createPermissionService, ForbiddenError } from '../access/public.js'
import type { CaseContent } from './contracts.js'

/** Publication identity stays stable across draft edits and ingestion retries. */
export function caseSourceVersion(caseId: string, version: number): string {
  return `case:${caseId}:${version}`
}

export interface CaseEvidenceSource {
  id: string
  title: string
  text: string
  sourceVersion: string
  url: string
  status: string
}

/** null is a non-case source; an unavailable case must never fall through to course permissions. */
export async function readCaseEvidenceSource(db: Queryable, input: {
  companyId: string; sourceId: string; readerUserIds: readonly string[]; sourceVersion?: string
}): Promise<CaseEvidenceSource | null> {
  const identity = await db.query<{ case_id: string | null }>(
    'SELECT case_id FROM knowledge_sources WHERE id=$1', [input.sourceId],
  )
  if (!identity.rows[0]?.case_id) return null
  if (!input.readerUserIds.length) throw new ForbiddenError('NOT_AUTHENTICATED')
  const permissions = createPermissionService(db, { lockDependencies: true })
  for (const actorUserId of new Set(input.readerUserIds)) {
    await permissions.assertCan({ actorUserId, companyId: input.companyId, action: 'cases:read' })
  }
  const { rows } = await db.query<{
    id: string; case_id: string; case_version: number; status: string; published: CaseContent
  }>(`SELECT source.id,source.case_id,source.case_version,source.status,article.published
      FROM knowledge_sources source JOIN organization_cases article
        ON article.source_id=source.id AND article.id=source.case_id AND article.company_id=source.company_id
       AND article.published_version=source.case_version
     WHERE source.id=$1 AND source.company_id=$2 AND source.visibility_scope='COMPANY_CASE'
       AND source.deleted_at IS NULL AND article.status='published'`, [input.sourceId, input.companyId])
  const source = rows[0]
  if (!source?.published) throw new ForbiddenError('RESOURCE_NOT_FOUND')
  const sourceVersion = caseSourceVersion(source.case_id, source.case_version)
  if ('sourceVersion' in input && input.sourceVersion !== sourceVersion) throw new ForbiddenError('RESOURCE_NOT_FOUND')
  const content = source.published
  return { id: source.id, title: content.title, sourceVersion, status: source.status,
    text: [content.title, content.summary, content.category, content.tags.join(', '), content.body].join('\n\n'),
    url: `/cases/${encodeURIComponent(source.case_id)}?company=${encodeURIComponent(input.companyId)}` }
}
