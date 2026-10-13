import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { createPermissionService } from '../access/public.js'
import type { LearningScope } from './contracts.js'
import { LearningApplicationError } from './errors.js'
import { forumFlagsSchema, forumPostSchema, forumQuerySchema, type ForumFlags, type ForumPostInput, type ForumQuery, type ForumTarget } from './forum-contracts.js'
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
      const project = await this.scope(db, scope, courseId, 'write')
      if (data.sourceId) await this.item(db, scope.companyId, project.projectId, 'source', data.sourceId)
      await assertOwnedLearningAttachments(db, scope, data.attachments)
      await db.query(`INSERT INTO course_forum_posts(id,company_id,project_id,author_user_id,kind,title,body,tags,links,attachments,source_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11)`,
      [id,scope.companyId,project.projectId,scope.userId,data.kind,data.title,data.body,[...new Set(data.tags)],
        JSON.stringify(data.links),JSON.stringify(data.attachments),data.sourceId ?? null])
    })
    return this.detail(scope, courseId, 'post', id)
  }

  async updateFlags(scope: LearningScope, courseId: string, type: ForumTarget, id: string, input: ForumFlags) {
    const flags = forumFlagsSchema.parse(input)
    await this.transaction(async db => {
      const project = await this.scope(db, scope, courseId, 'manage')
      const item = await this.item(db, scope.companyId, project.projectId, type, id)
      if ((flags.official || flags.featured) && item.kind !== 'case') {
        throw new LearningApplicationError('invalid', 'only work cases can be official or featured')
      }
      await db.query(`INSERT INTO course_forum_flags(company_id,project_id,target_type,target_id,pinned,official,featured,updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(company_id,project_id,target_type,target_id) DO UPDATE SET
          pinned=COALESCE($9,course_forum_flags.pinned),official=COALESCE($10,course_forum_flags.official),
          featured=COALESCE($11,course_forum_flags.featured),updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [scope.companyId,project.projectId,type,id,flags.pinned ?? false,flags.official ?? false,flags.featured ?? false,
        scope.userId,flags.pinned ?? null,flags.official ?? null,flags.featured ?? null])
    })
    return this.detail(scope, courseId, type, id)
  }

  async comments(scope: LearningScope, courseId: string, type: ForumTarget, id: string, offset: number) {
    const project = await this.scope(this.db, scope, courseId)
    await this.item(this.db, scope.companyId, project.projectId, type, id)
    const { rows } = await this.db.query<{ id: string; authorId: string; authorName: string; body: string; createdAt: string }>(`
      SELECT c.id,c.author_user_id AS "authorId",u.display_name AS "authorName",c.body,c.created_at AS "createdAt"
      FROM course_forum_comments c JOIN users u ON u.id=c.author_user_id
      WHERE c.company_id=$1 AND c.project_id=$2 AND c.target_type=$3 AND c.target_id=$4
      ORDER BY c.created_at,c.id LIMIT 51 OFFSET $5`, [scope.companyId,project.projectId,type,id,offset])
    return page(rows, offset)
  }

  async comment(scope: LearningScope, courseId: string, type: ForumTarget, id: string, body: string) {
    const text = body.trim()
    if (!text || text.length > 10000) throw new LearningApplicationError('invalid', 'comment must contain 1 to 10000 characters')
    return this.transaction(async db => {
      const project = await this.scope(db, scope, courseId, 'write')
      await this.item(db, scope.companyId, project.projectId, type, id)
      const commentId = randomUUID()
      await db.query(`INSERT INTO course_forum_comments(id,company_id,project_id,target_type,target_id,author_user_id,body)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [commentId,scope.companyId,project.projectId,type,id,scope.userId,text])
      return { id: commentId }
    })
  }

  async submissions(scope: LearningScope, courseId: string, activityId: string, offset: number) {
    const project = await this.scope(this.db, scope, courseId)
    await this.item(this.db, scope.companyId, project.projectId, 'activity', activityId)
    const teacher = (await createPermissionService(this.db).can({ actorUserId: scope.userId,companyId: scope.companyId,
      action: 'learning:review',resource: { type: 'course',id: courseId } })).allowed
    return page(await listSubmissionVersions(this.db, scope.companyId, project.projectId, activityId,
      teacher ? null : scope.userId, offset), offset)
  }
}
