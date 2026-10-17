import type { Queryable } from '../../db/queryable.js'
import type { ForumQuery, ForumTarget, LearningAttachment } from './forum-contracts.js'
export interface ForumItem {
  id: string; targetType: ForumTarget; kind: 'share' | 'assignment'; title: string; body: string
  authorId: string; authorName: string; authorAvatarUrl: string | null; createdAt: string; updatedAt: string; tags: string[]; links: string[]; attachments: LearningAttachment[]
  sourceId: string | null; dueAt: string | null; status: string; pinned: boolean; archived: boolean; commentCount: number; reactions: { emoji: string; userIds: string[] }[]
}
export async function listForumItems(db: Queryable, companyId: string, projectId: string, query: ForumQuery,
  target?: { type: ForumTarget; id: string }): Promise<ForumItem[]> {
  const { rows } = await db.query<ForumItem>(`WITH items AS (
    SELECT p.id,p.company_id,p.project_id,p.author_user_id,p.kind,p.title,p.body,p.tags,p.links,p.attachments,p.source_id,p.created_at,p.updated_at,p.due_at,p.status,p.archived,p.deleted_at,'post'::text AS target_type FROM course_forum_posts p
    UNION ALL
    SELECT h.id,h.company_id,h.project_id,h.created_by,'assignment',h.title,h.instructions,'{}'::text[],
      h.links,h.attachments,NULL,h.published_at,h.updated_at
      ,h.due_at,h.status,FALSE,NULL,'homework'
    FROM homeworks h WHERE h.company_id=$1 AND h.project_id=$2
  ) SELECT p.id,p.target_type AS "targetType",p.kind,p.title,p.body,p.author_user_id AS "authorId",
    COALESCE(u.display_name,'课程成员') AS "authorName",u.avatar_url AS "authorAvatarUrl",p.created_at AS "createdAt",p.updated_at AS "updatedAt",p.tags,p.links,p.attachments,
    p.source_id AS "sourceId",p.due_at AS "dueAt",p.status,COALESCE(f.pinned,FALSE) AS pinned,CASE WHEN p.target_type='homework' THEN COALESCE(f.archived,FALSE) ELSE p.archived END AS archived,
    (SELECT COUNT(*)::int FROM course_forum_comments c WHERE c.company_id=p.company_id AND c.project_id=p.project_id AND c.target_type=p.target_type AND c.target_id=p.id AND c.deleted_at IS NULL) AS "commentCount",
    COALESCE((SELECT jsonb_agg(jsonb_build_object('emoji',r.emoji,'userIds',r.users)) FROM
      (SELECT emoji,jsonb_agg(user_id ORDER BY user_id) AS users FROM course_forum_reactions
       WHERE p.target_type='post' AND company_id=p.company_id AND project_id=p.project_id AND post_id=p.id GROUP BY emoji) r),'[]') AS reactions
    FROM items p LEFT JOIN users u ON u.id=p.author_user_id
    LEFT JOIN course_forum_flags f ON f.company_id=p.company_id AND f.project_id=p.project_id AND f.target_type=p.target_type AND f.target_id=p.id
    WHERE p.company_id=$1 AND p.project_id=$2 AND p.deleted_at IS NULL AND p.status IN ('PUBLISHED','CLOSED')
      AND ($3='all' OR p.kind=$3) AND ($4='' OR POSITION(LOWER($4) IN LOWER(p.title||' '||p.body))>0)
      AND ($5='' OR $5=ANY(p.tags)) AND ($6::text IS NULL OR (p.id=$6 AND p.target_type=$12))
      AND ($6::text IS NOT NULL OR (CASE WHEN p.target_type='homework' THEN COALESCE(f.archived,FALSE) ELSE p.archived END)=$7)
      AND (p.source_id IS NULL OR EXISTS(SELECT 1 FROM knowledge_sources s WHERE s.id=p.source_id AND s.company_id=p.company_id
        AND s.project_id=p.project_id AND s.visibility_scope='PROJECT' AND s.deleted_at IS NULL))
      AND ($9::timestamptz IS NULL OR p.created_at >= $9) AND ($10::timestamptz IS NULL OR p.created_at < $10)
      AND ($11='all' OR ($11='pinned' AND COALESCE(f.pinned,FALSE)) OR ($11='attachments' AND jsonb_array_length(p.attachments)>0)
        OR ($11='links' AND (jsonb_array_length(p.links)>0 OR p.body ~ 'https?://'))
        OR ($11='tasks' AND p.body ~ '(^|\n) *[-*+] \\[([ xX])\\]') OR ($11='code' AND POSITION(repeat(chr(96),3) IN p.body)>0))
    ORDER BY COALESCE(f.pinned,FALSE) DESC,${query.timeBasis === 'updated' ? 'p.updated_at' : 'p.created_at'} ${query.order === 'asc' ? 'ASC' : 'DESC'},p.id ${query.order === 'asc' ? 'ASC' : 'DESC'} LIMIT 51 OFFSET $8`,
  [companyId,projectId,query.kind ?? 'all',query.search ?? '',query.tag ?? '',target?.id ?? null,query.archived === 'true',query.offset ?? 0,query.from ?? null,query.until ?? null,query.property ?? 'all',target?.type ?? null])
  return rows
}
export async function listSubmissionVersions(db: Queryable, companyId: string, projectId: string, assignmentId: string, learnerId: string | null, offset: number) {
  const { rows } = await db.query(`SELECT s.id,s.learner_id AS "learnerId",u.display_name AS "learnerName",u.avatar_url AS "learnerAvatarUrl",s.submitted_at AS "submittedAt",
    (ROW_NUMBER() OVER (PARTITION BY s.learner_id ORDER BY s.submission_sequence))::int AS version,
    s.source,s.submitted_by_agent AS "agentId",s.agent_work_id AS "agentWorkId",s.late,s.answer,s.links,s.attachments,s.conversation_references AS "conversationReferences",
    COALESCE(s.assessment,(SELECT jsonb_build_object('status',CASE e.status WHEN 'failed' THEN 'FAILED' ELSE 'PENDING' END) FROM learning_effects e
      WHERE e.company_id=s.company_id AND e.kind='forum.assess' AND e.effect_key=s.id)) AS assessment,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'body',f.body,'authorId',f.author_id,'kind',COALESCE(f.legacy_record->>'evaluator_kind','TEACHER'),'status',COALESCE(f.legacy_record->>'status','ACCEPTED'),'createdAt',f.created_at) ORDER BY f.created_at,f.id)
      FROM course_forum_feedback f WHERE f.company_id=s.company_id AND f.project_id=s.project_id AND f.submission_id=s.id),'[]') AS feedback
    FROM course_forum_submissions s JOIN users u ON u.id=s.learner_id
    WHERE s.company_id=$1 AND s.project_id=$2 AND s.assignment_id=$3 AND ($4::text IS NULL OR s.learner_id=$4)
    ORDER BY s.submission_sequence DESC LIMIT 51 OFFSET $5`, [companyId,projectId,assignmentId,learnerId,offset])
  return rows
}

export async function listSubmissionStudents(db: Queryable, companyId: string, projectId: string, assignmentId: string, offset: number, search: string) {
  const {rows}=await db.query(`WITH versions AS (
    SELECT s.*,ROW_NUMBER() OVER(PARTITION BY learner_id ORDER BY submission_sequence DESC) AS latest,
      COUNT(*) OVER(PARTITION BY learner_id)::int AS version
    FROM course_forum_submissions s WHERE company_id=$1 AND project_id=$2 AND assignment_id=$3
  ) SELECT s.id,s.learner_id AS "learnerId",u.display_name AS "learnerName",u.avatar_url AS "learnerAvatarUrl",s.submitted_at AS "submittedAt",s.version,
    COALESCE(s.assessment,(SELECT jsonb_build_object('status',CASE e.status WHEN 'failed' THEN 'FAILED' ELSE 'PENDING' END)
      FROM learning_effects e WHERE e.company_id=s.company_id AND e.kind='forum.assess' AND e.effect_key=s.id)) AS assessment,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('title',r->>'title','index',n-1)),'[]')
      FROM jsonb_array_elements(s.conversation_references) WITH ORDINALITY AS refs(r,n)) AS "conversationReferences"
    FROM versions s JOIN users u ON u.id=s.learner_id WHERE latest=1
      AND ($5='' OR POSITION(LOWER($5) IN LOWER(u.display_name||' '||u.id))>0)
    ORDER BY s.submission_sequence DESC LIMIT 51 OFFSET $4`,[companyId,projectId,assignmentId,offset,search])
  return rows
}
