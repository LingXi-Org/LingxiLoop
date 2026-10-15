import { lockEducationAdmissions } from './repository.js'
import { acceptEducationInvitation } from './admission.js'
import type { Queryable } from '../../db/queryable.js'
import {
  companyRoleToWire,
} from '../../domain/access/public.js'
import { createPermissionService } from '../access/public.js'
import type {
  CreateInvitationInput,
  InvitationPreview,
  RequestAuditContext,
  UpdateCompanyInput,
} from './contracts.js'
import {
  emailAlreadyMember,
  findCompany,
  findCompanyForMember,
  findUser,
  insertInvitation,
  invitationEmailContext,
  invitationWithCompany,
  isCompanyMember,
  isDepartedCompanyHuman,
  listCompanies,
  listInvitations,
  listMembers,
  lockCompany,
  memberRole,
  removeMemberState,
  promoteStudentState,
  assertAdministratorCanDepart,
  revokeActiveEmailInvitations,
  revokeInvitation,
  setMemberRole,
  updateCompany,
} from './repository.js'

export type CompanyErrorCode = 'not_found' | 'forbidden' | 'conflict' | 'gone' | 'unauthorized'

export class CompanyApplicationError extends Error {
  constructor(readonly code: CompanyErrorCode, message: string) { super(message) }
}

interface AuditInput {
  kind: string
  userId: string
  companyId: string
  ip?: string | null
  userAgent?: string | null
  detail?: Record<string, unknown>
}

export interface CompanyInfrastructure {
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  auditInTransaction(db: Queryable, input: AuditInput): Promise<void>
  syncChannel(args: { channelId: string; channelType: 2; title: string; members: string[] }): Promise<void>
  disconnectUser(userId: string, companyId: string): Promise<void>
  generateInvitationToken(): string
  hashInvitationToken(token: string): string
  invitationBaseUrl: string
  sendInvitationEmail(args: {
    to: string; inviterName: string; inviterEmail: string; companyName: string
    role: string; note: string | null; inviteUrl: string
  }): Promise<unknown>
}

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7
function baseInvitation(invitation: Awaited<ReturnType<typeof invitationWithCompany>> & {}) {
  return {
    role: companyRoleToWire(invitation.role),
    isAdmin: invitation.is_admin,
    email: invitation.email,
    note: invitation.note,
    expiresAt: new Date(invitation.expires_at).toISOString(),
    createdAt: new Date(invitation.created_at).toISOString(),
    inviterName: invitation.inviter_name,
    company: {
      id: invitation.company_id,
      name: invitation.company_name,
      slug: invitation.company_slug,
    },
    multiUse: invitation.max_uses > 1,
  }
}

export class CompanyApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: CompanyInfrastructure) {}

  async companies(userId: string) {
    const companies = await listCompanies(this.db, userId)
    const decisions = await Promise.all(companies.map(async (company) => ({
      company,
      decision: await createPermissionService(this.db).can({
        actorUserId: userId,
        action: 'company:list',
        companyId: company.id,
      }),
    })))
    return decisions.filter(({ decision }) => decision.allowed).map(({ company }) => company)
  }

  async company(companyId: string, userId: string) {
    await createPermissionService(this.db).assertCan({ actorUserId: userId, action: 'company:read', companyId })
    const company = await findCompanyForMember(this.db, companyId, userId)
    if (!company) throw new CompanyApplicationError('not_found', 'company not found')
    return company
  }

  private async assertPermission(
    db: Queryable,
    companyId: string,
    userId: string,
    action: 'company:read' | 'company:update' | 'company_member:list' | 'company_member:update' | 'company_member:remove'
      | 'company_invitation:list' | 'company_invitation:create' | 'company_invitation:revoke',
    lockDependencies = false,
  ): Promise<void> {
    await createPermissionService(db, { lockDependencies }).assertCan({ actorUserId: userId, action, companyId })
  }

  async editCompany(
    companyId: string,
    userId: string,
    input: UpdateCompanyInput,
    auditContext: RequestAuditContext,
  ) {
    await this.infrastructure.transaction(async (db) => {
      await lockEducationAdmissions(db)
      await this.assertPermission(db, companyId, userId, 'company:update', true)
      if (!await updateCompany(db, companyId, input)) {
        throw new CompanyApplicationError('not_found', 'company not found')
      }
      await this.infrastructure.auditInTransaction(db, {
        kind: 'company_update', userId, companyId, ...auditContext, detail: input,
      })
    })
    const company = await findCompany(this.db, companyId)
    if (!company) throw new CompanyApplicationError('not_found', 'company not found')
    return company
  }

  async members(companyId: string, userId: string) {
    await this.assertPermission(this.db, companyId, userId, 'company_member:list')
    return listMembers(this.db, companyId)
  }

  async changeMemberRole(args: {
    companyId: string; userId: string; targetId: string; isAdmin: boolean; audit: RequestAuditContext
  }) {
    await this.infrastructure.transaction(async (db) => {
      await lockEducationAdmissions(db)
      await this.assertPermission(db, args.companyId, args.userId, 'company_member:update', true)
      const current = await memberRole(db, args.companyId, args.targetId, true)
      if (!current) throw new CompanyApplicationError('not_found', 'member not found')
      if (current !== 'TEACHER') throw new CompanyApplicationError('conflict', 'only teachers can administer a company')
      if (!args.isAdmin) await assertAdministratorCanDepart(db, args.companyId, args.targetId)
      await setMemberRole(db, args.companyId, args.targetId, args.isAdmin)
      await this.infrastructure.auditInTransaction(db, {
        kind: 'company_member_role_update', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { targetId: args.targetId, isAdmin: args.isAdmin },
      })
    })
    return { ok: true as const, userId: args.targetId, isAdmin: args.isAdmin }
  }

  async promoteStudent(args: {
    companyId: string; userId: string; targetId: string; projectId: string; audit: RequestAuditContext
  }) {
    await this.infrastructure.transaction(async (db) => {
      await lockEducationAdmissions(db)
      await this.assertPermission(db, args.companyId, args.userId, 'company_member:update', true)
      const role = await memberRole(db, args.companyId, args.targetId, true)
      if (role !== 'STUDENT') throw new CompanyApplicationError('conflict', 'only an active student can become a teacher')
      await createPermissionService(db, { lockDependencies: true }).assertCan({
        actorUserId: args.userId, action: 'project_member:remove', companyId: args.companyId, projectId: args.projectId,
      })
      const scope = await db.query(`SELECT 1 FROM project_memberships student
        JOIN projects project ON project.id=student.project_id AND project.company_id=student.company_id
        JOIN project_memberships teacher ON teacher.project_id=student.project_id AND teacher.company_id=student.company_id
        JOIN company_memberships company_teacher ON company_teacher.company_id=teacher.company_id AND company_teacher.user_id=teacher.user_id
        JOIN company_memberships company_student ON company_student.company_id=student.company_id AND company_student.user_id=student.user_id
        WHERE student.company_id=$1 AND student.project_id=$2 AND student.user_id=$3
          AND student.role='STUDENT' AND student.status='ACTIVE' AND student.company_period_id=company_student.period_id
          AND teacher.user_id=$4 AND teacher.role='TEACHER' AND teacher.status='ACTIVE'
          AND teacher.company_period_id=company_teacher.period_id AND project.status='ACTIVE'
        FOR UPDATE OF student,teacher,project`, [args.companyId,args.projectId,args.targetId,args.userId])
      if (!scope.rows[0]) throw new CompanyApplicationError('forbidden', 'student must belong to your active course')
      await promoteStudentState(db, args.companyId, args.targetId)
      await this.infrastructure.auditInTransaction(db, {
        kind: 'company_student_promoted', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { targetId: args.targetId, projectId: args.projectId, role: 'TEACHER', isAdmin: false },
      })
    })
    // The durable access.revoke effect retries external cleanup after provider failures.
    await this.infrastructure.disconnectUser(args.targetId, args.companyId).catch(() => undefined)
    return { ok: true as const, userId: args.targetId, role: 'teacher' as const }
  }

  async removeMember(args: {
    companyId: string; userId: string; targetId: string; audit: RequestAuditContext
  }) {
    await this.infrastructure.transaction(async (db) => {
      await lockEducationAdmissions(db)
      await this.assertPermission(db, args.companyId, args.userId, args.targetId === args.userId ? 'company:read' : 'company_member:remove', true)
      const role = await memberRole(db, args.companyId, args.targetId, true)
      if (!role) {
        if (await isDepartedCompanyHuman(db, args.companyId, args.targetId)) return
        throw new CompanyApplicationError('not_found', 'member not found')
      }
      await assertAdministratorCanDepart(db, args.companyId, args.targetId)
      await removeMemberState(db, args.companyId, args.targetId)
      await this.infrastructure.auditInTransaction(db, {
        kind: 'company_member_remove', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { targetId: args.targetId },
      })
    })
    // Durable access.revoke effects finish external cleanup even when a provider is unavailable.
    await this.infrastructure.disconnectUser(args.targetId, args.companyId)
    return { ok: true as const }
  }

  async invitation(token: string, viewerUserId: string | null): Promise<InvitationPreview> {
    const invitation = await invitationWithCompany(this.db, this.infrastructure.hashInvitationToken(token))
    if (!invitation) return { status: 'not_found' }
    const base = baseInvitation(invitation)
    if (invitation.revoked_at) return { status: 'revoked', invitation: base }
    if (new Date(invitation.expires_at).getTime() < Date.now()) return { status: 'expired', invitation: base }
    if (invitation.use_count >= invitation.max_uses) return { status: 'consumed', invitation: base }
    if (viewerUserId) {
      if (await isCompanyMember(this.db, invitation.company_id, viewerUserId)) {
        return { status: 'already_member', invitation: base }
      }
      const viewer = await findUser(this.db, viewerUserId)
      if (invitation.email && viewer && invitation.email.toLowerCase() !== viewer.email.toLowerCase()) {
        return { status: 'wrong_email', invitation: base }
      }
    }
    return { status: 'valid', invitation: base }
  }

  async invitations(companyId: string, userId: string) {
    await this.assertPermission(this.db, companyId, userId, 'company_invitation:list')
    const rows = await listInvitations(this.db, companyId)
    const now = Date.now()
    return rows.map((invitation) => ({
      id: invitation.token_hash,
      email: invitation.email,
      role: companyRoleToWire(invitation.role),
    isAdmin: invitation.is_admin,
      note: invitation.note,
      maxUses: invitation.max_uses,
      useCount: invitation.use_count,
      createdAt: new Date(invitation.created_at).toISOString(),
      expiresAt: new Date(invitation.expires_at).toISOString(),
      revokedAt: invitation.revoked_at ? new Date(invitation.revoked_at).toISOString() : null,
      lastAcceptedAt: invitation.last_accepted_at ? new Date(invitation.last_accepted_at).toISOString() : null,
      lastAcceptedBy: invitation.last_accepted_by,
      invitedBy: invitation.invited_by,
      inviterName: invitation.inviter_name,
      status: invitation.revoked_at ? 'revoked'
        : new Date(invitation.expires_at).getTime() < now ? 'expired'
          : invitation.use_count >= invitation.max_uses ? 'consumed' : 'active',
    }))
  }

  private inviteUrl(token: string): string {
    return `${this.infrastructure.invitationBaseUrl.replace(/\/+$/, '')}/invite/${encodeURIComponent(token)}`
  }

  async createInvitation(args: {
    companyId: string; userId: string; input: CreateInvitationInput; audit: RequestAuditContext
  }) {
    const email = args.input.email?.toLowerCase() ?? null
    const maxUses = 1
    const note = args.input.note || null
    const token = this.infrastructure.generateInvitationToken()
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await this.infrastructure.transaction(async (db) => {
      await lockEducationAdmissions(db)
      await this.assertPermission(db, args.companyId, args.userId, 'company_invitation:create', true)
      if (!await lockCompany(db, args.companyId)) throw new CompanyApplicationError('not_found', 'company not found')
      if (email) {
        if (await emailAlreadyMember(db, args.companyId, email)) {
          throw new CompanyApplicationError('conflict', 'that email is already a member of this workspace')
        }
        await revokeActiveEmailInvitations(db, args.companyId, email)
      }
      await insertInvitation(db, {
        tokenHash, companyId: args.companyId, invitedBy: args.userId, email,
        isAdmin: args.input.isAdmin, note, maxUses, expiresAt,
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'invitation_create', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { email, isAdmin: args.input.isAdmin, maxUses, note: note ?? undefined },
      })
    })
    const url = this.inviteUrl(token)
    let emailDelivery: unknown = null
    if (args.input.sendEmail && email) {
      const context = await invitationEmailContext(this.db, args.companyId, args.userId)
      if (!context) throw new CompanyApplicationError('not_found', 'inviter or company row missing')
      emailDelivery = await this.infrastructure.sendInvitationEmail({
        to: email,
        inviterName: context.inviter_name || context.inviter_email,
        inviterEmail: context.inviter_email,
        companyName: context.company_name,
        role: args.input.isAdmin ? 'teacher administrator' : 'teacher',
        note,
        inviteUrl: url,
      }).catch((error: unknown) => ({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }))
    }
    return {
      id: tokenHash, token, url, email, role: 'teacher' as const, isAdmin: args.input.isAdmin, note, maxUses, useCount: 0,
      createdAt: new Date().toISOString(), expiresAt: expiresAt.toISOString(),
      status: 'active' as const, emailDelivery,
    }
  }

  async revokeInvitation(args: {
    companyId: string; userId: string; invitationId: string; audit: RequestAuditContext
  }) {
    const revoked = await this.infrastructure.transaction(async (db) => {
      await this.assertPermission(db, args.companyId, args.userId, 'company_invitation:revoke', true)
      const revoked = await revokeInvitation(db, args.companyId, args.invitationId)
      if (revoked) await this.infrastructure.auditInTransaction(db, {
        kind: 'invitation_revoke', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { inviteId: args.invitationId },
      })
      return revoked
    })
    return { ok: true as const, revoked }
  }

  async acceptInvitation(token: string, userId: string, _auditContext: RequestAuditContext) {
    return this.infrastructure.transaction((db) => acceptEducationInvitation(db, userId, this.infrastructure.hashInvitationToken(token), 'company'))
  }
}
