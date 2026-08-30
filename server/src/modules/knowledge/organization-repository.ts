import type { Queryable } from '../../db/queryable.js'

const ORGANIZATION_SOURCE_COLUMNS = `source.id,source.project_id AS "originProjectId",
  source.kind,source.title,source.mime_type AS "mimeType",source.size_bytes AS "sizeBytes",
  source.original_url AS "originalUrl",source.status,source.stage,
  source.created_by AS "createdBy",source.created_at AS "createdAt"`

export async function listOrganizationKnowledgeSources(db: Queryable, companyId: string) {
  const { rows } = await db.query(
    `SELECT ${ORGANIZATION_SOURCE_COLUMNS}
       FROM knowledge_source_bindings binding
       JOIN knowledge_sources source ON source.id=binding.source_id AND source.company_id=binding.company_id
      WHERE binding.company_id=$1 AND binding.scope_type='ORGANIZATION'
        AND source.deleted_at IS NULL
      ORDER BY binding.created_at DESC`,
    [companyId],
  )
  return rows
}

export async function promoteOrganizationKnowledgeSource(db: Queryable, input: {
  id: string
  companyId: string
  sourceId: string
  actorId: string
}): Promise<boolean | null> {
  const result = await db.query(
    `INSERT INTO knowledge_source_bindings(id,company_id,source_id,scope_type,project_id,created_by)
     SELECT $1,source.company_id,source.id,'ORGANIZATION',NULL,$4
       FROM knowledge_sources source
       JOIN projects origin ON origin.id=source.project_id AND origin.company_id=source.company_id
       JOIN companies company ON company.id=source.company_id AND company.type='EDUCATION'
      WHERE source.id=$3 AND source.company_id=$2 AND source.status='ready'
        AND source.deleted_at IS NULL AND origin.kind='INSTITUTIONAL_COURSE'
     ON CONFLICT DO NOTHING`,
    [input.id, input.companyId, input.sourceId, input.actorId],
  )
  if ((result.rowCount ?? 0) === 1) return true
  const { rows } = await db.query(
    `SELECT 1 FROM knowledge_source_bindings
      WHERE id=$1 AND company_id=$2 AND source_id=$3 AND scope_type='ORGANIZATION'`,
    [input.id, input.companyId, input.sourceId],
  )
  return rows[0] ? false : null
}

export async function attachOrganizationKnowledgeSource(db: Queryable, input: {
  id: string
  companyId: string
  projectId: string
  sourceId: string
  actorId: string
}): Promise<boolean | null> {
  const result = await db.query(
    `INSERT INTO knowledge_source_bindings(id,company_id,source_id,scope_type,project_id,created_by)
     SELECT $1,organization.company_id,organization.source_id,'COURSE',target.id,$5
       FROM knowledge_source_bindings organization
       JOIN knowledge_sources source ON source.id=organization.source_id
        AND source.company_id=organization.company_id AND source.deleted_at IS NULL
       JOIN projects target ON target.id=$3 AND target.company_id=organization.company_id
        AND target.kind='INSTITUTIONAL_COURSE' AND target.status IN ('DRAFT','ACTIVE')
      WHERE organization.company_id=$2 AND organization.source_id=$4
        AND organization.scope_type='ORGANIZATION' AND target.id<>source.project_id
     ON CONFLICT DO NOTHING`,
    [input.id, input.companyId, input.projectId, input.sourceId, input.actorId],
  )
  if ((result.rowCount ?? 0) === 1) return true
  const { rows } = await db.query(
    `SELECT 1 FROM knowledge_source_bindings
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND source_id=$4 AND scope_type='COURSE'`,
    [input.id, input.companyId, input.projectId, input.sourceId],
  )
  return rows[0] ? false : null
}
