import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { Queryable } from '../../db/queryable.js'
import {
  bindCourseRoom,
  closeActivity,
  courseProgress,
  draftActivity,
  learningDashboard,
  listActivities,
  listEvaluationQueue,
  listEvidence,
  listMissions,
  publishActivity,
  reviewEvaluation,
  setMissionCoordinator,
  submitActivity,
} from '../../learning/service.js'
import type {
  BindCourseRoomInput,
  CreateActivityInput,
  CreateCourseInput,
  CreateCourseInvitationInput,
  CreateObjectivesInput,
  CreateLearningObjectivesCommand,
  LearningScope,
  MissionCoordinatorInput,
  NotificationPreferencesInput,
  ObjectiveStatusInput,
  ReviewEvaluationInput,
  SubmitActivityInput,
  UpdateCourseInput,
} from './contracts.js'
import {
  canCreateCourse,
  changeCourseMember,
  companyMembershipRole,
  courseInvitationPreview,
  courseExists,
  courseManager,
  courseMembershipRole,
  courseRole,
  findCourse,
  findNotificationPreferences,
  findVerifiedUser,
  insertCourse,
  insertCourseInvitation,
  insertLearningObjective,
  insertLearningObjectiveDependency,
  invitationViewer,
  joinInvitationCompany,
  listCourseInvitations,
  listCourseMembers,
  listCourses,
  listDeliveries,
  listLearningObjectives,
  lockCourseInvitation,
  priorCourseAcceptance,
  recordCourseAcceptance,
  removeMemberFromProjectChannels,
  revokeCourseInvitation,
  setCourseArchived,
  studyRoomState,
  syncStudyRoomMembers,
  updateCourseMetadata,
  updateLearningObjectiveStatus,
  upsertNotificationPreferences,
  upsertAcceptedCourseMembership,
} from './repository.js'

export type LearningApplicationErrorCode = 'invalid' | 'not_found' | 'forbidden' | 'conflict' | 'gone' | 'unauthorized'

export class LearningApplicationError extends Error {
  constructor(readonly code: LearningApplicationErrorCode, message: string) { super(message) }
}

export interface LearningInfrastructure {
  transaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T>
  audit(event: { kind: string; userId: string; companyId: string; detail: Record<string, unknown> }): Promise<void>
  ensureTeacherAgent(courseId: string, db: Pick<PoolClient, 'query'>): Promise<{ created: boolean }>
  syncTeacherRoom(courseId: string): Promise<void>
  welcomeTeacherAgent(courseId: string): Promise<void>
  closeTeacherRoom(courseId: string): Promise<void>
  reactivateTeacherRoom(courseId: string): Promise<void>
  ensureNotebook(projectId: string, companyId: string): Promise<void>
  syncNotebook(projectId: string): Promise<void>
  syncChannel(channel: { channelId: string; title: string; members: string[]; leaderAgentId?: string }): Promise<void>
  revokeDocumentSubscriptions(userId: string, projectId: string): Promise<void>
  publishDocumentAccessRevoked(event: { companyId: string; workspaceId: string; userId: string }): Promise<void>
  seedMemberDms(companyId: string, userId: string): Promise<void>
  generateInvitationToken(): string
  hashInvitationToken(token: string): string
  invitationUrl(token: string): string
  avatarForEmail(email: string): string
  teacherAgentSummary(courseId: string, userId: string): Promise<unknown>
}

const privilegedRoles = new Set(['owner', 'admin'])

export type LearningTransaction = <T>(work: (db: Queryable) => Promise<T>) => Promise<T>

function objectiveText(value: string, name: string): string {
  const text = value.trim()
  if (!text || text.length > 10_000) throw new LearningApplicationError('invalid', `${name} is required`)
  return text
}

function objectiveLevel(value: number | undefined): 1 | 2 | 3 | 4 {
  const level = value ?? 3
  if (!Number.isInteger(level) || level < 1 || level > 4) {
    throw new LearningApplicationError('invalid', 'targetLevel must be between 1 and 4')
  }
  return level as 1 | 2 | 3 | 4
}

export async function createLearningObjectives(
  db: Queryable,
  transaction: LearningTransaction,
  input: CreateLearningObjectivesCommand,
) {
  if (!input.objectives.length || input.objectives.length > 100) {
    throw new LearningApplicationError('invalid', 'objectives must contain between 1 and 100 items')
  }
  await transaction(async (client) => {
    if (input.actorKind === 'teacher') {
      const role = await courseRole(client, input.courseId, input.companyId, input.actorId)
      if (role !== 'teacher') throw new LearningApplicationError('forbidden', 'course teacher role required')
    }
    for (const [position, objective] of input.objectives.entries()) {
      const objectiveId = randomUUID()
      await insertLearningObjective(client, {
        id: objectiveId,
        companyId: input.companyId,
        courseId: input.courseId,
        actorId: input.actorId,
        title: objectiveText(objective.title, 'objective title'),
        successCriteria: objectiveText(objective.successCriteria, 'successCriteria'),
        targetLevel: objectiveLevel(objective.targetLevel),
        position,
      })
      for (const prerequisiteId of objective.prerequisiteIds ?? []) {
        await insertLearningObjectiveDependency(client, {
          companyId: input.companyId,
          courseId: input.courseId,
          objectiveId,
          prerequisiteId,
        })
      }
    }
  })
  return listLearningObjectives(db, input.companyId, input.courseId)
}

export async function setLearningObjectiveStatus(
  db: Queryable,
  input: {
    companyId: string
    courseId: string
    objectiveId: string
    teacherId: string
    status: 'draft' | 'published' | 'archived'
  },
): Promise<void> {
  if (!await updateLearningObjectiveStatus(db, input)) {
    throw new LearningApplicationError('not_found', 'objective not found')
  }
}

export class LearningApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: LearningInfrastructure) {}

  courses(scope: LearningScope) { return listCourses(this.db, scope.companyId, scope.userId) }

  async createCourse(scope: LearningScope, input: CreateCourseInput) {
    const permission = await canCreateCourse(this.db, scope.companyId, scope.userId)
    if (!permission) throw new LearningApplicationError('forbidden', 'not a member of this company')
    if (!privilegedRoles.has(permission.company_role) && !permission.is_teacher) {
      throw new LearningApplicationError('forbidden', 'only a company admin or existing teacher can create courses')
    }
    const projectId = `p-${randomUUID().slice(0, 10)}`
    const courseId = `course-${randomUUID().slice(0, 12)}`
    const roomId = `course-room-${randomUUID().slice(0, 12)}`
    const teacher = await this.infrastructure.transaction(async (db) => {
      await insertCourse(db, { ...scope, projectId, courseId, roomId, input })
      return this.infrastructure.ensureTeacherAgent(courseId, db)
    })
    await this.syncStudyRoom(courseId)
    await this.infrastructure.syncTeacherRoom(courseId)
    if (teacher.created) await this.infrastructure.welcomeTeacherAgent(courseId)
    await this.infrastructure.ensureNotebook(projectId, scope.companyId)
    await this.infrastructure.audit({
      kind: 'course_create', userId: scope.userId, companyId: scope.companyId,
      detail: { courseId, projectId, name: input.name },
    })
    return {
      id: courseId, companyId: scope.companyId, projectId, name: input.name,
      description: input.description, color: input.color, status: 'active',
      createdBy: scope.userId, studyRoomId: roomId, courseRole: 'teacher', memberCount: 1,
      canManage: true, knowledgeState: 'ready',
    }
  }

  async course(scope: LearningScope, courseId: string) {
    const course = await findCourse(this.db, courseId, scope.companyId, scope.userId)
    if (!course) throw new LearningApplicationError('not_found', 'course not found')
    return course
  }

  async updateCourse(userId: string, courseId: string, patch: UpdateCourseInput) {
    const manager = await this.manager(userId, courseId, true)
    await updateCourseMetadata(this.db, { courseId, companyId: manager.companyId, projectId: manager.projectId, patch })
    if (patch.name !== undefined) await this.syncStudyRoom(courseId)
    await this.infrastructure.syncNotebook(manager.projectId)
    await this.infrastructure.audit({
      kind: 'course_update', userId, companyId: manager.companyId,
      detail: { courseId, ...patch },
    })
    return { ok: true as const }
  }

  async archiveCourse(userId: string, courseId: string, archive: boolean) {
    const manager = await this.manager(userId, courseId)
    await setCourseArchived(this.db, manager.companyId, manager.projectId, archive)
    if (archive) await this.infrastructure.closeTeacherRoom(courseId)
    else await this.infrastructure.reactivateTeacherRoom(courseId)
    await this.infrastructure.syncNotebook(manager.projectId)
    await this.infrastructure.audit({
      kind: archive ? 'course_archive' : 'course_unarchive', userId, companyId: manager.companyId,
      detail: { courseId },
    })
    return { ok: true as const, status: archive ? 'archived' : 'active' }
  }

  async members(userId: string, courseId: string) {
    const manager = await this.manager(userId, courseId)
    return listCourseMembers(this.db, courseId, manager.companyId)
  }

  async updateMember(userId: string, courseId: string, targetId: string, role: 'teacher' | 'learner') {
    const manager = await this.manager(userId, courseId, true)
    const outcome = await this.infrastructure.transaction((db) => changeCourseMember(db, {
      courseId, companyId: manager.companyId, userId: targetId, role,
    }))
    this.assertMemberChange(outcome)
    await this.infrastructure.syncTeacherRoom(courseId)
    await this.infrastructure.audit({
      kind: 'course_member_role_update', userId, companyId: manager.companyId,
      detail: { courseId, targetId, role },
    })
    return { ok: true as const, userId: targetId, role }
  }

  async removeMember(userId: string, courseId: string, targetId: string) {
    const manager = await this.manager(userId, courseId, true)
    const channels = await this.infrastructure.transaction(async (db) => {
      const outcome = await changeCourseMember(db, {
        courseId, companyId: manager.companyId, userId: targetId, role: null,
      })
      this.assertMemberChange(outcome)
      return removeMemberFromProjectChannels(db, {
        companyId: manager.companyId, projectId: manager.projectId, userId: targetId,
      })
    })
    await Promise.all(channels.map((channel) => this.infrastructure.syncChannel({
      channelId: channel.id, title: channel.title, members: channel.members,
    })))
    await this.infrastructure.revokeDocumentSubscriptions(targetId, manager.projectId)
    await this.infrastructure.publishDocumentAccessRevoked({
      companyId: manager.companyId, workspaceId: manager.projectId, userId: targetId,
    })
    await this.syncStudyRoom(courseId)
    await this.infrastructure.syncTeacherRoom(courseId)
    await this.infrastructure.audit({
      kind: 'course_member_remove', userId, companyId: manager.companyId,
      detail: { courseId, targetId },
    })
    return { ok: true as const }
  }

  async invitations(userId: string, courseId: string) {
    const manager = await this.manager(userId, courseId)
    return listCourseInvitations(this.db, courseId, manager.companyId)
  }

  async createInvitation(userId: string, courseId: string, input: CreateCourseInvitationInput) {
    const manager = await this.manager(userId, courseId, true, 'archived courses cannot issue invitations')
    const token = this.infrastructure.generateInvitationToken()
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000)
    const email = input.email?.toLowerCase() || null
    const note = input.note || null
    await this.infrastructure.transaction((db) => insertCourseInvitation(db, {
      tokenHash, courseId, companyId: manager.companyId, userId, email,
      role: input.role, note, maxUses: input.maxUses, expiresAt,
    }))
    await this.infrastructure.audit({
      kind: 'course_invitation_create', userId, companyId: manager.companyId,
      detail: { courseId, email, role: input.role, maxUses: input.maxUses, expiresInDays: input.expiresInDays },
    })
    return {
      id: tokenHash, token, url: this.infrastructure.invitationUrl(token), email, role: input.role,
      note, maxUses: input.maxUses, useCount: 0, createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(), status: 'active',
    }
  }

  async revokeInvitation(userId: string, courseId: string, invitationId: string) {
    const manager = await this.manager(userId, courseId)
    const revoked = await revokeCourseInvitation(this.db, courseId, manager.companyId, invitationId)
    if (revoked) await this.infrastructure.audit({
      kind: 'course_invitation_revoke', userId, companyId: manager.companyId,
      detail: { courseId, invitationId },
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
      return {
        companyId: invitation.company_id, companyName: invitation.company_name,
        companySlug: invitation.company_slug, companyRole: companyRole ?? 'member',
        courseId: invitation.course_id, courseName: invitation.course_name,
        projectId: invitation.project_id, roomId: invitation.room_id, role,
        alreadyMember: Boolean(existingRole) && !changesRole, joinedCompany,
      }
    })
    await this.syncStudyRoom(result.courseId)
    await this.infrastructure.syncTeacherRoom(result.courseId)
    if (result.joinedCompany) await this.infrastructure.seedMemberDms(result.companyId, userId)
    await this.infrastructure.audit({
      kind: 'course_invitation_accept', userId, companyId: result.companyId,
      detail: { courseId: result.courseId, role: result.role },
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
    return this.classroom(() => learningDashboard(scope.companyId, scope.userId, this.db))
  }

  async teacherAgent(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => this.infrastructure.teacherAgentSummary(courseId, scope.userId))
  }

  async bindRoom(scope: LearningScope, courseId: string, conversationId: string, input: BindCourseRoomInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await bindCourseRoom({ courseId, teacherId: scope.userId, conversationId, purpose: input.purpose }, this.db)
      return { ok: true as const }
    })
  }

  async objectives(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    const role = await courseRole(this.db, courseId, scope.companyId, scope.userId)
    if (!role) throw new LearningApplicationError('forbidden', 'course membership required')
    const objectives = await this.classroom(() => listLearningObjectives(this.db, scope.companyId, courseId))
    return role === 'teacher' ? objectives : objectives.filter((objective) => objective.status === 'published')
  }

  async createObjectives(scope: LearningScope, courseId: string, input: CreateObjectivesInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => createLearningObjectives(this.db, (work) => this.infrastructure.transaction(work), {
      companyId: scope.companyId,
      courseId,
      actorId: scope.userId,
      actorKind: 'teacher',
      objectives: input.objectives,
    }))
  }

  async setObjectiveStatus(scope: LearningScope, courseId: string, objectiveId: string, input: ObjectiveStatusInput) {
    await this.assertCourseScope(scope.companyId, courseId)
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
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => listActivities(courseId, scope.userId, this.db))
  }

  async createActivity(scope: LearningScope, courseId: string, input: CreateActivityInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => draftActivity({
      courseId, actorId: scope.userId, ...input,
    }, this.db))
  }

  async activity(scope: LearningScope, courseId: string, activityId: string) {
    const visible = await this.activities(scope, courseId)
    const activity = visible.find((item) => item.id === activityId)
    if (!activity) throw new LearningApplicationError('not_found', 'activity not found')
    return activity
  }

  async publishActivity(scope: LearningScope, courseId: string, activityId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await publishActivity(courseId, activityId, scope.userId, this.db)
      return { ok: true as const }
    })
  }

  async closeActivity(scope: LearningScope, courseId: string, activityId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await closeActivity(courseId, activityId, scope.userId, this.db)
      return { ok: true as const }
    })
  }

  async submitActivity(scope: LearningScope, courseId: string, activityId: string, input: SubmitActivityInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => submitActivity({
      courseId, activityId, learnerId: scope.userId, ...input,
    }, this.db))
  }

  async missions(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => listMissions(courseId, scope.userId, this.db))
  }

  async setMissionCoordinator(
    scope: LearningScope,
    courseId: string,
    missionId: string,
    input: MissionCoordinatorInput,
  ) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => setMissionCoordinator({
      courseId, missionId, teacherId: scope.userId, agentId: input.agentId,
    }, this.db))
  }

  async evidence(scope: LearningScope, courseId: string, learnerId = scope.userId) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => listEvidence(courseId, scope.userId, learnerId, this.db))
  }

  async reviews(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => listEvaluationQueue(courseId, scope.userId, this.db))
  }

  async progress(scope: LearningScope, courseId: string) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(() => courseProgress(courseId, scope.userId, this.db))
  }

  async review(scope: LearningScope, courseId: string, evaluationId: string, input: ReviewEvaluationInput) {
    await this.assertCourseScope(scope.companyId, courseId)
    return this.classroom(async () => {
      await reviewEvaluation({
        courseId, evaluationId, teacherId: scope.userId, ...input,
      }, this.db)
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
      const role = await courseRole(this.db, input.courseId, scope.companyId, scope.userId)
      if (!role) throw new LearningApplicationError('forbidden', 'course membership required')
    }
    await upsertNotificationPreferences(this.db, { id: randomUUID(), ...scope, ...input })
    return this.notificationPreferences(scope, input.courseId)
  }

  deliveries(scope: LearningScope) { return listDeliveries(this.db, scope.companyId, scope.userId) }

  private async manager(userId: string, courseId: string, active = false, archivedMessage = 'archived courses are read-only') {
    const manager = await courseManager(this.db, courseId, userId)
    if (!manager) throw new LearningApplicationError('not_found', 'course not found')
    if (!privilegedRoles.has(manager.companyRole) && manager.courseRole !== 'teacher') {
      throw new LearningApplicationError('forbidden', 'this action requires a course teacher or company admin')
    }
    if (active && manager.status !== 'active') throw new LearningApplicationError('conflict', archivedMessage)
    return manager
  }

  private async assertCourseScope(companyId: string, courseId: string): Promise<void> {
    if (!await courseExists(this.db, courseId, companyId)) {
      throw new LearningApplicationError('not_found', 'course not found')
    }
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
