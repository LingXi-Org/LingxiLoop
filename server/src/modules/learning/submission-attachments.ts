import type { Queryable } from '../../db/queryable.js'
import { normalizeStorageKey } from '../../storage.js'
import { createPermissionService } from '../access/public.js'
import { LearningApplicationError } from './errors.js'
import type { LearningAttachment } from './forum-contracts.js'

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
  const { rows } = await db.query<{ company_id: string; project_id: string; learner_id: string | null; visible: boolean; reviewable:boolean }>(`
    SELECT DISTINCT a.company_id,a.project_id,a.learner_id,TRUE AS visible,TRUE AS reviewable FROM evidence_records e
    JOIN learning_attempts a ON a.company_id=e.company_id AND a.project_id=e.project_id AND a.evidence_id=e.id
    WHERE e.data->'attachments' @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT p.company_id,p.project_id,NULL,(p.source_id IS NULL OR EXISTS (
      SELECT 1 FROM knowledge_sources s WHERE s.company_id=p.company_id AND s.project_id=p.project_id AND s.id=p.source_id
        AND s.visibility_scope='PROJECT' AND s.deleted_at IS NULL)) AS visible,TRUE
    FROM course_forum_posts p WHERE p.attachments @> jsonb_build_array(jsonb_build_object('key',$1::text))
    UNION SELECT c.company_id,c.project_id,NULL,CASE c.target_type
      WHEN 'source' THEN EXISTS (SELECT 1 FROM knowledge_sources s WHERE s.company_id=c.company_id AND s.project_id=c.project_id
        AND s.id=c.target_id AND s.visibility_scope='PROJECT' AND s.deleted_at IS NULL)
      WHEN 'activity' THEN EXISTS (SELECT 1 FROM learning_activities a WHERE a.company_id=c.company_id AND a.project_id=c.project_id
        AND a.id=c.target_id AND a.status IN ('PUBLISHED','CLOSED'))
      WHEN 'homework' THEN EXISTS (SELECT 1 FROM homeworks h WHERE h.company_id=c.company_id AND h.project_id=c.project_id
        AND h.id=c.target_id AND h.status IN ('PUBLISHED','CLOSED'))
      WHEN 'post' THEN EXISTS (SELECT 1 FROM course_forum_posts p WHERE p.company_id=c.company_id AND p.project_id=c.project_id
        AND p.id=c.target_id AND (p.source_id IS NULL OR EXISTS (SELECT 1 FROM knowledge_sources s
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
  if (!rows.length) return null
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
