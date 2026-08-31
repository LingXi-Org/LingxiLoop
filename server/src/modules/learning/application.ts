import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import { type ProjectKind, projectKindBelongsToCompanyType } from '../../domain/public.js'
import { createPermissionService, ForbiddenError, type PermissionAction, resolvePlanEntitlements } from '../access/public.js'
import { ensureTeacherPlans } from '../entitlements/public.js'
import { appendDomainEventInTransaction } from '../events/public.js'
import { importProjectLearningActivities } from './activity-import-application.js'
import type {
  AddInstitutionalCourseMemberInput,
  BindCourseRoomInput,
  CreateActivityInput,
  CreateCourseInput,
  CreateObjectivesInput,
  CreateProjectInvitationInput,
  LearningActivityImportInput,
  LearningLearnersQuery,
  LearningScope,
  LearningSpacesQuery,
  MissionCoordinatorInput,
  ObjectiveStatusInput,
  ReviewEvaluationInput,
  SubmitActivityInput,
  UpdateCourseInput,
} from './contracts.js'
import {
  closeLearningActivity,
  createLearningActivity,
  createLearningObjectives,
  publishLearningActivity,
  setLearningObjectiveStatus,
  submitLearningActivity,
  submitProjectLearningActivity,
} from './curriculum-application.js'
import {
  learningAttemptDetail,
  learningLearnerDetail,
  learningOverview,
  listLearningLearners,
  listLearningSpaces,
} from './dashboard-application.js'
import { runLearningEffect } from './effect-application.js'
import type { LearningEffect } from './effects-repository.js'
import { enqueueLearningEffect } from './effects-repository.js'
import { LearningApplicationError } from './errors.js'
import { reviewLearningEvaluation, reviewProjectLearningEvaluation } from './evaluation-application.js'
import { LearningInvitationApplication } from './invitation-application.js'
import { bindLearningCourseRoom } from './membership-application.js'
import { assignLearningMissionCoordinator, listVisibleLearningMissions } from './missions-application.js'
import {
  addInstitutionalCourseMember,
  changeCourseMember,
  countActiveTeachingProjects,
  countViewerPendingLearningReviews,
  courseManager,
  courseRole,
  findCourse,
  insertCourse,
  listCourseMembers,
  listCourses,
  listDueLearningStates,
  listLearningActivities,
  listLearningEvidenceRecords,
  listLearningMissions,
  listLearningObjectives,
  listLearningProjectProgress,
  listLearningProjectSummaries,
  listPendingLearningEvaluationRecords,
  listProjectLearningActivities,
  listProjectLearningKnowledgeUnits,
  listViewerLearningStates,
  removeMemberFromProjectChannels,
  requireLearningCourseProjectScope,
  studyRoomState,
  syncStudyRoomMembers,
  updateCourseMetadata,
} from './repository.js'
import type { CourseMemberChangeOutcome } from './types.js'

export {
  closeLearningActivity,
  createLearningActivity,
  createLearningObjectives,
  publishLearningActivity,
  setLearningObjectiveStatus,
  submitLearningActivity,
} from './curriculum-application.js'
export { LearningApplicationError } from './errors.js'
export {
  proposeLearningEvaluation,
  reviewLearningEvaluation,
  reviewProjectLearningEvaluation,
} from './evaluation-application.js'
export type { LearningTransaction } from './membership-application.js'
export {
  bindLearningCourseRoom,
  requireLearningCourseRole,
  setLearningCourseMembership,
} from './membership-application.js'
export type { LearningMissionInfrastructure } from './missions-application.js'
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
  teacherAgentSummary(companyId: string, courseId: string, userId: string): Promise<unknown>
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

  overview(scope: LearningScope, projectId: string, windowDays: number) {
    return learningOverview(this.db, scope, projectId, windowDays)
  }

  learners(scope: LearningScope, projectId: string, input: LearningLearnersQuery) {
    return listLearningLearners(this.db, scope, projectId, input)
  }

  learnerDetail(scope: LearningScope, projectId: string, learnerId: string) {
    return learningLearnerDetail(this.db, scope, projectId, learnerId)
  }

  attemptDetail(scope: LearningScope, projectId: string, attemptId: string) {
    return learningAttemptDetail(this.db, scope, projectId, attemptId)
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

  async createCourse(scope: LearningScope, input: CreateCourseInput) {
    return this.createCourseForKind(scope, input, 'TEACHING')
  }

  async createInstitutionalCourse(scope: LearningScope, input: CreateCourseInput) {
    return this.createCourseForKind(scope, input, 'INSTITUTIONAL_COURSE')
  }

  private async createCourseForKind(
    scope: LearningScope,
    input: CreateCourseInput,
    projectKind: Extract<ProjectKind, 'TEACHING' | 'INSTITUTIONAL_COURSE'>,
  ) {
    const projectId = `p-${randomUUID().slice(0, 10)}`
    const courseId = `course-${randomUUID().slice(0, 12)}`
    const roomId = `course-room-${randomUUID().slice(0, 12)}`
    await this.infrastructure.transaction(async (db) => {
      const context = await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId,
        action: 'course:create',
        companyId: scope.companyId,
      })
      if (!projectKindBelongsToCompanyType(projectKind, context.company.type)) {
        throw new LearningApplicationError('forbidden', `${projectKind} is not valid for this Company`)
      }
      let planId: string | null = null
      if (projectKind === 'TEACHING') {
        const { teacherFreePlanId } = await ensureTeacherPlans(db)
        const entitlements = await resolvePlanEntitlements(db, teacherFreePlanId)
        const projectLimit = entitlements.number('teacher.project_limit')
        if (projectLimit !== null && await countActiveTeachingProjects(db, scope.companyId) >= projectLimit) {
          throw new LearningApplicationError('forbidden', 'Teacher Free Project limit reached')
        }
        planId = teacherFreePlanId
      }
      await insertCourse(db, { ...scope, projectId, courseId, roomId, kind: projectKind, planId, input })
      const creationKey = `project-created:${projectId}`
      await appendDomainEventInTransaction(db, {
        companyId: scope.companyId,
        projectId,
        aggregateType: 'PROJECT',
        aggregateId: projectId,
        idempotencyKey: creationKey,
        actor: { type: 'USER', id: scope.userId },
        event: {
          eventType: 'PROJECT.CREATED',
          schemaVersion: 1,
          payload: { courseId, kind: projectKind, status: 'ACTIVE' },
        },
      })
      await appendDomainEventInTransaction(db, {
        companyId: scope.companyId,
        projectId,
        aggregateType: 'PROJECT_MEMBERSHIP',
        aggregateId: `${projectId}:${scope.userId}`,
        idempotencyKey: `${creationKey}:owner`,
        actor: { type: 'USER', id: scope.userId },
        event: {
          eventType: 'PROJECT_MEMBERSHIP.ASSIGNED',
          schemaVersion: 1,
          payload: { userId: scope.userId, role: 'OWNER', source: 'COURSE_CREATION' },
        },
      })
      const teacher = await this.infrastructure.ensureTeacherAgent(scope.companyId, courseId, db)
      await this.infrastructure.bindTeacherOperationsContext(db, {
        companyId: scope.companyId,
        projectId,
        teacherId: scope.userId,
        agentId: teacher.agentId,
        channelId: teacher.roomId,
      })
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
        detail: { courseId, projectId, projectKind, name: input.name },
      })
    })
    return {
      id: courseId, companyId: scope.companyId, projectId, projectKind, name: input.name,
      description: input.description, color: input.color, status: 'ACTIVE',
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

  dashboard(scope: LearningScope) {
    return this.classroom(async () => {
      const candidates = await listLearningProjectSummaries(this.db, scope.companyId, scope.userId)
      const permissions = createPermissionService(this.db)
      const decisions = await Promise.all(candidates.map((row) => permissions.can({
        actorUserId: scope.userId,
        action: 'learning:read',
        companyId: scope.companyId,
        projectId: String(row.project_id),
        resource: { type: 'project', id: String(row.project_id) },
      })))
      const allowedRows = candidates.filter((_row, index) => decisions[index]?.allowed)
      const projectIds = allowedRows.map((row) => String(row.project_id))
      const [due, pendingReviews, states] = await Promise.all([
        listDueLearningStates(this.db, scope.companyId, scope.userId, projectIds),
        countViewerPendingLearningReviews(this.db, scope.companyId, scope.userId, projectIds),
        listViewerLearningStates(this.db, scope.companyId, scope.userId, projectIds),
      ])
      const projects = allowedRows.map((row) => ({
        projectId: String(row.project_id),
        projectKind: row.project_kind,
        ...(row.course_id ? { courseId: String(row.course_id) } : {}),
        title: row.title,
        description: row.description,
        status: row.status,
        perspective: row.perspective,
        learnerCount: Number(row.learner_count),
      }))
      return { projects, due, states, pendingReviews }
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
    return role === 'teacher' ? objectives : objectives.filter((objective) => objective.status === 'PUBLISHED')
  }

  async projectKnowledgeUnits(scope: LearningScope, projectId: string) {
    const permission = createPermissionService(this.db)
    await permission.assertCan({
      actorUserId: scope.userId, action: 'learning:read', companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    const canManage = await permission.can({
      actorUserId: scope.userId, action: 'learning:manage', companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    const units = await this.classroom(() => listProjectLearningKnowledgeUnits(this.db, scope.companyId, projectId))
    return canManage.allowed ? units : units.filter((unit) => unit.status === 'PUBLISHED')
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

  async projectActivities(scope: LearningScope, projectId: string) {
    const permission = createPermissionService(this.db)
    await permission.assertCan({
      actorUserId: scope.userId, action: 'learning:read', companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    const canManage = await permission.can({
      actorUserId: scope.userId, action: 'learning:manage', companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    return listProjectLearningActivities(this.db, scope.companyId, projectId, canManage.allowed)
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

  async importActivities(
    scope: LearningScope,
    projectId: string,
    input: LearningActivityImportInput,
  ) {
    return this.infrastructure.transaction((db) => importProjectLearningActivities(db, {
      companyId: scope.companyId,
      projectId,
      actorId: scope.userId,
      request: input,
      audit: (entry) => this.infrastructure.auditInTransaction(db, entry),
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
    const result = await this.classroom(() => submitLearningActivity(
      (work) => this.infrastructure.transaction(work), {
      companyId: scope.companyId, courseId, activityId, learnerId: scope.userId, ...input,
      },
    ))
    this.infrastructure.metric('learning.attempt.accepted', { source: 'ui' })
    return result
  }

  async submitProjectActivity(
    scope: LearningScope,
    projectId: string,
    activityId: string,
    input: SubmitActivityInput,
  ) {
    const result = await this.classroom(() => submitProjectLearningActivity(
      (work) => this.infrastructure.transaction(work), {
      companyId: scope.companyId, projectId, activityId, learnerId: scope.userId, ...input,
      },
    ))
    this.infrastructure.metric('learning.attempt.accepted', { source: 'ui' })
    return result
  }

  async missions(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope, courseId, 'learning:read')
    return this.classroom(() => listVisibleLearningMissions(this.db, scope, courseId))
  }

  async projectMissions(scope: LearningScope, projectId: string) {
    const permission = createPermissionService(this.db)
    await permission.assertCan({
      actorUserId: scope.userId, action: 'learning:read', companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    const canManage = await permission.can({
      actorUserId: scope.userId, action: 'learning:manage', companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    return this.classroom(() => listLearningMissions(this.db, {
      companyId: scope.companyId, projectId, userId: scope.userId, includeAllLearners: canManage.allowed,
    }))
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
      const project = await requireLearningCourseProjectScope(this.db, scope.companyId, courseId)
      return listLearningEvidenceRecords(this.db, {
        companyId: scope.companyId, projectId: project.projectId, learnerId,
      })
    })
  }

  async projectEvidence(scope: LearningScope, projectId: string, learnerId = scope.userId) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId,
      action: learnerId === scope.userId ? 'learning:read' : 'learning:review',
      companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    return this.classroom(() => listLearningEvidenceRecords(this.db, {
      companyId: scope.companyId, projectId, learnerId,
    }))
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
      const project = await requireLearningCourseProjectScope(this.db, scope.companyId, courseId)
      return listPendingLearningEvaluationRecords(this.db, scope.companyId, project.projectId)
    })
  }

  async projectReviews(scope: LearningScope, projectId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'learning:review', companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    return this.classroom(() => listPendingLearningEvaluationRecords(this.db, scope.companyId, projectId))
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
      const project = await requireLearningCourseProjectScope(this.db, scope.companyId, courseId)
      return listLearningProjectProgress(this.db, scope.companyId, project.projectId)
    })
  }

  async projectProgress(scope: LearningScope, projectId: string) {
    await createPermissionService(this.db).assertCan({
      actorUserId: scope.userId, action: 'learning:review', companyId: scope.companyId,
      resource: { type: 'project', id: projectId },
    })
    return this.classroom(() => listLearningProjectProgress(this.db, scope.companyId, projectId))
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

  async reviewProject(scope: LearningScope, projectId: string, evaluationId: string, input: ReviewEvaluationInput) {
    await this.classroom(() => reviewProjectLearningEvaluation(
      this.db,
      this.infrastructure.transaction,
      this.infrastructure.metric,
      {
        companyId: scope.companyId, projectId, evaluationId, reviewerId: scope.userId, ...input,
      },
    ))
    return { ok: true as const }
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
      if (error instanceof ForbiddenError) {
        throw new LearningApplicationError(error.status === 404 ? 'not_found' : 'forbidden', error.message)
      }
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

  private assertMemberChange(outcome: CourseMemberChangeOutcome): void {
    if (outcome === 'not_found') throw new LearningApplicationError('not_found', 'course member not found')
    if (outcome === 'last_teacher') {
      throw new LearningApplicationError('conflict', 'an active course must keep at least one teacher')
    }
    if (outcome === 'last_owner') {
      throw new LearningApplicationError('conflict', 'an active course must keep at least one owner')
    }
    if (outcome === 'protected_owner') {
      throw new LearningApplicationError('conflict', 'a course owner cannot be downgraded or removed')
    }
    if (outcome === 'protected_creator') {
      throw new LearningApplicationError('conflict', 'the course creator cannot be downgraded or removed')
    }
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
