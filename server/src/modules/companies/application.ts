import { createHash, randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'
import type {
  CreateCompanyInput,
  CreateInvitationInput,
  InvitationPreview,
  InvitationRow,
  RequestAuditContext,
  UpdateCompanyInput,
} from './contracts.js'
import {
  companyMembershipSummary,
  companyRole,
  emailAlreadyMember,
  findCompany,
  findCompanyForMember,
  findUser,
  insertAcceptedMembership,
  insertCompanyRoot,
  insertInvitation,
  invitationEmailContext,
  invitationWithCompany,
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
  audit(input: AuditInput): Promise<void>
  installCompany(db: Queryable, companyId: string): Promise<boolean>
  finalizeCompany(installed: boolean): Promise<void>
  seedMemberDms(args: { companyId: string; memberId: string }): Promise<void>
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
const ADMIN_ROLES = new Set(['owner', 'admin'])

function baseInvitation(invitation: Awaited<ReturnType<typeof invitationWithCompany>> & {}) {
  return {
    role: invitation.role,
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

export class CompanyApplication {
  constructor(private readonly db: Queryable, private readonly infrastructure: CompanyInfrastructure) {}

  companies(userId: string) { return listCompanies(this.db, userId) }

  async provisionPersonalCompany(
    db: Queryable,
    input: { id: string; name: string; slug: string; userId: string; projectId: string },
  ): Promise<boolean> {
    await insertCompanyRoot(db, input)
    return this.infrastructure.installCompany(db, input.id)
  }

  async createCompany(userId: string, input: CreateCompanyInput, auditContext: RequestAuditContext) {
    const baseSlug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company'
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const id = `co-${randomUUID().slice(0, 10)}`
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 4)}`
      const projectId = `general-${createHash('md5').update(id).digest('hex').slice(0, 16)}`
      try {
        const installed = await this.infrastructure.transaction(async (db) => {
          await insertCompanyRoot(db, { id, name: input.name, slug, userId, projectId })
          return this.infrastructure.installCompany(db, id)
        })
        await Promise.allSettled([
          this.infrastructure.finalizeCompany(installed),
          this.infrastructure.audit({
          kind: 'company_create', userId, companyId: id, ...auditContext,
          detail: { name: input.name, slug },
          }),
        ])
        return { id, name: input.name, slug, role: 'owner' as const }
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
      }
    }
    throw new CompanyApplicationError('conflict', 'failed to create company after retries')
  }

  async company(companyId: string, userId: string) {
    const company = await findCompanyForMember(this.db, companyId, userId)
    if (!company) throw new CompanyApplicationError('not_found', 'company not found')
    return company
  }

  async requireAdmin(companyId: string, userId: string): Promise<string> {
    const role = await companyRole(this.db, companyId, userId)
    if (!role) throw new CompanyApplicationError('forbidden', 'not a member of this company')
    if (!ADMIN_ROLES.has(role)) {
      throw new CompanyApplicationError('forbidden', 'only owners and admins can manage this workspace')
    }
    return role
  }

  async editCompany(
    companyId: string,
    userId: string,
    input: UpdateCompanyInput,
    auditContext: RequestAuditContext,
  ) {
    await this.requireAdmin(companyId, userId)
    if (!await updateCompany(this.db, companyId, input)) {
      throw new CompanyApplicationError('not_found', 'company not found')
    }
    await this.infrastructure.audit({
      kind: 'company_update', userId, companyId, ...auditContext, detail: input,
    })
    const company = await findCompany(this.db, companyId)
    if (!company) throw new CompanyApplicationError('not_found', 'company not found')
    return company
  }

  async members(companyId: string, userId: string) {
    await this.requireAdmin(companyId, userId)
    return listMembers(this.db, companyId)
  }

  async changeMemberRole(args: {
    companyId: string; userId: string; targetId: string; role: 'admin' | 'member'; audit: RequestAuditContext
  }) {
    await this.requireAdmin(args.companyId, args.userId)
    if (args.targetId === args.userId) throw new CompanyApplicationError('conflict', 'you cannot change your own company role')
    const current = await memberRole(this.db, args.companyId, args.targetId)
    if (!current) throw new CompanyApplicationError('not_found', 'member not found')
    if (current === 'owner') throw new CompanyApplicationError('conflict', 'the company owner cannot be demoted')
    await setMemberRole(this.db, args.companyId, args.targetId, args.role)
    await this.infrastructure.audit({
      kind: 'company_member_role_update', userId: args.userId, companyId: args.companyId,
      ...args.audit, detail: { targetId: args.targetId, role: args.role },
    })
    return { ok: true as const, userId: args.targetId, role: args.role }
  }

  async removeMember(args: {
    companyId: string; userId: string; targetId: string; audit: RequestAuditContext
  }) {
    await this.requireAdmin(args.companyId, args.userId)
    if (args.targetId === args.userId) throw new CompanyApplicationError('conflict', 'you cannot remove yourself')
    await this.infrastructure.transaction(async (db) => {
      const role = await memberRole(db, args.companyId, args.targetId, true)
      if (!role) throw new CompanyApplicationError('not_found', 'member not found')
      if (role === 'owner') throw new CompanyApplicationError('conflict', 'the company owner cannot be removed')
      const courses = await lockTeachingCourses(db, args.companyId, args.targetId)
      for (const course of courses) {
        if (await teacherCount(db, args.companyId, course.id) <= 1) {
          throw new CompanyApplicationError('conflict', `${course.name} must keep at least one teacher`)
        }
      }
      await removeMemberState(db, args.companyId, args.targetId)
    })
    const channels = await listCompanyChannels(this.db, args.companyId)
    await Promise.all(channels.map((channel) => this.infrastructure.syncChannel({
      channelId: channel.channel_id, channelType: 2, title: channel.title, members: channel.members,
    })))
    await this.infrastructure.disconnectUser(args.targetId, args.companyId)
    await this.infrastructure.audit({
      kind: 'company_member_remove', userId: args.userId, companyId: args.companyId,
      ...args.audit, detail: { targetId: args.targetId },
    })
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
    await this.requireAdmin(companyId, userId)
    const rows = await listInvitations(this.db, companyId)
    const now = Date.now()
    return rows.map((invitation) => ({
      id: invitation.token_hash,
      email: invitation.email,
      role: invitation.role,
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
    await this.requireAdmin(args.companyId, args.userId)
    const email = args.input.email?.toLowerCase() ?? null
    const maxUses = email
      ? 1
      : Math.min(INVITE_MAX_LINK_USES, args.input.maxUses ?? INVITE_MAX_LINK_USES)
    const note = args.input.note || null
    const token = this.infrastructure.generateInvitationToken()
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await this.infrastructure.transaction(async (db) => {
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
    })
    await this.infrastructure.audit({
      kind: 'invitation_create', userId: args.userId, companyId: args.companyId,
      ...args.audit, detail: { email, role: args.input.role, maxUses, note: note ?? undefined },
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
    await this.requireAdmin(args.companyId, args.userId)
    const revoked = await revokeInvitation(this.db, args.companyId, args.invitationId)
    if (revoked) {
      await this.infrastructure.audit({
        kind: 'invitation_revoke', userId: args.userId, companyId: args.companyId,
        ...args.audit, detail: { inviteId: args.invitationId },
      })
    }
    return { ok: true as const, revoked }
  }

  async acceptInvitation(token: string, userId: string, auditContext: RequestAuditContext) {
    const user = await findUser(this.db, userId)
    if (!user) throw new CompanyApplicationError('unauthorized', 'session points to missing user')
    const tokenHash = this.infrastructure.hashInvitationToken(token)
    const result = await this.infrastructure.transaction(async (db) => {
      const invitation = await lockInvitation(db, tokenHash)
      this.assertInvitationAcceptable(invitation, user.email)
      if (!await lockCompany(db, invitation.company_id)) {
        throw new CompanyApplicationError('not_found', 'company not found')
      }
      if (await isCompanyMember(db, invitation.company_id, userId)) {
        return { invitation, alreadyMember: true }
      }
      await insertAcceptedMembership(db, {
        invitation, userId, displayName: user.display_name, avatarUrl: user.avatar_url,
      })
      return { invitation, alreadyMember: false }
    })
    if (!result.alreadyMember) {
      await this.infrastructure.seedMemberDms({
        companyId: result.invitation.company_id, memberId: userId,
      })
    }
    const company = await companyMembershipSummary(this.db, result.invitation.company_id, userId)
    if (!company) throw new CompanyApplicationError('not_found', 'accepted company membership missing')
    if (!result.alreadyMember) {
      await this.infrastructure.audit({
        kind: 'invitation_accept', userId, companyId: result.invitation.company_id, ...auditContext,
        detail: { invitedBy: result.invitation.invited_by, role: result.invitation.role },
      })
    }
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
