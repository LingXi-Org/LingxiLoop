import { randomUUID } from 'node:crypto'
import { projectKindBelongsToCompanyType } from '../../domain/public.js'
import type { PermissionAction } from '../access/public.js'
import { createPermissionService } from '../access/public.js'
import type { Queryable } from '../../db/queryable.js'
import type {
  BindCourseRoomInput,
  CreateActivityInput,
  CreateCourseInput,
  CreateCourseInvitationInput,
  CreateObjectivesInput,
  LearningScope,
  MissionCoordinatorInput,
  NotificationPreferencesInput,
  ObjectiveStatusInput,
  ReviewEvaluationInput,
  SubmitActivityInput,
  UpdateCourseInput,
} from './contracts.js'
import {
  changeCourseMember,
  companyMembershipRole,
  courseInvitationPreview,
  courseManager,
  courseMembershipRole,
  courseRole,
  countViewerPendingLearningReviews,
  findCourse,
  findNotificationPreferences,
  findVerifiedUser,
  insertTeachingCourse,
  insertCourseInvitation,
  invitationViewer,
  joinInvitationCompany,
  listCourseInvitations,
  listCourseMembers,
  listCourses,
  listDeliveries,
  listDueLearningMastery,
  listLearningCourseProgress,
  listLearningCourseSummaries,
  listLearningEvidenceRecords,
  listLearningObjectives,
  listLearningActivities,
  listProjectChannels,
  listPendingLearningEvaluationRecords,
  listViewerLearningMastery,
  lockCourseInvitation,
  priorCourseAcceptance,
  recordCourseAcceptance,
  removeMemberFromProjectChannels,
  revokeCourseInvitation,
  setCourseArchived,
  studyRoomState,
  syncStudyRoomMembers,
  updateCourseMetadata,
  upsertNotificationPreferences,
  upsertAcceptedCourseMembership,
} from './repository.js'
import { enqueueLearningEffect } from './effects-repository.js'
import type { LearningEffect } from './effects-repository.js'
import { LearningApplicationError } from './errors.js'
import { reviewLearningEvaluation } from './evaluation-application.js'
import { assignLearningMissionCoordinator, listVisibleLearningMissions } from './missions-application.js'
import {
  closeLearningActivity,
  createLearningActivity,
  createLearningObjectives,
  publishLearningActivity,
  setLearningObjectiveStatus,
  submitLearningActivity,
} from './curriculum-application.js'
import { bindLearningCourseRoom } from './membership-application.js'

export { LearningApplicationError } from './errors.js'
export { proposeLearningEvaluation, reviewLearningEvaluation } from './evaluation-application.js'
export {
  addLearningMissionSteps,
  assignLearningMissionCoordinator,
  completeLearningMission,
  finishLearningMissionPlanning,
  getLearningMission,
  listVisibleLearningMissions,
  loadLearningContext,
  preferredLearningMissionCoordinator,
  recordLearningAttempt,
  startLearningMission,
  updateLearningMissionStep,
} from './missions-application.js'
export type { LearningMissionInfrastructure } from './missions-application.js'
export {
  closeLearningActivity,
  createLearningActivity,
  createLearningObjectives,
  publishLearningActivity,
  setLearningObjectiveStatus,
  submitLearningActivity,
} from './curriculum-application.js'
export {
  bindLearningCourseRoom,
  requireLearningCourseRole,
  setLearningCourseMembership,
} from './membership-application.js'
export type { LearningTransaction } from './membership-application.js'

export interface LearningInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, event: {
    kind: string; userId: string; companyId: string; detail: Record<string, unknown>
  }): Promise<void>
  ensureTeacherAgent(companyId: string, courseId: string, db: Queryable): Promise<{ created: boolean }>
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
  teacherAgentSummary(companyId: string, courseId: string, userId: string): Promise<unknown>
  metric(name: string, tags?: Record<string, string>): void
}

export class LearningApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: LearningInfrastructure) {}

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
    const payload = effect.payload
    switch (effect.kind) {
      case 'study_room.sync':
        await this.syncStudyRoom(effect.courseId)
        return
      case 'teacher_room.sync':
        await this.infrastructure.syncTeacherRoom(effect.companyId, effect.courseId)
        return
      case 'teacher_agent.welcome':
        await this.infrastructure.welcomeTeacherAgent(effect.companyId, effect.courseId)
        return
      case 'notebook.ensure': {
        const projectId = String(payload.projectId ?? '')
        if (!projectId) throw new Error('notebook effect requires projectId')
        await this.infrastructure.ensureNotebook(projectId, effect.companyId)
        return
      }
      case 'course_metadata.sync': {
        const projectId = String(payload.projectId ?? '')
        if (!projectId) throw new Error('course metadata sync requires projectId')
        if (payload.studyRoom === true) await this.syncStudyRoom(effect.courseId)
        await this.infrastructure.syncNotebook(projectId)
        return
      }
      case 'course_archive.sync': {
        const projectId = String(payload.projectId ?? '')
        if (!projectId || typeof payload.archive !== 'boolean') {
          throw new Error('course archive sync requires projectId and archive state')
        }
        if (payload.archive) await this.infrastructure.closeTeacherRoom(effect.companyId, effect.courseId)
        else await this.infrastructure.reactivateTeacherRoom(effect.companyId, effect.courseId)
        await this.infrastructure.syncNotebook(projectId)
        return
      }
      case 'member_access.revoke': {
        const projectId = String(payload.projectId ?? '')
        const userId = String(payload.userId ?? '')
        if (!projectId || !userId) throw new Error('member access revocation requires projectId and userId')
        const channels = await listProjectChannels(this.db, {
          companyId: effect.companyId, projectId,
        })
        await Promise.all(channels.map((channel) => this.infrastructure.syncChannel({
          channelId: channel.id, title: channel.title, members: channel.members,
        })))
        await this.infrastructure.revokeDocumentSubscriptions(userId, effect.companyId, projectId)
        await this.infrastructure.publishDocumentAccessRevoked({
          eventId: effect.id, companyId: effect.companyId, workspaceId: projectId, userId,
        })
        await this.syncStudyRoom(effect.courseId)
        await this.infrastructure.syncTeacherRoom(effect.companyId, effect.courseId)
        return
      }
      case 'member_onboarding.seed': {
        const userId = String(payload.userId ?? '')
        if (!userId) throw new Error('member onboarding requires userId')
        await this.infrastructure.seedMemberDms(effect.companyId, userId)
        return
      }
    }
  }

  async createCourse(scope: LearningScope, input: CreateCourseInput) {
    const projectId = `p-${randomUUID().slice(0, 10)}`
    const courseId = `course-${randomUUID().slice(0, 12)}`
    const roomId = `course-room-${randomUUID().slice(0, 12)}`
    await this.infrastructure.transaction(async (db) => {
      const context = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId,
        action: 'course:create',
        companyId: scope.companyId,
      })
      if (!projectKindBelongsToCompanyType('TEACHING', context.company.type)) {
        throw new LearningApplicationError('forbidden', 'Teaching Projects require a Personal Company')
      }
      await insertTeachingCourse(db, { ...scope, projectId, courseId, roomId, input })
      const teacher = await this.infrastructure.ensureTeacherAgent(scope.companyId, courseId, db)
      const effects = [
        { kind: 'study_room.sync' as const },
        { kind: 'teacher_room.sync' as const },
        ...(teacher.created ? [{ kind: 'teacher_agent.welcome' as const }] : []),
        { kind: 'notebook.ensure' as const, payload: { projectId } },
      ]
      for (const effect of effects) {
        await enqueueLearningEffect(db, {
          companyId: scope.companyId, courseId, kind: effect.kind, payload: effect.payload,
        })
      }
      await this.infrastructure.auditInTransaction(db, {
        kind: 'course_create', companyId: scope.companyId, userId: scope.userId,
        detail: { courseId, projectId, name: input.name },
      })
    })
    return {
      id: courseId, companyId: scope.companyId, projectId, projectKind: 'TEACHING' as const, name: input.name,
      description: input.description, color: input.color, status: 'active',
      createdBy: scope.userId, studyRoomId: roomId, courseRole: 'teacher', memberCount: 1,
      canManage: true, knowledgeState: 'pending' as const,
    }
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

  async updateCourse(userId: string, courseId: string, patch: UpdateCourseInput) {
    await this.infrastructure.transaction(async (db) => {
      const manager = await this.manager(userId, courseId, 'course:update', db, true)
      await updateCourseMetadata(db, { courseId, companyId: manager.companyId, projectId: manager.projectId, patch })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'course_update', userId, companyId: manager.companyId,
        detail: { courseId, ...patch },
      })
      await enqueueLearningEffect(db, {
        companyId: manager.companyId,
        courseId,
        kind: 'course_metadata.sync',
        payload: { projectId: manager.projectId, studyRoom: patch.name !== undefined },
      })
    })
    return { ok: true as const }
  }

  async archiveCourse(userId: string, courseId: string, archive: boolean) {
    await this.infrastructure.transaction(async (db) => {
      const manager = await this.manager(userId, courseId, 'course:archive', db, true)
      await setCourseArchived(db, manager.companyId, manager.projectId, archive)
      await this.infrastructure.auditInTransaction(db, {
        kind: archive ? 'course_archive' : 'course_unarchive', userId, companyId: manager.companyId,
        detail: { courseId },
      })
      await enqueueLearningEffect(db, {
        companyId: manager.companyId,
        courseId,
        kind: 'course_archive.sync',
        payload: { projectId: manager.projectId, archive },
      })
    })
    return { ok: true as const, status: archive ? 'archived' : 'active' }
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

  async removeMember(userId: string, courseId: string, targetId: string) {
    await this.infrastructure.transaction(async (db) => {
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
    })
    return { ok: true as const }
  }

  async invitations(userId: string, courseId: string) {
    const manager = await this.manager(userId, courseId, 'project_invitation:list')
    return listCourseInvitations(this.db, courseId, manager.companyId)
  }

  async createInvitation(userId: string, courseId: string, input: CreateCourseInvitationInput) {
    const token = this.infrastructure.generateInvitationToken()
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000)
    const email = input.email?.toLowerCase() || null
    const note = input.note || null
    await this.infrastructure.transaction(async (db) => {
      const manager = await this.manager(userId, courseId, 'project_invitation:create', db, true)
      await insertCourseInvitation(db, {
        tokenHash, courseId, companyId: manager.companyId, userId, email,
        role: input.role, note, maxUses: input.maxUses, expiresAt,
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'course_invitation_create', userId, companyId: manager.companyId,
        detail: { courseId, email, role: input.role, maxUses: input.maxUses, expiresInDays: input.expiresInDays },
      })
    })
    return {
      id: tokenHash, token, url: this.infrastructure.invitationUrl(token), email, role: input.role,
      note, maxUses: input.maxUses, useCount: 0, createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(), status: 'active',
    }
  }

  async revokeInvitation(userId: string, courseId: string, invitationId: string) {
    const revoked = await this.infrastructure.transaction(async (db) => {
      const manager = await this.manager(userId, courseId, 'project_invitation:revoke', db, true)
      const revoked = await revokeCourseInvitation(db, courseId, manager.companyId, invitationId)
      if (revoked) await this.infrastructure.auditInTransaction(db, {
        kind: 'course_invitation_revoke', userId, companyId: manager.companyId,
        detail: { courseId, invitationId },
      })
      return revoked
    })
    return { ok: true as const, revoked }
  }

  async invitationPreview(token: string, viewerId?: string) {
    const invitation = await courseInvitationPreview(this.db, this.infrastructure.hashInvitationToken(token))
    if (!invitation) return { status: 'not_found', kind: 'course' as const }
    let status = invitation.revoked_at ? 'revoked'
      : new Date(invitation.expires_at).getTime() < Date.now() ? 'expired'
        : invitation.use_count >= invitation.max_uses ? 'consumed'
          : invitation.project_status !== 'active' ? 'archived' : 'valid'
    if (viewerId) {
      const viewer = await invitationViewer(this.db, viewerId, invitation.course_id)
      if (viewer?.role && (viewer.role === 'teacher' || invitation.role === viewer.role)) status = 'already_member'
      else if (invitation.email && viewer?.email.toLowerCase() !== invitation.email) status = 'wrong_email'
    }
    return {
      kind: 'course' as const, status,
      invitation: {
        role: invitation.role, email: invitation.email, note: invitation.note,
        expiresAt: new Date(invitation.expires_at).toISOString(), inviterName: invitation.inviter_name,
        company: { id: invitation.company_id, name: invitation.company_name, slug: invitation.company_slug },
        course: {
          id: invitation.course_id, name: invitation.course_name, projectId: invitation.project_id,
          studyRoomId: invitation.room_id,
        },
      },
    }
  }

  async acceptInvitation(userId: string, token: string) {
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const user = await findVerifiedUser(this.db, userId)
    if (!user) throw new LearningApplicationError('unauthorized', 'session points to missing user')
    if (!user.email_verified_at) {
      throw new LearningApplicationError('forbidden', 'a verified email is required to accept a course invitation')
    }
    const result = await this.infrastructure.transaction(async (db) => {
      const invitation = await lockCourseInvitation(db, tokenHash, userId)
      if (!invitation) throw new LearningApplicationError('not_found', 'invitation not found')
      if (invitation.revoked_at) throw new LearningApplicationError('gone', 'invitation revoked')
      if (new Date(invitation.expires_at).getTime() < Date.now()) {
        throw new LearningApplicationError('gone', 'invitation expired')
      }
      if (invitation.project_status !== 'active') throw new LearningApplicationError('gone', 'course archived')
      if (invitation.email && invitation.email !== user.email.toLowerCase()) {
        throw new LearningApplicationError('forbidden', `this invitation is reserved for ${invitation.email}`)
      }
      const prior = await priorCourseAcceptance(db, tokenHash, userId)
      const companyRole = await companyMembershipRole(db, invitation.company_id, userId)
      const joinedCompany = !companyRole
      if (joinedCompany) await joinInvitationCompany(db, {
        companyId: invitation.company_id, userId, displayName: user.display_name,
        avatarUrl: user.avatar_url ?? this.infrastructure.avatarForEmail(user.email),
      })
      const existingRole = await courseMembershipRole(db, invitation.course_id, userId)
      if (prior && !existingRole) {
        throw new LearningApplicationError('gone', 'this invitation was already accepted and no longer grants course access')
      }
      let role: 'teacher' | 'learner' = prior
        ? existingRole!
        : existingRole === 'teacher' || invitation.role === 'teacher' ? 'teacher' : 'learner'
      const changesRole = !prior && (!existingRole || role !== existingRole)
      if (changesRole && invitation.use_count >= invitation.max_uses) {
        throw new LearningApplicationError('gone', 'invitation already used')
      }
      if (changesRole) role = await upsertAcceptedCourseMembership(db, { invitation, userId, role })
      if (changesRole) await recordCourseAcceptance(db, { tokenHash, userId, role })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'course_invitation_accept', userId, companyId: invitation.company_id,
        detail: { courseId: invitation.course_id, role },
      })
      await enqueueLearningEffect(db, {
        companyId: invitation.company_id, courseId: invitation.course_id, kind: 'study_room.sync',
      })
      await enqueueLearningEffect(db, {
        companyId: invitation.company_id, courseId: invitation.course_id, kind: 'teacher_room.sync',
      })
      await enqueueLearningEffect(db, {
        companyId: invitation.company_id,
        courseId: invitation.course_id,
        kind: 'member_onboarding.seed',
        effectKey: userId,
        payload: { userId },
      })
      return {
        companyId: invitation.company_id, companyName: invitation.company_name,
        companySlug: invitation.company_slug, companyRole: companyRole ?? 'member',
        courseId: invitation.course_id, courseName: invitation.course_name,
        projectId: invitation.project_id, roomId: invitation.room_id, role,
        alreadyMember: Boolean(existingRole) && !changesRole, joinedCompany,
      }
    })
    return {
      ok: true as const, alreadyMember: result.alreadyMember, joinedCompany: result.joinedCompany,
      company: {
        id: result.companyId, name: result.companyName, slug: result.companySlug, role: result.companyRole,
      },
      course: {
        id: result.courseId, name: result.courseName, projectId: result.projectId,
        studyRoomId: result.roomId, role: result.role,
      },
    }
  }

  dashboard(scope: LearningScope) {
    return this.classroom(async () => {
      const [courseRows, due, pendingReviews, mastery] = await Promise.all([
        listLearningCourseSummaries(this.db, scope.companyId, scope.userId),
        listDueLearningMastery(this.db, scope.companyId, scope.userId),
        countViewerPendingLearningReviews(this.db, scope.companyId, scope.userId),
        listViewerLearningMastery(this.db, scope.companyId, scope.userId),
      ])
      const courses = courseRows.map((row) => ({
        id: row.id, companyId: row.company_id, projectId: row.project_id, title: row.title,
        description: row.description, status: row.status, courseRole: row.course_role,
        roomCount: Number(row.room_count), objectiveCount: Number(row.objective_count),
        learnerCount: Number(row.learner_count), createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }))
      return { courses, due, mastery, pendingReviews }
    })
  }

  async teacherAgent(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:read')
    return this.classroom(() => this.infrastructure.teacherAgentSummary(scope.companyId, courseId, scope.userId))
  }

  async bindRoom(scope: LearningScope, courseId: string, conversationId: string, input: BindCourseRoomInput) {
    await this.assertCourseScope(scope, courseId, 'learning:manage')
    return this.classroom(async () => {
      await bindLearningCourseRoom(this.db, {
        companyId: scope.companyId, courseId, managerId: scope.userId,
        conversationId, purpose: input.purpose, enabled: true,
      })
      return { ok: true as const }
    })
  }

  async objectives(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:read')
    const role = await courseRole(this.db, courseId, scope.companyId, scope.userId)
    const objectives = await this.classroom(() => listLearningObjectives(this.db, scope.companyId, courseId))
    return role === 'teacher' ? objectives : objectives.filter((objective) => objective.status === 'published')
  }

  async createObjectives(scope: LearningScope, courseId: string, input: CreateObjectivesInput) {
    await this.assertCourseScope(scope, courseId, 'learning:manage')
    return this.classroom(() => createLearningObjectives(this.db, (work) => this.infrastructure.transaction(work), {
      companyId: scope.companyId,
      courseId,
      actorId: scope.userId,
      actorKind: 'teacher',
      objectives: input.objectives,
    }))
  }

  async setObjectiveStatus(scope: LearningScope, courseId: string, objectiveId: string, input: ObjectiveStatusInput) {
    await this.assertCourseScope(scope, courseId, 'learning:manage')
    return this.classroom(async () => {
      await setLearningObjectiveStatus(this.db, {
        companyId: scope.companyId,
        courseId,
        objectiveId,
        teacherId: scope.userId,
        status: input.status,
      })
      return { ok: true as const }
    })
  }

  async activities(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:read')
    const role = await courseRole(this.db, courseId, scope.companyId, scope.userId)
    return listLearningActivities(this.db, scope.companyId, courseId, role === 'teacher')
  }

  async createActivity(scope: LearningScope, courseId: string, input: CreateActivityInput) {
    await this.assertCourseScope(scope, courseId, 'learning:manage')
    return this.classroom(() => createLearningActivity(this.db, (work) => this.infrastructure.transaction(work), {
      companyId: scope.companyId,
      courseId,
      actorId: scope.userId,
      actorKind: 'teacher',
      ...input,
    }))
  }

  async activity(scope: LearningScope, courseId: string, activityId: string) {
    const visible = await this.activities(scope, courseId)
    const activity = visible.find((item) => item.id === activityId)
    if (!activity) throw new LearningApplicationError('not_found', 'activity not found')
    return activity
  }

  async publishActivity(scope: LearningScope, courseId: string, activityId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:manage')
    return this.classroom(async () => {
      await publishLearningActivity((work) => this.infrastructure.transaction(work), {
        companyId: scope.companyId, courseId, activityId, teacherId: scope.userId,
      })
      return { ok: true as const }
    })
  }

  async closeActivity(scope: LearningScope, courseId: string, activityId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:manage')
    return this.classroom(async () => {
      await closeLearningActivity(this.db, {
        companyId: scope.companyId, courseId, activityId, teacherId: scope.userId,
      })
      return { ok: true as const }
    })
  }

  async submitActivity(scope: LearningScope, courseId: string, activityId: string, input: SubmitActivityInput) {
    await this.assertCourseScope(scope, courseId, 'learning:submit')
    const result = await this.classroom(() => submitLearningActivity(this.db, {
      companyId: scope.companyId, courseId, activityId, learnerId: scope.userId, ...input,
    }))
    this.infrastructure.metric('learning.attempt.accepted', { source: 'ui' })
    return result
  }

  async missions(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:read')
    return this.classroom(() => listVisibleLearningMissions(this.db, scope, courseId))
  }

  async setMissionCoordinator(
    scope: LearningScope,
    courseId: string,
    missionId: string,
    input: MissionCoordinatorInput,
  ) {
    await this.assertCourseScope(scope, courseId, 'learning:manage')
    return this.classroom(() => assignLearningMissionCoordinator(this.db, {
      companyId: scope.companyId,
      courseId,
      missionId,
      teacherId: scope.userId,
      agentId: input.agentId,
    }))
  }

  async evidence(scope: LearningScope, courseId: string, learnerId = scope.userId) {
    await this.assertCourseScope(scope, courseId, learnerId === scope.userId ? 'learning:read' : 'learning:review')
    return this.classroom(async () => {
      await createPermissionService(this.db).assertCan({
        actorUserId: scope.userId,
        action: learnerId === scope.userId ? 'learning:read' : 'learning:review',
        companyId: scope.companyId,
        resource: { type: 'course', id: courseId },
      })
      return listLearningEvidenceRecords(this.db, {
        companyId: scope.companyId, courseId, learnerId,
      })
    })
  }

  async reviews(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:review')
    return this.classroom(async () => {
      await createPermissionService(this.db).assertCan({
        actorUserId: scope.userId,
        action: 'learning:review',
        companyId: scope.companyId,
        resource: { type: 'course', id: courseId },
      })
      return listPendingLearningEvaluationRecords(this.db, scope.companyId, courseId)
    })
  }

  async progress(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:review')
    return this.classroom(async () => {
      await createPermissionService(this.db).assertCan({
        actorUserId: scope.userId,
        action: 'learning:review',
        companyId: scope.companyId,
        resource: { type: 'course', id: courseId },
      })
      return listLearningCourseProgress(this.db, scope.companyId, courseId)
    })
  }

  async review(scope: LearningScope, courseId: string, evaluationId: string, input: ReviewEvaluationInput) {
    await this.assertCourseScope(scope, courseId, 'learning:review')
    return this.classroom(async () => {
      await reviewLearningEvaluation(this.db, this.infrastructure.transaction, this.infrastructure.metric, {
        companyId: scope.companyId, courseId, evaluationId, teacherId: scope.userId, ...input,
      })
      return { ok: true as const }
    })
  }

  notificationPreferences(scope: LearningScope, courseId?: string) {
    return this.classroom(async () => await findNotificationPreferences(
      this.db, scope.companyId, scope.userId, courseId,
    ) ?? {
      company_id: scope.companyId,
      user_id: scope.userId,
      course_id: courseId ?? null,
      in_app_enabled: true,
      email_enabled: false,
      timezone: 'Asia/Shanghai',
      preferred_time: '19:00',
      quiet_start: null,
      quiet_end: null,
    })
  }

  async setNotificationPreferences(scope: LearningScope, input: NotificationPreferencesInput) {
    if (input.courseId) {
      await createPermissionService(this.db).assertCan({
        actorUserId: scope.userId,
        action: 'learning:preference',
        companyId: scope.companyId,
        resource: { type: 'course', id: input.courseId },
      })
    }
    await upsertNotificationPreferences(this.db, { id: randomUUID(), ...scope, ...input })
    return this.notificationPreferences(scope, input.courseId)
  }

  deliveries(scope: LearningScope) { return listDeliveries(this.db, scope.companyId, scope.userId) }

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

  private async assertCourseScope(scope: LearningScope, courseId: string, action: PermissionAction): Promise<void> {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId,
      action,
      companyId: scope.companyId,
      resource: { type: 'course', id: courseId },
    })
  }

  private async classroom<T>(work: () => Promise<T>): Promise<T> {
    try { return await work() }
    catch (error) {
      if (error instanceof LearningApplicationError) throw error
      if (!(error instanceof Error)) throw error
      if (/not found|not provisioned/.test(error.message)) {
        throw new LearningApplicationError('not_found', error.message)
      }
      if (/access denied|role required|membership required/.test(error.message)) {
        throw new LearningApplicationError('forbidden', error.message)
      }
      throw new LearningApplicationError('invalid', error.message)
    }
  }

  private assertMemberChange(outcome: 'updated' | 'not_found' | 'last_teacher'): void {
    if (outcome === 'not_found') throw new LearningApplicationError('not_found', 'course member not found')
    if (outcome === 'last_teacher') {
      throw new LearningApplicationError('conflict', 'an active course must keep at least one teacher')
    }
  }

  private async syncStudyRoom(courseId: string): Promise<void> {
    const state = await studyRoomState(this.db, courseId)
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
