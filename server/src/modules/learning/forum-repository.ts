import type { Queryable } from '../../db/queryable.js'
import type { ForumQuery, ForumTarget, LearningAttachment } from './forum-contracts.js'

export interface ForumItem {
  id: string
  targetType: ForumTarget
  kind: 'share' | 'resource' | 'case' | 'assignment'
  title: string
  body: string
  authorId: string
  authorName: string
  createdAt: string
  tags: string[]
  links: string[]
  attachments: LearningAttachment[]
  sourceId: string | null
  dueAt: string | null
  status: string | null
  pinned: boolean
  official: boolean
  featured: boolean
  commentCount: number
}

const itemsSql = `WITH items AS (
  SELECT p.id,'post'::text AS target_type,p.kind,p.title,p.body,p.author_user_id AS author_id,
    p.created_at,p.tags,p.links,p.attachments,p.source_id,NULL::timestamptz AS due_at,NULL::text AS status
  FROM course_forum_posts p
  WHERE p.company_id=$1 AND p.project_id=$2 AND (p.source_id IS NULL OR EXISTS (
    SELECT 1 FROM knowledge_sources s WHERE s.id=p.source_id AND s.company_id=p.company_id
      AND s.project_id=p.project_id AND s.visibility_scope='PROJECT' AND s.deleted_at IS NULL))
  UNION ALL
  SELECT a.id,'activity','assignment',a.title,a.instructions,a.created_by,
    COALESCE(a.published_at,a.created_at),'{}'::text[],'[]'::jsonb,'[]'::jsonb,NULL,a.due_at,a.status
  FROM learning_activities a WHERE a.company_id=$1 AND a.project_id=$2 AND a.status IN ('PUBLISHED','CLOSED')
  UNION ALL
  SELECT s.id,'source','resource',s.title,''::text,s.created_by_user_id,s.created_at,'{}'::text[],
    CASE WHEN s.original_url ~ '^https?://' THEN jsonb_build_array(s.original_url) ELSE '[]'::jsonb END,
    CASE WHEN s.storage_key IS NOT NULL THEN jsonb_build_array(jsonb_build_object('key',s.storage_key,'name',s.title)) ELSE '[]'::jsonb END,
    s.id,NULL::timestamptz,NULL::text
  FROM knowledge_sources s WHERE s.company_id=$1 AND s.project_id=$2 AND s.visibility_scope='PROJECT' AND s.deleted_at IS NULL
)
SELECT i.id,i.target_type AS "targetType",i.kind,i.title,i.body,i.author_id AS "authorId",
  COALESCE(u.display_name,'课程成员') AS "authorName",i.created_at AS "createdAt",i.tags,i.links,i.attachments,
  i.source_id AS "sourceId",i.due_at AS "dueAt",i.status,
  COALESCE(f.pinned,FALSE) AS pinned,COALESCE(f.official,FALSE) AS official,COALESCE(f.featured,FALSE) AS featured,
  (SELECT COUNT(*)::int FROM course_forum_comments c WHERE c.company_id=$1 AND c.project_id=$2
    AND c.target_type=i.target_type AND c.target_id=i.id) AS "commentCount"
FROM items i LEFT JOIN users u ON u.id=i.author_id
LEFT JOIN course_forum_flags f ON f.company_id=$1 AND f.project_id=$2 AND f.target_type=i.target_type AND f.target_id=i.id`

export async function listForumItems(db: Queryable, companyId: string, projectId: string, query: ForumQuery,
  target?: { type: ForumTarget; id: string }): Promise<ForumItem[]> {
  const { rows } = await db.query<ForumItem>(`${itemsSql}
    WHERE ($3='all' OR i.kind=$3) AND ($4='' OR POSITION(LOWER($4) IN LOWER(i.title||' '||i.body))>0)
      AND ($5='' OR $5=ANY(i.tags)) AND ($6::text IS NULL OR (i.target_type=$6 AND i.id=$7))
    ORDER BY COALESCE(f.pinned,FALSE) DESC,i.created_at DESC,i.target_type,i.id DESC LIMIT 51 OFFSET $8`,
  [companyId,projectId,query.kind ?? 'all',query.search ?? '',query.tag ?? '',target?.type ?? null,target?.id ?? null,query.offset ?? 0])
  return rows
}

export async function listSubmissionVersions(db: Queryable, companyId: string, projectId: string,
  activityId: string, learnerId: string | null, offset: number) {
  const { rows } = await db.query<{
    id: string; learnerId: string; learnerName: string; submittedAt: string; version: number
    source: 'STUDENT_ORIGINAL' | 'AGENT_RELAY' | 'AGENT_GENERATED'; agentId: string | null; agentWorkId: string | null
    late: boolean; answer: string; links: string[]; attachments: LearningAttachment[]
  }>(`SELECT a.id,a.learner_id AS "learnerId",u.display_name AS "learnerName",a.submitted_at AS "submittedAt",
      (ROW_NUMBER() OVER (PARTITION BY a.learner_id ORDER BY a.submitted_at,a.id))::int AS version,
      a.source,a.submitted_by_agent AS "agentId",a.agent_work_id AS "agentWorkId",a.late,
      COALESCE(e.data->>'answer','') AS answer,COALESCE(e.data->'links','[]') AS links,COALESCE(e.data->'attachments','[]') AS attachments
    FROM learning_attempts a JOIN evidence_records e ON e.company_id=a.company_id AND e.project_id=a.project_id AND e.id=a.evidence_id
    JOIN users u ON u.id=a.learner_id
    WHERE a.company_id=$1 AND a.project_id=$2 AND a.activity_id=$3 AND ($4::text IS NULL OR a.learner_id=$4)
    ORDER BY a.submitted_at DESC,a.id DESC LIMIT 51 OFFSET $5`, [companyId,projectId,activityId,learnerId,offset])
  return rows
}
