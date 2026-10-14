import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type { LearningScope } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import { forumCommentSchema, forumFlagsSchema, forumPostSchema, forumQuerySchema, forumSubmissionSchema, forumFeedbackSchema, forumReactionSchema, type ForumCommentInput, type ForumFlags, type ForumPostInput, type ForumQuery, type ForumTarget, type LearningAttachment } from './forum-contracts.js'
import { listForumItems, listSubmissionVersions } from './forum-repository.js'
import { requireLearningCourseProjectScope } from './project-scope-repository.js'
import { assertOwnedLearningAttachments } from './submission-attachments.js'
export { canReadLearningFile } from './submission-attachments.js'

type Transaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>
const page = <T>(rows: T[], offset: number) => ({ items: rows.slice(0, 50), nextOffset: rows.length > 50 ? offset + 50 : null })

export class ForumApplication {
  constructor(private readonly db: Queryable, private readonly transaction: Transaction) {}

  private async scope(db: Queryable, scope: LearningScope, courseId: string, mode: 'read' | 'write' | 'manage' = 'read') {
    const permissions = createPermissionService(db, { lockDependencies: mode !== 'read' })
    const request = { actorUserId: scope.userId,companyId: scope.companyId,resource: { type: 'course' as const,id: courseId } }
    await permissions.assertCan({ ...request,action: 'learning:read' })
    if (mode === 'manage') await permissions.assertCan({ ...request,action: 'learning:manage' })
    if (mode === 'write' && !(await permissions.can({ ...request,action: 'learning:manage' })).allowed) {
      await permissions.assertCan({ ...request,action: 'learning:submit' })
    }
    return requireLearningCourseProjectScope(db, scope.companyId, courseId)
  }

  private async item(db: Queryable, companyId: string, projectId: string, type: ForumTarget, id: string) {
    const item = (await listForumItems(db, companyId, projectId, {}, { type,id }))[0]
    if (!item) throw new LearningApplicationError('not_found', 'forum content not found')
    return item
  }

  async list(scope: LearningScope, courseId: string, query: ForumQuery) {
    const input = forumQuerySchema.parse(query)
    const project = await this.scope(this.db, scope, courseId)
    return page(await listForumItems(this.db, scope.companyId, project.projectId, input), input.offset)
  }

  async detail(scope: LearningScope, courseId: string, type: ForumTarget, id: string) {
    const project = await this.scope(this.db, scope, courseId)
    return this.item(this.db, scope.companyId, project.projectId, type, id)
  }

  async createPost(scope: LearningScope, courseId: string, input: ForumPostInput) {
    const data = forumPostSchema.parse(input), id = randomUUID()
    await this.transaction(async db => {
      const project = await this.scope(db, scope, courseId, data.kind === 'assignment' ? 'manage' : 'write')
      await this.reference(db, scope.companyId, project.projectId, data.sourceId)
      await assertOwnedLearningAttachments(db, scope, data.attachments)
      await db.query(`INSERT INTO course_forum_posts(id,company_id,project_id,author_user_id,kind,title,body,tags,links,attachments,source_id,due_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
      [id,scope.companyId,project.projectId,scope.userId,data.kind,data.title,data.body,[...new Set(data.tags)],
        JSON.stringify(data.links),JSON.stringify(data.attachments),data.sourceId ?? null,data.kind === 'assignment' ? data.dueAt ?? null : null])
    })
    return this.detail(scope, courseId, 'post', id)
  }

  async updateFlags(scope: LearningScope, courseId: string, type: ForumTarget, id: string, input: ForumFlags) {
    const flags = forumFlagsSchema.parse(input)
    await this.transaction(async db => {
      const project = await this.scope(db, scope, courseId, 'write')
      const item = await this.item(db, scope.companyId, project.projectId, type, id)
      if (flags.pinned !== undefined || item.authorId !== scope.userId) await this.scope(db,scope,courseId,'manage')
      if (type === 'post' && flags.archived !== undefined) await db.query('UPDATE course_forum_posts SET archived=$4,updated_at=NOW() WHERE company_id=$1 AND project_id=$2 AND id=$3', [scope.companyId,project.projectId,id,flags.archived])
      await db.query(`INSERT INTO course_forum_flags(company_id,project_id,target_type,target_id,pinned,archived,updated_by)
        VALUES ($1,$2,$3,$4,COALESCE($5,FALSE),COALESCE($6,FALSE),$7) ON CONFLICT(company_id,project_id,target_type,target_id)
        DO UPDATE SET pinned=COALESCE($5,course_forum_flags.pinned),archived=COALESCE($6,course_forum_flags.archived),updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [scope.companyId,project.projectId,type,id,flags.pinned ?? null,type === 'homework' ? flags.archived ?? null : null,scope.userId])
    })
    return this.detail(scope, courseId, type, id)
  }

  async comments(scope: LearningScope, courseId: string, type: ForumTarget, id: string, offset: number) {
    const project = await this.scope(this.db, scope, courseId)
    await this.item(this.db, scope.companyId, project.projectId, type, id)
    const { rows } = await this.db.query<{ id: string; authorId: string; authorName: string; body: string; links: string[]; attachments: LearningAttachment[]; createdAt: string }>(`
      SELECT c.id,c.author_user_id AS "authorId",u.display_name AS "authorName",c.body,c.links,c.attachments,c.created_at AS "createdAt"
      FROM course_forum_comments c JOIN users u ON u.id=c.author_user_id
      WHERE c.company_id=$1 AND c.project_id=$2 AND c.target_type=$3 AND c.target_id=$4 AND c.deleted_at IS NULL
      ORDER BY c.created_at,c.id LIMIT 51 OFFSET $5`, [scope.companyId,project.projectId,type,id,offset])
    return page(rows, offset)
  }

  async comment(scope: LearningScope, courseId: string, type: ForumTarget, id: string, input: string | ForumCommentInput) {
    const data = forumCommentSchema.parse(typeof input === 'string' ? { body: input } : input)
    return this.transaction(async db => {
      const project = await this.scope(db, scope, courseId, 'write')
      await this.item(db, scope.companyId, project.projectId, type, id)
      await assertOwnedLearningAttachments(db, scope, data.attachments)
      const commentId = randomUUID()
      await db.query(`INSERT INTO course_forum_comments(id,company_id,project_id,target_type,target_id,author_user_id,body,links,attachments)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb)`, [commentId,scope.companyId,project.projectId,type,id,scope.userId,data.body,
        JSON.stringify(data.links),JSON.stringify(data.attachments)])
      return { id: commentId }
    })
  }

  async submissions(scope: LearningScope, courseId: string, activityId: string, offset: number) {
    const project = await this.scope(this.db, scope, courseId)
    await this.item(this.db, scope.companyId, project.projectId, 'post', activityId)
    const teacher = (await createPermissionService(this.db).can({ actorUserId: scope.userId,companyId: scope.companyId,
      action: 'learning:review',resource: { type: 'course',id: courseId } })).allowed
    return page(await listSubmissionVersions(this.db, scope.companyId, project.projectId, activityId,
      teacher ? null : scope.userId, offset), offset)
  }

  private async reference(db: Queryable, companyId: string, projectId: string, sourceId?: string | null) {
    if (!sourceId) return
    const result = await db.query(`SELECT id FROM knowledge_sources WHERE company_id=$1 AND project_id=$2 AND id=$3
      AND visibility_scope='PROJECT' AND deleted_at IS NULL FOR SHARE`, [companyId,projectId,sourceId])
    if (!result.rows.length) throw new LearningApplicationError('not_found', 'reference not found')
  }

  async updatePost(scope: LearningScope, courseId: string, id: string, input: ForumPostInput) {
    const data = forumPostSchema.parse(input)
    await this.transaction(async db => {
      const project = await this.scope(db,scope,courseId,'write')
      const item = await this.item(db,scope.companyId,project.projectId,'post',id)
      if (item.authorId !== scope.userId) throw new LearningApplicationError('forbidden','only the author can edit a post')
      if (item.kind !== data.kind) throw new LearningApplicationError('invalid','post kind cannot change')
      if (item.kind === 'assignment') await this.scope(db,scope,courseId,'manage')
      await this.reference(db,scope.companyId,project.projectId,data.sourceId)
      // Existing attachments retain their ownership; newly attached files must be owned by this author.
      await assertOwnedLearningAttachments(db,scope,data.attachments)
      await db.query(`UPDATE course_forum_posts SET title=$4,body=$5,tags=$6,links=$7::jsonb,attachments=$8::jsonb,
        source_id=$9,due_at=$10,updated_at=NOW() WHERE company_id=$1 AND project_id=$2 AND id=$3`,
        [scope.companyId,project.projectId,id,data.title,data.body,[...new Set(data.tags)],JSON.stringify(data.links),
          JSON.stringify(data.attachments),data.sourceId ?? null,data.kind === 'assignment' ? data.dueAt ?? null : null])
    })
    return this.detail(scope,courseId,'post',id)
  }

  async deletePost(scope: LearningScope, courseId: string, id: string) {
    await this.transaction(async db => {
      const project = await this.scope(db,scope,courseId,'write')
      await db.query('SELECT id FROM course_forum_posts WHERE company_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE', [scope.companyId,project.projectId,id])
      const item = await this.item(db,scope.companyId,project.projectId,'post',id)
      if (item.authorId !== scope.userId) await this.scope(db,scope,courseId,'manage')
      if (item.kind === 'assignment') {
        await this.scope(db,scope,courseId,'manage')
        const submissions = await db.query('SELECT 1 FROM course_forum_submissions WHERE company_id=$1 AND project_id=$2 AND assignment_id=$3 LIMIT 1', [scope.companyId,project.projectId,id])
        if (submissions.rows.length) throw new LearningApplicationError('conflict','已有提交的作业请关闭或归档，提交历史必须保留。')
      }
      await db.query('UPDATE course_forum_posts SET deleted_at=NOW(),updated_at=NOW() WHERE company_id=$1 AND project_id=$2 AND id=$3', [scope.companyId,project.projectId,id])
    })
    return { ok: true }
  }

  async closeAssignment(scope: LearningScope, courseId: string, id: string) {
    await this.transaction(async db => {
      const project = await this.scope(db,scope,courseId,'manage')
      const result = await db.query(`UPDATE course_forum_posts SET status='CLOSED',updated_at=NOW()
        WHERE company_id=$1 AND project_id=$2 AND id=$3 AND kind='assignment' AND deleted_at IS NULL AND status='PUBLISHED' RETURNING id`,
        [scope.companyId,project.projectId,id])
      if (!result.rows.length) throw new LearningApplicationError('not_found','open assignment not found')
    })
    return { ok: true }
  }

  async submit(scope: LearningScope, courseId: string, id: string, input: unknown,
    agent?: { id: string; workId: string; source: 'AGENT_RELAY' | 'AGENT_GENERATED' }) {
    const data = forumSubmissionSchema.parse(input)
    return this.transaction(async db => {
      const project = await this.scope(db,scope,courseId)
      await createPermissionService(db,{ lockDependencies: true }).assertCan({ actorUserId: scope.userId,companyId: scope.companyId,
        action: 'learning:submit',resource: { type: 'course',id: courseId } })
      // Assignment lock serializes close/submit and sequence allocation for a learner's versions.
      const locked = await db.query<{ status: string; due_at: Date | null }>(`SELECT status,due_at FROM course_forum_posts
        WHERE company_id=$1 AND project_id=$2 AND id=$3 AND kind='assignment' AND deleted_at IS NULL FOR UPDATE`, [scope.companyId,project.projectId,id])
      const assignment = locked.rows[0]
      if (!assignment) throw new LearningApplicationError('not_found','assignment not found')
      const prior = await db.query<{ id: string; answer: string; links: unknown; attachments: unknown; source: string; submitted_by_agent: string | null }>(`SELECT id,answer,links,attachments,source,submitted_by_agent FROM course_forum_submissions
        WHERE company_id=$1 AND project_id=$2 AND assignment_id=$3 AND learner_id=$4 AND client_submission_id=$5`,
        [scope.companyId,project.projectId,id,scope.userId,data.idempotencyKey])
      if (prior.rows[0]) {
        const previous = prior.rows[0]
        if (previous.answer !== data.answer || JSON.stringify(previous.links) !== JSON.stringify(data.links)
          || JSON.stringify(previous.attachments) !== JSON.stringify(data.attachments) || previous.source !== (agent?.source ?? 'STUDENT_ORIGINAL')
          || previous.submitted_by_agent !== (agent?.id ?? null)) throw new LearningApplicationError('conflict','submission key already used for different content')
        return { attemptId: previous.id }
      }
      if (assignment.status !== 'PUBLISHED') throw new LearningApplicationError('conflict','assignment is closed')
      await this.item(db,scope.companyId,project.projectId,'post',id)
      await assertOwnedLearningAttachments(db,scope,data.attachments)
      const submissionId = randomUUID()
      await db.query(`INSERT INTO course_forum_submissions(id,company_id,project_id,assignment_id,learner_id,answer,links,attachments,
        source,submitted_by_agent,agent_work_id,assistance,late,client_submission_id)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13::timestamptz IS NOT NULL AND NOW()>$13,$14)`,
        [submissionId,scope.companyId,project.projectId,id,scope.userId,data.answer,JSON.stringify(data.links),JSON.stringify(data.attachments),
          agent?.source ?? 'STUDENT_ORIGINAL',agent?.id ?? null,agent?.workId ?? null,agent?.source === 'AGENT_GENERATED' ? 'GUIDED' : 'NONE',assignment.due_at,data.idempotencyKey])
      return { attemptId: submissionId }
    })
  }

  async feedback(scope: LearningScope, courseId: string, assignmentId: string, submissionId: string, input: unknown) {
    const data = forumFeedbackSchema.parse(input)
    return this.transaction(async db => {
      const project = await this.scope(db,scope,courseId,'manage')
      await this.item(db,scope.companyId,project.projectId,'post',assignmentId)
      const submission = await db.query('SELECT id FROM course_forum_submissions WHERE company_id=$1 AND project_id=$2 AND assignment_id=$3 AND id=$4 FOR SHARE', [scope.companyId,project.projectId,assignmentId,submissionId])
      if (!submission.rows.length) throw new LearningApplicationError('not_found','submission not found')
      const id = randomUUID()
      await db.query('INSERT INTO course_forum_feedback(id,company_id,project_id,submission_id,author_id,body) VALUES($1,$2,$3,$4,$5,$6)', [id,scope.companyId,project.projectId,submissionId,scope.userId,data.body])
      return { id }
    })
  }
  async editComment(scope: LearningScope, courseId: string, postId: string, commentId: string, input: ForumCommentInput | null) {
    const data = input === null ? null : forumCommentSchema.parse(input)
    return this.transaction(async db => {
      const project = await this.scope(db,scope,courseId,'write')
      await this.item(db,scope.companyId,project.projectId,'post',postId)
      const result = await db.query<{author_user_id:string}>("SELECT author_user_id FROM course_forum_comments WHERE company_id=$1 AND project_id=$2 AND target_type='post' AND target_id=$3 AND id=$4 AND deleted_at IS NULL FOR UPDATE",[scope.companyId,project.projectId,postId,commentId])
      if (!result.rows[0]) throw new LearningApplicationError('not_found','comment not found')
      if (result.rows[0].author_user_id !== scope.userId) {
        if (data) throw new LearningApplicationError('forbidden','only the author can edit a comment')
        await this.scope(db,scope,courseId,'manage')
      }
      if (data) {
        await assertOwnedLearningAttachments(db,scope,data.attachments)
        await db.query('UPDATE course_forum_comments SET body=$2,links=$3::jsonb,attachments=$4::jsonb,updated_at=NOW() WHERE id=$1', [commentId,data.body,JSON.stringify(data.links),JSON.stringify(data.attachments)])
      } else await db.query('UPDATE course_forum_comments SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1',[commentId])
      return {ok:true}
    })
  }

  async react(scope: LearningScope, courseId: string, id: string, input: unknown) {
    const data = forumReactionSchema.parse(input)
    await this.transaction(async db => {
      const project = await this.scope(db,scope,courseId,'write')
      const item = await this.item(db,scope.companyId,project.projectId,'post',id)
      if (item.archived) throw new LearningApplicationError('conflict','archived content is read only')
      const values = [scope.companyId,project.projectId,id,scope.userId,data.emoji]
      if (data.active) await db.query('INSERT INTO course_forum_reactions(company_id,project_id,post_id,user_id,emoji) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',values)
      else await db.query('DELETE FROM course_forum_reactions WHERE company_id=$1 AND project_id=$2 AND post_id=$3 AND user_id=$4 AND emoji=$5',values)
    })
    return this.detail(scope,courseId,'post',id)
  }

}
