import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { hashInvitationToken } from '../../http/invitation-token.js'
import { resolvePlanEntitlements } from '../access/public.js'
import { findIdentityUser, listIdentityCompanies } from './repository.js'
import { createWsTicket } from './session-facade.js'
import {
  insertAcceptedMembership,
  isCompanyMember,
  lockCompany,
  lockInvitation,
} from '../companies/repository.js'
import { onboardCompanyStarterWorkspace, provisionPersonalWorkspace } from '../companies/public.js'
import {
  companyMembershipRole,
  countActiveProjectStudents,
  courseMembershipRole,
  insertAcceptedStudentMembership,
  joinInvitationCompany,
  lockProjectInvitation,
  priorProjectAcceptance,
  recordProjectAcceptance,
} from '../learning/repository.js'

export const gatewayRegistrationRouter = Router()

function requireGateway(req: { gatewayAuthenticated?: boolean }): void {
  if (!req.gatewayAuthenticated) throw new HttpError(401, 'valid gateway assertion required')
}

gatewayRegistrationRouter.get('/auth/me', safe(async (req, res) => {
  requireGateway(req)
  if (!req.authUserId) throw new HttpError(401, 'business user mapping required')
  const [user, companies] = await Promise.all([findIdentityUser(pool, req.authUserId), listIdentityCompanies(pool, req.authUserId)])
  if (!user) throw new HttpError(401, 'business user not found')
  const personal = companies.find((company) => company.type === 'PERSONAL')
  if (!personal) throw new HttpError(409, 'Personal Context invariant violated')
  res.json({
    user: { id: user.id, email: user.email, name: user.display_name, emailVerified: Boolean(user.email_verified_at), providers: ['credential'] },
    companies: companies.map(({ type: _type, ...company }) => company),
    activeCompanyId: personal.id,
    serverCapabilities: { invitationEmail: true },
  })
}))

gatewayRegistrationRouter.post(['/session/ws-ticket', '/auth/ws-ticket'], safe(async (req, res) => {
  requireGateway(req)
  if (!req.authUserId) throw new HttpError(401, 'business user mapping required')
  const result = await createWsTicket(req.authUserId)
  res.json({ ticket: result.ticket, expiresAt: result.expiresAt.toISOString() })
}))

gatewayRegistrationRouter.post('/internal/registration/invitation', safe(async (req, res) => {
  requireGateway(req)
  const inviteToken = typeof req.body?.inviteToken === 'string' ? req.body.inviteToken : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null
  const kind = req.body?.inviteKind === 'project' ? 'project' : 'company'
  if (!inviteToken) throw new HttpError(400, 'inviteToken required')
  const tokenHash = hashInvitationToken(inviteToken)
  const table = kind === 'project' ? 'project_invitations' : 'company_invitations'
  const { rows } = await pool.query<{
    email: string | null; expires_at: string; revoked_at: string | null; use_count: number; max_uses: number
  }>(`SELECT email,expires_at,revoked_at,use_count,max_uses FROM ${table} WHERE token_hash=$1`, [tokenHash])
  const invitation = rows[0]
  if (!invitation) throw new HttpError(404, 'invitation not found')
  if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.use_count >= invitation.max_uses) {
    throw new HttpError(410, 'invitation no longer active')
  }
  if (email && invitation.email && invitation.email.toLowerCase() !== email) throw new HttpError(403, 'invitation email mismatch')
  res.json({ valid: true, kind, email: invitation.email })
}))

gatewayRegistrationRouter.post('/internal/registration/provision', safe(async (req, res) => {
  requireGateway(req)
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const inviteToken = typeof req.body?.inviteToken === 'string' ? req.body.inviteToken : ''
  const kind = req.body?.inviteKind === 'project' || req.body?.inviteKind === 'company' ? req.body.inviteKind : null
  if (!email || !name) throw new HttpError(400, 'email and name are required')
  if (Boolean(inviteToken) !== Boolean(kind)) throw new HttpError(400, 'inviteToken and inviteKind must be provided together')
  const tokenHash = inviteToken ? hashInvitationToken(inviteToken) : null
  const provisioned = await withTransaction(pool, async (db) => {
    const existing = await db.query<{ id: string }>(`SELECT id FROM users WHERE lower(email)=$1 AND deleted_at IS NULL FOR UPDATE`, [email])
    const userId = existing.rows[0]?.id ?? `u-${randomUUID().slice(0, 12)}`
    if (!existing.rows[0]) {
      await db.query(`INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,$2,$3,NOW())`, [userId, email, name])
    }
    const personalWorkspace = await provisionPersonalWorkspace(db, userId)
    if (kind === 'company') {
      const invitation = await lockInvitation(db, tokenHash!)
      if (!invitation) throw new HttpError(404, 'invitation not found')
      const companyStatus = await lockCompany(db, invitation.company_id)
      if (!companyStatus || !['ACTIVE', 'TRIAL'].includes(companyStatus)) throw new HttpError(410, 'company is not accepting members')
      if (!await isCompanyMember(db, invitation.company_id, userId)) {
        if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.use_count >= invitation.max_uses) throw new HttpError(410, 'invitation no longer active')
        if (invitation.email && invitation.email.toLowerCase() !== email) throw new HttpError(403, 'invitation email mismatch')
        await insertAcceptedMembership(db, { invitation, userId, displayName: name, avatarUrl: null })
      }
    } else if (kind === 'project') {
      const invitation = await lockProjectInvitation(db, tokenHash!, userId)
      if (!invitation) throw new HttpError(404, 'invitation not found')
      if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.project_status !== 'ACTIVE' || !['ACTIVE', 'TRIAL'].includes(invitation.company_status)) throw new HttpError(410, 'invitation no longer active')
      if (invitation.email && invitation.email.toLowerCase() !== email) throw new HttpError(403, 'invitation email mismatch')
      if (!await companyMembershipRole(db, invitation.company_id, userId)) {
        await joinInvitationCompany(db, { companyId: invitation.company_id, userId, displayName: name, avatarUrl: '' })
      }
      const existingRole = await courseMembershipRole(db, invitation.course_id, userId)
      if (!await priorProjectAcceptance(db, tokenHash!, userId) && !existingRole) {
        if (invitation.use_count >= invitation.max_uses) throw new HttpError(410, 'invitation already used')
        const entitlements = await resolvePlanEntitlements(db, invitation.project_plan_id)
        const limit = entitlements.number('teacher.student_limit')
        if (limit !== null && await countActiveProjectStudents(db, invitation.company_id, invitation.project_id) >= limit) throw new HttpError(403, 'student limit reached')
        await insertAcceptedStudentMembership(db, { invitation, userId })
        await recordProjectAcceptance(db, { tokenHash: tokenHash!, userId })
      }
    }
    return { appUserId: userId, personalCompanyId: personalWorkspace.companyId }
  })
  await onboardCompanyStarterWorkspace(provisioned.personalCompanyId)
  res.json({ appUserId: provisioned.appUserId })
}))
