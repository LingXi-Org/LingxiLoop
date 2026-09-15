import { requireCompany } from '../../http/request-context.js'
import { avatarInputSchema } from './contracts.js'
import { prepareAvatar, saveUserAvatar } from './profile-avatar.js'
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { hashInvitationToken } from '../../http/invitation-token.js'
import { findIdentityUser, listIdentityCompanies } from './repository.js'
import { createWsTicket } from './session-facade.js'
import { acceptEducationInvitation } from '../companies/admission.js'

export const gatewayRegistrationRouter = Router()

function requireGateway(req: { gatewayAuthenticated?: boolean }): void {
  if (!req.gatewayAuthenticated) throw new HttpError(401, 'valid gateway assertion required')
}

gatewayRegistrationRouter.get('/auth/me', safe(async (req, res) => {
  requireGateway(req)
  if (!req.authUserId) throw new HttpError(401, 'business user mapping required')
  const [user, companies] = await Promise.all([findIdentityUser(pool, req.authUserId), listIdentityCompanies(pool, req.authUserId)])
  if (!user) throw new HttpError(401, 'business user not found')
  if (companies.length !== 1) throw new HttpError(403, 'active company membership required')
  res.json({
    user: { id: user.id, email: user.email, name: user.display_name, avatarUrl: user.avatar_url, avatarSeed: user.avatar_seed, emailVerified: Boolean(user.email_verified_at), providers: ['credential'] },
    companies: companies.map(({ type: _type, ...company }) => company),
    activeCompanyId: companies[0]!.id,
    serverCapabilities: { invitationEmail: true },
  })
}))

gatewayRegistrationRouter.put('/me/avatar', safe(async (req, res) => {
  requireGateway(req)
  const scope = await requireCompany(req)
  const parsed = avatarInputSchema.safeParse(req.body)
  if (!parsed.success) throw new HttpError(400, 'invalid avatar')
  const avatar = await prepareAvatar(pool, scope, parsed.data, 'user')
  res.json(await withTransaction(pool, (db) => saveUserAvatar(db, scope, avatar)))
}))

gatewayRegistrationRouter.post(['/session/ws-ticket', '/auth/ws-ticket'], safe(async (req, res) => {
  requireGateway(req)
  if (!req.authUserId) throw new HttpError(401, 'business user mapping required')
  const result = await createWsTicket(req.authUserId)
  res.json({ ticket: result.ticket, expiresAt: result.expiresAt.toISOString() })
}))

gatewayRegistrationRouter.post('/internal/registration/invitation', safe(async (req, res) => {
  requireGateway(req)
  if (req.gatewayService?.capability !== 'registration-invitation') throw new HttpError(403, 'registration service required')
  const inviteToken = typeof req.body?.inviteToken === 'string' ? req.body.inviteToken : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null
  const kind = req.body?.inviteKind
  if (kind !== 'project' && kind !== 'company') throw new HttpError(400, 'invalid inviteKind')
  if (!inviteToken) throw new HttpError(400, 'inviteToken required')
  const tokenHash = hashInvitationToken(inviteToken)
  const table = kind === 'project' ? 'project_invitations' : 'company_invitations'
  const { rows } = await pool.query<{
    companyName: string; courseName: string | null; isAdmin: boolean; email: string | null; expires_at: string; revoked_at: string | null; use_count: number; max_uses: number
  }>(`SELECT i.email,i.expires_at,i.revoked_at,i.use_count,i.max_uses,c.name AS "companyName",
      ${kind === 'company' ? 'i.is_admin' : 'FALSE'} AS "isAdmin",
      ${kind === 'project' ? "(SELECT name FROM projects WHERE id=i.project_id AND status='ACTIVE')" : 'NULL::text'} AS "courseName"
      FROM ${table} i JOIN companies c ON c.id=i.company_id AND c.status IN ('ACTIVE','TRIAL') WHERE i.token_hash=$1`, [tokenHash])
  const invitation = rows[0]
  if (!invitation) throw new HttpError(404, 'invitation not found')
  if (kind === 'project' && !invitation.courseName) throw new HttpError(410, 'course no longer active')
  if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now() || invitation.use_count >= invitation.max_uses) {
    throw new HttpError(410, 'invitation no longer active')
  }
  if (email && invitation.email && invitation.email.toLowerCase() !== email) throw new HttpError(403, 'invitation email mismatch')
  res.json({ valid: true, kind, email: invitation.email, companyName: invitation.companyName, courseName: invitation.courseName, role: kind === 'company' ? 'teacher' : 'student', isAdmin: invitation.isAdmin })
}))

gatewayRegistrationRouter.post('/internal/registration/provision', safe(async (req, res) => {
  requireGateway(req)
  if (req.gatewayService?.capability !== 'registration-provision') throw new HttpError(403, 'registration service required')
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const inviteToken = typeof req.body?.inviteToken === 'string' ? req.body.inviteToken : ''
  const kind = req.body?.inviteKind === 'project' || req.body?.inviteKind === 'company' ? req.body.inviteKind : null
  if (!email || !name) throw new HttpError(400, 'email and name are required')
  if (!inviteToken || !kind) throw new HttpError(403, 'invitation required')
  const tokenHash = hashInvitationToken(inviteToken)
  const appUserId = await withTransaction(pool, async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(1282006535)`)
    // Serialize first-time admissions by normalized email, including absent user rows.
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [email])
    const existing = await db.query<{ id: string }>(`SELECT id FROM users WHERE lower(email)=$1 FOR UPDATE`, [email])
    const userId = existing.rows[0]?.id ?? `u-${randomUUID()}`
    if (!existing.rows[0]) {
      await db.query(`INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,$2,$3,NOW())`, [userId, email, name])
    }
    await acceptEducationInvitation(db, userId, tokenHash, kind)
    return userId
  })
  res.json({ appUserId })
}))

gatewayRegistrationRouter.post('/internal/bootstrap/platform-user', safe(async (req, res) => {
  requireGateway(req)
  if (req.gatewayService?.capability !== 'bootstrap-platform-user'
    || req.gatewayAuthUserId !== req.body?.authUserId) throw new HttpError(403, 'bootstrap service required')
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!email || !name) throw new HttpError(400, 'email and name are required')
  const appUserId = await withTransaction(pool, async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [email])
    const existing = await db.query<{ id: string }>(`SELECT id FROM users WHERE lower(email)=$1 AND deleted_at IS NULL AND suspended_at IS NULL FOR UPDATE`, [email])
    if (existing.rows[0]) return existing.rows[0].id
    const id = `u-${randomUUID()}`
    await db.query(`INSERT INTO users(id,email,display_name,email_verified_at) VALUES($1,$2,$3,NOW())`, [id, email, name])
    return id
  })
  res.json({ appUserId })
}))
