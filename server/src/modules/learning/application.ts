import type { Queryable } from '../../db/queryable.js'
import { createPermissionService, type PermissionAction } from '../access/public.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import type { AddInstitutionalCourseMemberInput, CreateProjectInvitationInput, LearningScope, LearningSpacesQuery } from './contracts.js'
import { listLearningSpaces } from './dashboard-application.js'
import { runLearningEffect } from './effect-application.js'
import { enqueueLearningEffect, type LearningEffect } from './effects-repository.js'
import { LearningApplicationError } from './errors.js'
import { LearningInvitationApplication } from './invitation-application.js'
import { addInstitutionalCourseMember, changeCourseMember, courseManager, findCourse, listCourseMembers, listCourses, removeMemberFromProjectChannels } from './courses-repository.js'
import { studyRoomState, syncStudyRoomMembers } from './reporting-repository.js'
import type { CourseMemberChangeOutcome } from './types.js'
export { LearningApplicationError } from './errors.js'
export interface LearningInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, event: {
    kind: string; userId: string; companyId: string; detail: Record<string, unknown>
  }): Promise<void>
  ensureTeacherAgent(companyId: string, courseId: string, db: Queryable): Promise<{
    agentId: string; roomId: string; created: boolean
  }>
  bindTeacherOperationsContext(db: Queryable, args: {
    companyId: string; projectId: string; teacherId: string; agentId: string; channelId: string
  }): Promise<unknown>
  syncTeacherRoom(companyId: string, courseId: string): Promise<void>
  welcomeTeacherAgent(companyId: string, courseId: string): Promise<void>
  closeTeacherRoom(companyId: string, courseId: string): Promise<void>
  reactivateTeacherRoom(companyId: string, courseId: string): Promise<void>
  ensureNotebook(projectId: string, companyId: string): Promise<void>
  syncNotebook(projectId: string): Promise<void>
  syncChannel(channel: { channelId: string; title: string; members: string[]; leaderAgentId?: string }): Promise<void>
  revokeDocumentSubscriptions(userId: string, companyId: string, projectId: string): Promise<void>
  publishDocumentAccessRevoked(event: {
    eventId: string; companyId: string; workspaceId: string; userId: string
  }): Promise<void>
  seedMemberDms(companyId: string, userId: string): Promise<void>
  generateInvitationToken(): string
  hashInvitationToken(token: string): string
  invitationUrl(token: string): string
  avatarForEmail(email: string): string
  metric(name: string, tags?: Record<string, string>): void
}
export class LearningApplication {
  private readonly invitationApplication: LearningInvitationApplication


  constructor(private readonly db: Queryable, private readonly infrastructure: LearningInfrastructure) {
    this.invitationApplication = new LearningInvitationApplication(db, infrastructure)
  }


  spaces(userId: string, input: LearningSpacesQuery) {
    return listLearningSpaces(this.db, userId, input)
  }


  async courses(scope: LearningScope) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId,
      action: 'project:list',
      companyId: scope.companyId,
    })
    const courses = await listCourses(this.db, scope.companyId, scope.userId)
    const permissions = createPermissionService(this.db)
    const visible = await Promise.all(courses.map(async (course: { id: string }) => ({
      course,
      decision: await permissions.can({
        actorUserId: scope.userId,
        action: 'course:read',
        companyId: scope.companyId,
        resource: { type: 'course', id: course.id },
      }),
    })))
    return visible.filter(({ decision }) => decision.allowed).map(({ course }) => course)
  }


  async runEffect(effect: LearningEffect): Promise<void> {
    await runLearningEffect(this.db, {
      ...this.infrastructure,
      syncStudyRoom: (companyId, courseId) => this.syncStudyRoom(companyId, courseId),
    }, effect)
  }


  async course(scope: LearningScope, courseId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId,
      action: 'course:read',
      companyId: scope.companyId,
      resource: { type: 'course', id: courseId },
    })
    const course = await findCourse(this.db, courseId, scope.companyId, scope.userId)
    if (!course) throw new LearningApplicationError('not_found', 'course not found')
    return course
  }


  async members(userId: string, courseId: string) {
    const manager = await this.manager(userId, courseId, 'project_member:list')
    return listCourseMembers(this.db, courseId, manager.companyId)
  }


  async updateMember(userId: string, courseId: string, targetId: string, role: 'teacher' | 'learner') {
    await this.infrastructure.transaction(async (db) => {
      const manager = await this.manager(userId, courseId, 'project_member:update', db, true)
      const outcome = await changeCourseMember(db, {
        courseId, companyId: manager.companyId, userId: targetId, role,
      })
      this.assertMemberChange(outcome)
      await this.infrastructure.auditInTransaction(db, {
        kind: 'course_member_role_update', userId, companyId: manager.companyId,
        detail: { courseId, targetId, role },
      })
      await enqueueLearningEffect(db, {
        companyId: manager.companyId, courseId, kind: 'teacher_room.sync',
      })
    })
    return { ok: true as const, userId: targetId, role }
  }


  async addInstitutionalMember(
    userId: string,
    courseId: string,
    targetId: string,
    input: AddInstitutionalCourseMemberInput,
  ) {
    await this.infrastructure.transaction(async (db) => {
      const manager = await this.manager(userId, courseId, 'project_member:add', db, true)
      const added = await addInstitutionalCourseMember(db, {
        courseId,
        companyId: manager.companyId,
        userId: targetId,
        role: input.role,
      })
      if (!added || added.role !== input.role) {
        throw new LearningApplicationError(
          'conflict',
          'Institutional Course member requires an active School Membership and a new Project Role',
        )
      }
      await appendDomainEventInTransaction(db, {
        companyId: manager.companyId,
        projectId: added.projectId,
        aggregateType: 'PROJECT_MEMBERSHIP',
        aggregateId: `${added.projectId}:${targetId}`,
        idempotencyKey: `institutional-course-member:${input.idempotencyKey}`,
        actor: { type: 'USER', id: userId },
        event: {
          eventType: 'PROJECT_MEMBERSHIP.ASSIGNED',
          schemaVersion: 1,
          payload: { userId: targetId, role: input.role, source: 'INSTITUTIONAL_COURSE' },
        },
      })
      if (added.added) {
        await this.infrastructure.auditInTransaction(db, {
          kind: 'institutional_course_member_add',
          userId,
          companyId: manager.companyId,
          detail: { courseId, projectId: added.projectId, targetId, role: input.role },
        })
        for (const kind of ['study_room.sync', 'teacher_room.sync'] as const) {
          await enqueueLearningEffect(db, { companyId: manager.companyId, courseId, kind })
        }
        await enqueueLearningEffect(db, {
          companyId: manager.companyId,
          courseId,
          kind: 'member_onboarding.seed',
          effectKey: targetId,
          payload: { userId: targetId },
        })
      }
    })
    return { ok: true as const, userId: targetId, role: input.role }
  }


  async removeMember(userId: string, courseId: string, targetId: string) {
    const revokedScope = await this.infrastructure.transaction(async (db) => {
      const manager = await this.manager(userId, courseId, 'project_member:remove', db, true)
      const outcome = await changeCourseMember(db, {
        courseId, companyId: manager.companyId, userId: targetId, role: null,
      })
      this.assertMemberChange(outcome)
      await removeMemberFromProjectChannels(db, {
        companyId: manager.companyId, projectId: manager.projectId, userId: targetId,
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'course_member_remove', userId, companyId: manager.companyId,
        detail: { courseId, targetId },
      })
      await enqueueLearningEffect(db, {
        companyId: manager.companyId,
        courseId,
        kind: 'member_access.revoke',
        effectKey: targetId,
        payload: { projectId: manager.projectId, userId: targetId },
      })
      return { companyId: manager.companyId, projectId: manager.projectId }
    })
    await this.infrastructure.revokeDocumentSubscriptions(
      targetId,
      revokedScope.companyId,
      revokedScope.projectId,
    )
    return { ok: true as const }
  }


  invitations(scope: LearningScope & { projectId: string }) {
    return this.invitationApplication.list(scope)
  }


  async createInvitation(scope: LearningScope & { projectId: string }, input: CreateProjectInvitationInput) {
    return this.invitationApplication.create(scope, input)
  }


  async revokeInvitation(scope: LearningScope & { projectId: string }, invitationId: string) {
    return this.invitationApplication.revoke(scope, invitationId)
  }


  async invitationPreview(token: string, viewerId?: string) {
    return this.invitationApplication.preview(token, viewerId)
  }


  async acceptInvitation(userId: string, token: string) {
    return this.invitationApplication.accept(userId, token)
  }


  private async manager(
    userId: string,
    courseId: string,
    action: PermissionAction,
    db: Queryable = this.db,
    lock = false,
  ) {
    await createPermissionService(db, { lockDependencies: lock }).assertCan({
      actorUserId: userId,
      action,
      resource: { type: 'course', id: courseId },
    })
    const manager = await courseManager(db, courseId, userId, lock)
    if (!manager) throw new LearningApplicationError('not_found', 'course not found')
    return manager
  }


  private assertMemberChange(outcome: CourseMemberChangeOutcome): void {
    if (outcome === 'not_found') throw new LearningApplicationError('not_found', 'course member not found')

  }


  private async syncStudyRoom(companyId: string, courseId: string): Promise<void> {
    const state = await studyRoomState(this.db, companyId, courseId)
    if (!state?.room_id) return
    const members = await syncStudyRoomMembers(this.db, {
      courseId, companyId: state.company_id, roomId: state.room_id,
      title: state.title, topic: state.topic, leaderId: state.leader_id,
    })
    await this.infrastructure.syncChannel({
      channelId: state.room_id, title: state.title, members,
      ...(state.leader_id ? { leaderAgentId: state.leader_id } : {}),
    })
  }
}
