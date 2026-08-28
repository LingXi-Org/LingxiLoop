import { type Request, Router } from 'express'
import type { AuthedRequest } from '../../auth.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth } from '../../http/request-context.js'
import { CompanyApplicationError } from './application.js'
import {
  createCompanyRequestSchema,
  createInvitationRequestSchema,
  updateCompanyRequestSchema,
  updateMemberRoleRequestSchema,
} from './contracts.js'
import { companyApplication } from './facade.js'

export const companiesRouter = Router()

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

function mapCompanyError(error: unknown): never {
  if (!(error instanceof CompanyApplicationError)) throw error
  const status = error.code === 'not_found' ? 404
    : error.code === 'forbidden' ? 403
      : error.code === 'conflict' ? 409
        : error.code === 'gone' ? 410
          : 401
  throw new HttpError(status, error.message)
}

function auditContext(req: Request & AuthedRequest) {
  return {
    ip: req.socket.remoteAddress ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  }
}

companiesRouter.get('/companies', safe(async (req, res) => {
  res.json(await companyApplication.companies(requireAuth(req)))
}))

companiesRouter.post('/companies', safe(async (req, res) => {
  const input = parse(createCompanyRequestSchema.safeParse(req.body ?? {}))
  try {
    res.status(201).json(await companyApplication.createCompany(requireAuth(req), input, auditContext(req)))
  } catch (error) { mapCompanyError(error) }
}))

companiesRouter.get('/companies/:id', safe(async (req, res) => {
  try { res.json(await companyApplication.company(String(req.params.id), requireAuth(req))) }
  catch (error) { mapCompanyError(error) }
}))

companiesRouter.patch('/companies/:id', safe(async (req, res) => {
  const input = parse(updateCompanyRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await companyApplication.editCompany(
      String(req.params.id), requireAuth(req), input, auditContext(req),
    ))
  } catch (error) { mapCompanyError(error) }
}))

companiesRouter.get('/companies/:id/members', safe(async (req, res) => {
  try { res.json(await companyApplication.members(String(req.params.id), requireAuth(req))) }
  catch (error) { mapCompanyError(error) }
}))

companiesRouter.patch('/companies/:id/members/:userId', safe(async (req, res) => {
  const input = parse(updateMemberRoleRequestSchema.safeParse(req.body ?? {}))
  try {
    res.json(await companyApplication.changeMemberRole({
      companyId: String(req.params.id), userId: requireAuth(req), targetId: String(req.params.userId),
      role: input.role, audit: auditContext(req),
    }))
  } catch (error) { mapCompanyError(error) }
}))

companiesRouter.delete('/companies/:id/members/:userId', safe(async (req, res) => {
  try {
    res.json(await companyApplication.removeMember({
      companyId: String(req.params.id), userId: requireAuth(req), targetId: String(req.params.userId),
      audit: auditContext(req),
    }))
  } catch (error) { mapCompanyError(error) }
}))

companiesRouter.get('/companies/:id/invitations', safe(async (req, res) => {
  try { res.json(await companyApplication.invitations(String(req.params.id), requireAuth(req))) }
  catch (error) { mapCompanyError(error) }
}))

companiesRouter.post('/companies/:id/invitations', safe(async (req, res) => {
  const input = parse(createInvitationRequestSchema.safeParse(req.body ?? {}))
  try {
    res.status(201).json(await companyApplication.createInvitation({
      companyId: String(req.params.id), userId: requireAuth(req), input, audit: auditContext(req),
    }))
  } catch (error) { mapCompanyError(error) }
}))

companiesRouter.delete('/companies/:id/invitations/:inviteId', safe(async (req, res) => {
  try {
    res.json(await companyApplication.revokeInvitation({
      companyId: String(req.params.id), userId: requireAuth(req),
      invitationId: String(req.params.inviteId), audit: auditContext(req),
    }))
  } catch (error) { mapCompanyError(error) }
}))

companiesRouter.get('/invitations/:token', safe(async (req, res) => {
  const token = String(req.params.token)
  if (token.length < 8) throw new HttpError(400, 'bad token')
  res.json(await companyApplication.invitation(token, req.authUserId ?? null))
}))

companiesRouter.post('/invitations/:token/accept', safe(async (req, res) => {
  const token = String(req.params.token)
  if (token.length < 8) throw new HttpError(400, 'bad token')
  try {
    res.json(await companyApplication.acceptInvitation(token, requireAuth(req), auditContext(req)))
  } catch (error) { mapCompanyError(error) }
}))
