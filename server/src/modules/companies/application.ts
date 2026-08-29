import type { Queryable } from '../../db/queryable.js'
import {
  companyRoleToWire,
} from '../../domain/access/public.js'
import { createPermissionService } from '../access/public.js'
import type {
  CreateInvitationInput,
  InvitationPreview,
  InvitationRow,
  RequestAuditContext,
  UpdateCompanyInput,
} from './contracts.js'
import {
  companyMembershipSummary,
  emailAlreadyMember,
  findCompany,
  findCompanyForMember,
  findUser,
  insertAcceptedMembership,
  insertInvitation,
  invitationEmailContext,
  invitationWithCompany,
  isDepartedCompanyHuman,
  isCompanyMember,
  listCompanies,
  listCompanyChannels,
  listInvitations,
  listMembers,
  lockCompany,
  lockInvitation,
  lockTeachingCourses,
  memberRole,
  removeMemberState,
  revokeActiveEmailInvitations,
  revokeInvitation,
  setMemberRole,
  teacherCount,
  updateCompany,
} from './repository.js'
import { enqueueMemberOnboardingEffect } from './effects-repository.js'

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
const INVITE_MAX_LINK_USES = 100
function baseInvitation(invitation: Awaited<ReturnType<typeof invitationWithCompany>> & {}) {
  return {
    role: companyRoleToWire(invitation.role),
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
    action: 'company:update' | 'company_member:list' | 'company_member:update' | 'company_member:remove'
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
    companyId: string; userId: string; targetId: string; role: 'admin' | 'member'; audit: RequestAuditContext
  }) {
    if (args.targetId === args.userId) throw new CompanyApplicationError('conflict', 'you cannot change your own company role')
    await this.infrastructure.transaction(async (db) => {
      await this.assertPermission(db, args.companyId, args.userId, 'company_member:update', true)
      const current = await memberRole(db, args.companyId, args.targetId, true)
      if (!current) throw new CompanyApplicationError('not_found', 'member not found')
      if (current === 'OWNER') throw new CompanyApplicationError('conflict', 'the company owner cannot be demoted')
      await setMemberRole(db, args.companyId, args.targetId, args.role)
      await this.infrastructure.auditInTransaction(db, {
        kind: 'company_member_role_update', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { targetId: args.targetId, role: args.role },
      })
    })
    return { ok: true as const, userId: args.targetId, role: args.role }
  }

  async removeMember(args: {
    companyId: string; userId: string; targetId: string; audit: RequestAuditContext
  }) {
    if (args.targetId === args.userId) throw new CompanyApplicationError('conflict', 'you cannot remove yourself')
    await this.infrastructure.transaction(async (db) => {
      await this.assertPermission(db, args.companyId, args.userId, 'company_member:remove', true)
      const role = await memberRole(db, args.companyId, args.targetId, true)
      if (!role) {
        if (await isDepartedCompanyHuman(db, args.companyId, args.targetId)) return
        throw new CompanyApplicationError('not_found', 'member not found')
      }
      if (role === 'OWNER') throw new CompanyApplicationError('conflict', 'the company owner cannot be removed')
      const courses = await lockTeachingCourses(db, args.companyId, args.targetId)
      for (const course of courses) {
        if (await teacherCount(db, args.companyId, course.id) <= 1) {
          throw new CompanyApplicationError('conflict', `${course.name} must keep at least one teacher`)
        }
      }
      await removeMemberState(db, args.companyId, args.targetId)
      await this.infrastructure.auditInTransaction(db, {
        kind: 'company_member_remove', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { targetId: args.targetId },
      })
    })
    const channels = await listCompanyChannels(this.db, args.companyId)
    // Revoke the cached WebSocket authorization before any external IM call.
    await this.infrastructure.disconnectUser(args.targetId, args.companyId)
    const syncResults = await Promise.allSettled(channels.map((channel) => this.infrastructure.syncChannel({
      channelId: channel.channel_id, channelType: 2, title: channel.title, members: channel.members,
    })))
    const failures = syncResults.filter((result) => result.status === 'rejected')
    if (failures.length > 0) {
      throw new Error(`WuKongIM member revocation reconciliation failed (${failures.length}/${channels.length})`)
    }
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
    const maxUses = email
      ? 1
      : Math.min(INVITE_MAX_LINK_USES, args.input.maxUses ?? INVITE_MAX_LINK_USES)
    const note = args.input.note || null
    const token = this.infrastructure.generateInvitationToken()
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await this.infrastructure.transaction(async (db) => {
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
        role: args.input.role, note, maxUses, expiresAt,
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'invitation_create', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { email, role: args.input.role, maxUses, note: note ?? undefined },
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
        role: args.input.role,
        note,
        inviteUrl: url,
      }).catch((error: unknown) => ({
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }))
    }
    return {
      id: tokenHash, token, url, email, role: args.input.role, note, maxUses, useCount: 0,
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

  async acceptInvitation(token: string, userId: string, auditContext: RequestAuditContext) {
    const user = await findUser(this.db, userId)
    if (!user) throw new CompanyApplicationError('unauthorized', 'session points to missing user')
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const result = await this.infrastructure.transaction(async (db) => {
      const invitation = await lockInvitation(db, tokenHash)
      if (!invitation) throw new CompanyApplicationError('not_found', 'invitation not found')
      if (!await lockCompany(db, invitation.company_id)) {
        throw new CompanyApplicationError('not_found', 'company not found')
      }
      if (await isCompanyMember(db, invitation.company_id, userId)) {
        await enqueueMemberOnboardingEffect(db, invitation.company_id, userId)
        return { invitation, alreadyMember: true }
      }
      this.assertInvitationAcceptable(invitation, user.email)
      await insertAcceptedMembership(db, {
        invitation, userId, displayName: user.display_name, avatarUrl: user.avatar_url,
      })
      await this.infrastructure.auditInTransaction(db, {
        kind: 'invitation_accept', userId, companyId: invitation.company_id, ...auditContext,
        detail: { invitedBy: invitation.invited_by, role: invitation.role },
      })
      await enqueueMemberOnboardingEffect(db, invitation.company_id, userId)
      return { invitation, alreadyMember: false }
    })
    const company = await companyMembershipSummary(this.db, result.invitation.company_id, userId)
    if (!company) throw new CompanyApplicationError('not_found', 'accepted company membership missing')
    return {
      ok: true as const,
      alreadyMember: result.alreadyMember,
      company: { id: result.invitation.company_id, ...company },
    }
  }

  private assertInvitationAcceptable(invitation: InvitationRow | null, viewerEmail: string): asserts invitation is InvitationRow {
    if (!invitation) throw new CompanyApplicationError('not_found', 'invitation not found')
    if (invitation.revoked_at) throw new CompanyApplicationError('gone', 'invitation revoked')
    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      throw new CompanyApplicationError('gone', 'invitation expired')
    }
    if (invitation.use_count >= invitation.max_uses) {
      throw new CompanyApplicationError('gone', 'invitation already used')
    }
    if (invitation.email && invitation.email.toLowerCase() !== viewerEmail.toLowerCase()) {
      throw new CompanyApplicationError(
        'forbidden',
        `this invitation is reserved for ${invitation.email} — sign in with that email to accept`,
      )
    }
  }
}
