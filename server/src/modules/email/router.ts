import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany } from '../../http/request-context.js'
import { permissionService } from '../access/public.js'
import { EmailApplicationError } from './application.js'
import { replyEmailRequestSchema, sendEmailRequestSchema } from './contracts.js'
import { emailApplication } from './facade.js'

export const emailRouter = Router()

function invalidRequest(error: { issues: Array<{ message: string }> }): HttpError {
  return new HttpError(400, error.issues[0]?.message ?? 'invalid email request')
}

function mapEmailError(error: unknown): never {
  if (error instanceof EmailApplicationError) {
    const status = error.code === 'message_not_found'
      ? 404
      : error.code === 'thread_forbidden'
        ? 403
        : 400
    throw new HttpError(status, error.message)
  }
  throw error
}

emailRouter.post('/email/send', safe(async (req, res) => {
  const scope = await requireCompany(req)
  await permissionService.assertCan({ actorUserId: scope.userId, action: 'email:write', companyId: scope.companyId })
  const parsed = sendEmailRequestSchema.safeParse(req.body)
  if (!parsed.success) throw invalidRequest(parsed.error)
  try {
    const payload = await emailApplication.send(scope, parsed.data)
    res.status(payload.transportStatus === 'sent' ? 200 : 502).json(payload)
  } catch (error) {
    mapEmailError(error)
  }
}))

emailRouter.get('/email/:messageId/html', safe(async (req, res) => {
  const scope = await requireCompany(req)
  await permissionService.assertCan({
    actorUserId: scope.userId,
    action: 'email:read',
    companyId: scope.companyId,
    resource: { type: 'message', id: String(req.params.messageId) },
  })
  try {
    const payload = await emailApplication.html(scope, String(req.params.messageId))
    if (payload.kind === 'empty') {
      res.status(204).end()
      return
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:",
    )
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(payload.html)
  } catch (error) {
    mapEmailError(error)
  }
}))

emailRouter.post('/email/reply/:messageId', safe(async (req, res) => {
  const scope = await requireCompany(req)
  await permissionService.assertCan({
    actorUserId: scope.userId,
    action: 'email:write',
    companyId: scope.companyId,
    resource: { type: 'message', id: String(req.params.messageId) },
  })
  const parsed = replyEmailRequestSchema.safeParse(req.body)
  if (!parsed.success) throw invalidRequest(parsed.error)
  try {
    const payload = await emailApplication.reply(scope, String(req.params.messageId), parsed.data)
    res.status(payload.transportStatus === 'sent' ? 200 : 502).json(payload)
  } catch (error) {
    mapEmailError(error)
  }
}))
