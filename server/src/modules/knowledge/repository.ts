import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type { ProjectPatch } from './contracts.js'

const SOURCE_LIST_SELECT = `source.id,source.kind,source.title,source.mime_type AS "mimeType",
  source.size_bytes AS "sizeBytes",source.original_url AS "originalUrl",source.status,source.stage,
  source.error,source.is_truncated AS "isTruncated",source.created_by AS "createdBy",
  source.created_at AS "createdAt",source.updated_at AS "updatedAt",
  source.origin_client_msg_no AS "originClientMsgNo",source.external_chunk_count AS "chunkCount"`

const SOURCE_DETAIL_SELECT = `source.id,source.kind,source.title,source.mime_type AS "mimeType",
  source.size_bytes AS "sizeBytes",source.original_url AS "originalUrl",source.storage_key AS "storageKey",
  source.status,source.stage,source.error,source.is_truncated AS "isTruncated",
  source.created_by AS "createdBy",source.created_at AS "createdAt",source.updated_at AS "updatedAt"`

export interface KnowledgeSourceRow extends Record<string, unknown> {
  id: string
  kind: string
  status: string
  storageKey: string | null
  createdBy: string
  sizeBytes: number
}

export async function listProjects(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT project.id,project.name,project.description,project.color,project.status,
            project.created_by AS "createdBy",project.is_general AS "isGeneral",
            project.created_at AS "createdAt",project.updated_at AS "updatedAt",
            project.archived_at AS "archivedAt",visit.visited_at AS "lastVisitedAt",
            (SELECT COUNT(*)::int FROM conversations WHERE project_id=project.id AND company_id=project.company_id) AS "conversationCount",
            (SELECT COUNT(*)::int FROM knowledge_sources WHERE project_id=project.id AND company_id=project.company_id AND deleted_at IS NULL) AS "sourceCount",
            (SELECT COUNT(*)::int FROM documents WHERE project_id=project.id AND company_id=project.company_id) AS "documentCount",
            (SELECT COUNT(*)::int FROM boards WHERE project_id=project.id AND company_id=project.company_id) AS "boardCount",
            (SELECT COUNT(*)::int FROM calendar_events WHERE project_id=project.id AND company_id=project.company_id) AS "calendarEventCount",
            (SELECT COUNT(*)::int FROM canvases WHERE project_id=project.id AND company_id=project.company_id) AS "canvasCount",
            (membership.role IN ('OWNER','ADMIN') OR course_member.role IN ('OWNER','TEACHER')) AS "canManage",
            course.id AS "courseId",
            CASE WHEN course_member.role IS NULL THEN NULL
                 WHEN course_member.role IN ('STUDENT','OBSERVER') THEN 'learner' ELSE 'teacher' END AS "courseRole",
            course.study_room_conversation_id AS "studyRoomId"
       FROM projects project
       JOIN company_memberships membership ON membership.company_id=project.company_id AND membership.user_id=$2
        AND membership.status='ACTIVE'
       LEFT JOIN courses course ON course.project_id=project.id AND course.company_id=project.company_id
       LEFT JOIN project_memberships course_member
         ON course_member.project_id=project.id AND course_member.company_id=project.company_id
        AND course_member.user_id=$2 AND course_member.status='ACTIVE'
       LEFT JOIN project_visits visit ON visit.project_id=project.id AND visit.user_id=$2
      WHERE project.company_id=$1
        AND (project.is_general=TRUE OR membership.role IN ('OWNER','ADMIN') OR course_member.user_id IS NOT NULL)
      ORDER BY project.status,visit.visited_at DESC NULLS LAST,project.updated_at DESC`,
    [companyId, userId],
  )
  return rows
}

export async function insertProject(db: Queryable, args: {
  id: string; companyId: string; userId: string; name: string; description: string; color: string | null
}): Promise<void> {
  await db.query(
    `INSERT INTO projects (id,company_id,name,description,color,created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
    [args.id, args.companyId, args.name, args.description, args.color, args.userId],
  )
  await db.query(
    `INSERT INTO project_memberships (project_id,company_id,user_id,role) VALUES ($1,$2,$3,'OWNER')`,
    [args.id, args.companyId, args.userId],
  )
}

export async function updateProject(
  db: Queryable,
  companyId: string,
  projectId: string,
  patch: ProjectPatch,
): Promise<boolean> {
  const values: unknown[] = []
  const sets: string[] = []
  for (const [field, column] of Object.entries({ name: 'name', description: 'description', color: 'color' }) as Array<[keyof ProjectPatch, string]>) {
    if (!Object.hasOwn(patch, field)) continue
    values.push(patch[field])
    sets.push(`${column}=$${values.length}`)
  }
  values.push(projectId, companyId)
  const result = await db.query(
    `UPDATE projects SET ${sets.join(',')},updated_at=NOW()
      WHERE id=$${values.length - 1} AND company_id=$${values.length}`,
    values,
  )
  return (result.rowCount ?? 0) > 0
}

export async function setProjectArchived(db: Queryable, companyId: string, projectId: string, archive: boolean): Promise<void> {
  await db.query(
    `UPDATE projects SET status=$3,archived_at=CASE WHEN $3='archived' THEN NOW() ELSE NULL END,updated_at=NOW()
      WHERE id=$1 AND company_id=$2`,
    [projectId, companyId, archive ? 'archived' : 'active'],
  )
}

export async function recordProjectVisit(db: Queryable, companyId: string, projectId: string, userId: string): Promise<void> {
  await db.query(
    `INSERT INTO project_visits (project_id,user_id,visited_at)
     SELECT project.id,$3,NOW() FROM projects project
     JOIN company_memberships membership ON membership.company_id=project.company_id AND membership.user_id=$3
       AND membership.status='ACTIVE'
      WHERE project.id=$2 AND project.company_id=$1
     ON CONFLICT (project_id,user_id) DO UPDATE SET visited_at=NOW()`,
    [companyId, projectId, userId],
  )
}

export async function listSources(db: Queryable, companyId: string, projectId: string) {
  const { rows } = await db.query(
    `SELECT ${SOURCE_LIST_SELECT} FROM knowledge_sources source
      WHERE source.company_id=$1 AND source.project_id=$2 AND source.deleted_at IS NULL
      ORDER BY source.created_at DESC`,
    [companyId, projectId],
  )
  return rows
}

export async function listConversationSources(
  db: Queryable,
  args: { companyId: string; projectId: string; conversationId: string },
) {
  const { rows } = await db.query(
    `SELECT ${SOURCE_LIST_SELECT},(exclusion.source_id IS NULL) AS enabled
       FROM knowledge_sources source
       LEFT JOIN conversation_source_exclusions exclusion
         ON exclusion.source_id=source.id AND exclusion.conversation_id=$3
      WHERE source.company_id=$1 AND source.project_id=$2 AND source.deleted_at IS NULL
      ORDER BY source.created_at DESC`,
    [args.companyId, args.projectId, args.conversationId],
  )
  return rows
}

export async function findSource(
  db: Queryable,
  companyId: string,
  projectId: string,
  sourceId: string,
): Promise<KnowledgeSourceRow | null> {
  const { rows } = await db.query<KnowledgeSourceRow>(
    `SELECT ${SOURCE_DETAIL_SELECT} FROM knowledge_sources source
      WHERE source.id=$1 AND source.company_id=$2 AND source.project_id=$3 AND source.deleted_at IS NULL`,
    [sourceId, companyId, projectId],
  )
  return rows[0] ?? null
}

export async function insertSource(db: Queryable, args: {
  id: string; companyId: string; projectId: string; conversationId: string | null
  kind: 'text' | 'url' | 'file'; title: string; mime: string | null; size: number
  storageKey: string | null; originalUrl: string | null; status: 'queued' | 'upload_pending'; userId: string
}): Promise<void> {
  await db.query(
    `INSERT INTO knowledge_sources
       (id,company_id,project_id,conversation_id,kind,title,mime_type,size_bytes,storage_key,original_url,status,stage,created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$12)`,
    [args.id, args.companyId, args.projectId, args.conversationId, args.kind, args.title,
      args.mime, args.size, args.storageKey, args.originalUrl, args.status, args.userId],
  )
}

export async function enqueueSourceJob(db: Queryable, sourceId: string): Promise<void> {
  await db.query(
    `INSERT INTO knowledge_source_jobs (id, source_id, status, available_at)
     VALUES ($1,$2,'queued',NOW())
     ON CONFLICT (source_id) DO UPDATE SET status='queued',available_at=NOW(),leased_until=NULL,leased_by=NULL,
       last_error=NULL,updated_at=NOW()`,
    [`ksj-${randomUUID()}`, sourceId],
  )
  await db.query(
    `UPDATE knowledge_sources SET status='queued',stage='queued',error=NULL,updated_at=NOW()
      WHERE id=$1 AND deleted_at IS NULL`,
    [sourceId],
  )
}

export async function replaceSourceExclusions(
  db: Queryable,
  args: { companyId: string; projectId: string; conversationId: string; userId: string; sourceIds: string[] },
): Promise<string[]> {
  await db.query(
    `DELETE FROM conversation_source_exclusions exclusion
      USING conversations conversation
     WHERE exclusion.conversation_id=$1 AND conversation.id=exclusion.conversation_id
       AND conversation.company_id=$2 AND conversation.project_id=$3`,
    [args.conversationId, args.companyId, args.projectId],
  )
  if (args.sourceIds.length === 0) return []
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO conversation_source_exclusions (conversation_id,source_id,created_by)
     SELECT $1,source.id,$4 FROM knowledge_sources source
     JOIN conversations conversation
       ON conversation.id=$1 AND conversation.company_id=$2 AND conversation.project_id=$3
      WHERE source.company_id=$2 AND source.project_id=$3 AND source.id=ANY($5::text[]) AND source.deleted_at IS NULL
     RETURNING source_id AS id`,
    [args.conversationId, args.companyId, args.projectId, args.userId, args.sourceIds],
  )
  return rows.map((row) => row.id)
}

export async function moveConversation(
  db: Queryable,
  args: { companyId: string; conversationId: string; userId: string; projectId: string },
): Promise<'not_found' | 'not_member' | 'updated'> {
  const { rows } = await db.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [args.conversationId, args.companyId],
  )
  if (!rows[0]) return 'not_found'
  if (!rows[0].members.includes(args.userId)) return 'not_member'
  await db.query(
    `UPDATE conversations SET project_id=$3,updated_at=NOW() WHERE id=$1 AND company_id=$2`,
    [args.conversationId, args.companyId, args.projectId],
  )
  return 'updated'
}
