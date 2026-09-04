import type { Queryable } from '../../db/queryable.js'
import { createPermissionService, resolvePlanEntitlements } from '../access/public.js'
import type { CreateProjectInvitationInput, LearningScope } from './contracts.js'
import { enqueueLearningEffect } from './effects-repository.js'
import { LearningApplicationError } from './errors.js'
import {
  companyMembershipRole,
  countActiveProjectStudents,
  courseMembershipRole,
  findVerifiedUser,
  insertAcceptedStudentMembership,
  insertProjectInvitation,
  invitationViewer,
  joinInvitationCompany,
  listProjectInvitations,
  lockProjectInvitation,
  priorProjectAcceptance,
  projectInvitationPreview,
  recordProjectAcceptance,
  revokeProjectInvitation,
} from './repository.js'

export interface LearningInvitationInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, event: {
    kind: string
    userId: string
    companyId: string
    detail: Record<string, unknown>
  }): Promise<void>
  generateInvitationToken(): string
  hashInvitationToken(token: string): string
  invitationUrl(token: string): string
  avatarForEmail(email: string): string
}

export class LearningInvitationApplication {
  constructor(
    private readonly db: Queryable,
    private readonly infrastructure: LearningInvitationInfrastructure,
  ) {}

  list(scope: LearningScope & { projectId: string }) {
    return listProjectInvitations(this.db, scope.projectId, scope.companyId)
  }

  async create(scope: LearningScope & { projectId: string }, input: CreateProjectInvitationInput) {
    const token = this.infrastructure.generateInvitationToken()
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86_400_000)
    const email = input.email?.toLowerCase() || null
    const note = input.note || null
    await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId,
        action: 'project_invitation:create',
        companyId: scope.companyId,
        projectId: scope.projectId,
      })
      const created = await insertProjectInvitation(db, {
        tokenHash,
        projectId: scope.projectId,
        companyId: scope.companyId,
        userId: scope.userId,
        email,
        note,
        maxUses: input.maxUses,
        expiresAt,
      })
      if (!created) throw new LearningApplicationError('not_found', 'Teaching Project not found')
      await this.infrastructure.auditInTransaction(db, {
        kind: 'project_invitation_create',
        userId: scope.userId,
        companyId: scope.companyId,
        detail: {
          projectId: scope.projectId,
          email,
          maxUses: input.maxUses,
          expiresInDays: input.expiresInDays,
        },
      })
    })
    return {
      id: tokenHash,
      token,
      url: this.infrastructure.invitationUrl(token),
      email,
      role: 'learner' as const,
      note,
      maxUses: input.maxUses,
      useCount: 0,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active',
    }
  }

  async revoke(scope: LearningScope & { projectId: string }, invitationId: string) {
    const revoked = await this.infrastructure.transaction(async (db) => {
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: scope.userId,
        action: 'project_invitation:revoke',
        companyId: scope.companyId,
        projectId: scope.projectId,
      })
      const revoked = await revokeProjectInvitation(db, scope.projectId, scope.companyId, invitationId)
      if (revoked) {
        await this.infrastructure.auditInTransaction(db, {
          kind: 'project_invitation_revoke',
          userId: scope.userId,
          companyId: scope.companyId,
          detail: { projectId: scope.projectId, invitationId },
        })
      }
      return revoked
    })
    return { ok: true as const, revoked }
  }

  async preview(token: string, viewerId?: string) {
    const invitation = await projectInvitationPreview(
      this.db,
      this.infrastructure.hashInvitationToken(token),
    )
    if (!invitation) return { status: 'not_found', kind: 'project' as const }
    let status = invitation.revoked_at
      ? 'revoked'
      : new Date(invitation.expires_at).getTime() < Date.now()
        ? 'expired'
        : invitation.use_count >= invitation.max_uses
          ? 'consumed'
          : invitation.project_status !== 'ACTIVE'
              || (invitation.company_status !== 'ACTIVE' && invitation.company_status !== 'TRIAL')
            ? 'archived'
            : 'valid'
    if (viewerId) {
      const viewer = await invitationViewer(this.db, viewerId, invitation.course_id)
      if (viewer?.role) status = 'already_member'
      else if (invitation.email && viewer?.email.toLowerCase() !== invitation.email) {
        status = 'wrong_email'
      }
    }
    return {
      kind: 'project' as const,
      status,
      invitation: {
        role: 'learner' as const,
        email: invitation.email,
        note: invitation.note,
        expiresAt: new Date(invitation.expires_at).toISOString(),
        inviterName: invitation.inviter_name,
        company: {
          id: invitation.company_id,
          name: invitation.company_name,
          slug: invitation.company_slug,
        },
        course: {
          id: invitation.course_id,
          name: invitation.course_name,
          projectId: invitation.project_id,
          studyRoomId: invitation.room_id,
        },
      },
    }
  }

  async accept(userId: string, token: string) {
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const user = await findVerifiedUser(this.db, userId)
    if (!user) throw new LearningApplicationError('unauthorized', 'session points to missing user')
    if (!user.email_verified_at) {
      throw new LearningApplicationError(
        'forbidden',
        'a verified email is required to accept a Project invitation',
      )
    }
    const result = await this.infrastructure.transaction(async (db) => {
      const invitation = await lockProjectInvitation(db, tokenHash, userId)
      if (!invitation) throw new LearningApplicationError('not_found', 'invitation not found')
      if (invitation.revoked_at) throw new LearningApplicationError('gone', 'invitation revoked')
      if (new Date(invitation.expires_at).getTime() < Date.now()) {
        throw new LearningApplicationError('gone', 'invitation expired')
      }
      if (invitation.project_status !== 'ACTIVE') {
        throw new LearningApplicationError('gone', 'course archived')
      }
      if (invitation.company_status !== 'ACTIVE' && invitation.company_status !== 'TRIAL') {
        throw new LearningApplicationError('gone', 'company is not accepting memberships')
      }
      if (invitation.email && invitation.email !== user.email.toLowerCase()) {
        throw new LearningApplicationError(
          'forbidden',
          `this invitation is reserved for ${invitation.email}`,
        )
      }
      const prior = await priorProjectAcceptance(db, tokenHash, userId)
      const companyRole = await companyMembershipRole(db, invitation.company_id, userId)
      const joinedCompany = !companyRole
      if (joinedCompany) {
        await joinInvitationCompany(db, {
          companyId: invitation.company_id,
          userId,
          displayName: user.display_name,
          avatarUrl: user.avatar_url ?? this.infrastructure.avatarForEmail(user.email),
        })
      }
      const existingRole = await courseMembershipRole(db, invitation.course_id, userId)
      if (prior && !existingRole) {
        throw new LearningApplicationError(
          'gone',
          'this invitation was already accepted and no longer grants course access',
        )
      }
      const addsStudent = !prior && !existingRole
      if (addsStudent && invitation.use_count >= invitation.max_uses) {
        throw new LearningApplicationError('gone', 'invitation already used')
      }
      if (addsStudent) {
        const entitlements = await resolvePlanEntitlements(db, invitation.project_plan_id)
        const studentLimit = entitlements.number('teacher.student_limit')
        if (
          studentLimit !== null
          && await countActiveProjectStudents(db, invitation.company_id, invitation.project_id)
            >= studentLimit
        ) {
          throw new LearningApplicationError('forbidden', 'Teacher Free Student limit reached')
        }
        await insertAcceptedStudentMembership(db, { invitation, userId })
        await recordProjectAcceptance(db, { tokenHash, userId })
      }
      const role = existingRole ?? 'learner'
      await this.infrastructure.auditInTransaction(db, {
        kind: 'project_invitation_accept',
        userId,
        companyId: invitation.company_id,
        detail: { courseId: invitation.course_id, role },
      })
      await enqueueLearningEffect(db, {
        companyId: invitation.company_id,
        courseId: invitation.course_id,
        kind: 'study_room.sync',
      })
      await enqueueLearningEffect(db, {
        companyId: invitation.company_id,
        courseId: invitation.course_id,
        kind: 'teacher_room.sync',
      })
      await enqueueLearningEffect(db, {
        companyId: invitation.company_id,
        courseId: invitation.course_id,
        kind: 'member_onboarding.seed',
        effectKey: userId,
        payload: { userId },
      })
      return {
        companyId: invitation.company_id,
        companyName: invitation.company_name,
        companySlug: invitation.company_slug,
        companyRole: companyRole ?? 'member',
        companyStatus: invitation.company_status,
        courseId: invitation.course_id,
        courseName: invitation.course_name,
        projectId: invitation.project_id,
        roomId: invitation.room_id,
        role,
        alreadyMember: Boolean(existingRole),
        joinedCompany,
      }
    })
    return {
      ok: true as const,
      alreadyMember: result.alreadyMember,
      joinedCompany: result.joinedCompany,
      company: {
        id: result.companyId,
        name: result.companyName,
        slug: result.companySlug,
        role: result.companyRole,
        status: result.companyStatus,
      },
      course: {
        id: result.courseId,
        name: result.courseName,
        projectId: result.projectId,
        studyRoomId: result.roomId,
        role: result.role,
      },
    }
  }
}
