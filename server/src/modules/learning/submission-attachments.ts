import type { Queryable } from '../../db/queryable.js'
import { normalizeStorageKey } from '../../storage.js'
import { createPermissionService } from '../access/public.js'
import { LearningApplicationError } from './errors.js'
import type { LearningAttachment } from './forum-contracts.js'
import { documentFileUrls, type ContentDocument } from '../content-editor/contracts.js'

/** Native media uses the same explicit, owned attachment manifest as legacy content. */
export function assertDocumentAttachments(attachments: LearningAttachment[], ...documents: (ContentDocument | null | undefined)[]) {
  const keys = new Set(attachments.map(file => file.key))
  for (const url of documents.flatMap(documentFileUrls)) {
    const parsed = new URL(url, 'https://content.invalid')
    if (/^https?:\/\//i.test(url) && parsed.pathname !== '/api/files') continue
    const key = parsed.pathname === '/api/files' ? parsed.searchParams.get('key') : null
    if (!key || !keys.has(key)) throw new LearningApplicationError('invalid', '正文附件必须保留在当前内容的附件列表中')
  }
}

export async function assertOwnedLearningAttachments(db: Queryable,
  scope: { companyId: string; userId: string }, attachments: LearningAttachment[]): Promise<void> {
  const keys = [...new Set(attachments.map(file => file.key))]
  if (!keys.length) return
  if (keys.length !== attachments.length || keys.some(key => normalizeStorageKey(key) !== key)) {
    throw new LearningApplicationError('invalid', 'invalid or duplicate attachment key')
  }
  const { rows } = await db.query(`SELECT f.storage_key FROM uploaded_files f
    JOIN company_memberships m ON m.company_id=f.company_id AND m.user_id=f.owner_user_id AND m.period_id=f.company_period_id
    WHERE f.company_id=$1 AND f.owner_user_id=$2 AND f.storage_key=ANY($3::text[]) AND f.document_id IS NULL
      AND m.status='ACTIVE' AND m.ended_at IS NULL FOR SHARE OF f,m`, [scope.companyId,scope.userId,keys])
  if (rows.length !== keys.length) throw new LearningApplicationError('forbidden', 'attachments must belong to the submitting member')
}

/** null means no learning binding; bound files must use the current course grants. */
export async function canReadLearningFile(db: Queryable, key: string, userId: string): Promise<boolean | null> {
  const { rows } = await db.query<{ company_id: string; project_id: string; learner_id: string | null; visible: boolean; reviewable: boolean }>(`
    SELECT DISTINCT a.company_id,a.project_id,a.learner_id,TRUE AS visible,TRUE AS reviewable FROM course_forum_submissions a
    WHERE a.attachments @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT s.company_id,s.project_id,s.learner_id,TRUE,TRUE
      FROM course_forum_feedback f JOIN course_forum_submissions s
        ON s.company_id=f.company_id AND s.project_id=f.project_id AND s.id=f.submission_id
      WHERE f.attachments @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT s.company_id,s.project_id,s.learner_id,TRUE,TRUE
      FROM homework_teacher_decisions d JOIN homework_submissions s
        ON s.company_id=d.company_id AND s.homework_id=d.homework_id AND s.learner_id=d.learner_id AND s.id=d.submission_id
      WHERE d.attachments @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT p.company_id,p.project_id,NULL,(p.deleted_at IS NULL AND p.status IN ('PUBLISHED','CLOSED') AND (p.source_id IS NULL OR EXISTS (
      SELECT 1 FROM knowledge_sources s WHERE s.company_id=p.company_id AND s.project_id=p.project_id AND s.id=p.source_id
        AND s.visibility_scope='PROJECT' AND s.deleted_at IS NULL))) AS visible,TRUE
    FROM course_forum_posts p WHERE p.attachments @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT c.company_id,c.project_id,NULL,CASE c.target_type
      WHEN 'homework' THEN c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM homeworks h WHERE h.company_id=c.company_id AND h.project_id=c.project_id AND h.id=c.target_id AND h.status IN ('PUBLISHED','CLOSED'))
      WHEN 'post' THEN c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM course_forum_posts p WHERE p.company_id=c.company_id AND p.project_id=c.project_id
        AND p.id=c.target_id AND p.deleted_at IS NULL AND p.status IN ('PUBLISHED','CLOSED') AND (p.source_id IS NULL OR EXISTS (SELECT 1 FROM knowledge_sources s
          WHERE s.company_id=p.company_id AND s.project_id=p.project_id AND s.id=p.source_id
            AND s.visibility_scope='PROJECT' AND s.deleted_at IS NULL)))
      ELSE FALSE END AS visible,TRUE
    FROM course_forum_comments c WHERE c.attachments @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT h.company_id,h.project_id,CASE WHEN h.status='DRAFT' THEN h.created_by ELSE NULL END,TRUE,h.status<>'DRAFT'
      FROM homeworks h WHERE h.attachments @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT s.company_id,s.project_id,s.learner_id,TRUE,FALSE FROM homework_learner_state s
      WHERE s.answer->'attachments' @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT s.company_id,s.project_id,s.learner_id,TRUE,TRUE FROM homework_submissions s
      WHERE s.answer->'attachments' @> jsonb_build_array(jsonb_build_object('key',$1::text))`, [key])
  if (!rows.length) {
    const retired = await db.query('SELECT 1 FROM course_forum_retirement_files WHERE storage_key=$1',[key])
    return retired.rows.length ? false : null
  }
  const permissions = createPermissionService(db)
  for (const row of rows) {
    if (!row.visible) continue
    const request = { actorUserId: userId,companyId: row.company_id,projectId: row.project_id,
      resource: { type: 'project' as const,id: row.project_id } }
    if (!(await permissions.can({ ...request,action: 'learning:read' })).allowed) continue
    if (row.learner_id === null || row.learner_id === userId
      || row.reviewable && (await permissions.can({ ...request,action: 'learning:review' })).allowed) return true
  }
  return false
}
