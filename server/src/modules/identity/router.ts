import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth } from '../../http/request-context.js'
import { IdentityApplicationError } from './application.js'
import { authCallbackQuerySchema, authStartQuerySchema } from './contracts.js'
import { identityApplication } from './facade.js'

export const identityRouter = Router()

function mapIdentityError(error: unknown): never {
  if (error instanceof IdentityApplicationError) {
    const status = error.code === 'provider_not_found'
      ? 404
      : error.code === 'provider_unavailable'
        ? 503
        : error.code === 'account_not_found'
          ? 404
          : error.code === 'session_user_missing'
            ? 401
            : 400
    throw new HttpError(status, error.message)
  }
  throw error
}

function metadata(req: Parameters<typeof requireAuth>[0]) {
  return {
    ip: req.socket.remoteAddress ?? null,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  }
}

identityRouter.get('/auth/start/:provider', safe(async (req, res) => {
  const parsed = authStartQuerySchema.safeParse(req.query)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'invalid auth request')
  try {
    res.redirect(await identityApplication.start(String(req.params.provider), parsed.data))
  } catch (error) {
    mapIdentityError(error)
  }
}))

identityRouter.get('/auth/callback/:provider', safe(async (req, res) => {
  const parsed = authCallbackQuerySchema.safeParse(req.query)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'invalid auth callback')
  try {
    res.redirect(await identityApplication.callback(
      String(req.params.provider),
      {
        code: parsed.data.code,
        state: parsed.data.state,
        error: parsed.data.error,
        errorDescription: parsed.data.error_description,
      },
      metadata(req),
    ))
  } catch (error) {
    mapIdentityError(error)
  }
}))

identityRouter.post('/auth/logout', safe(async (req, res) => {
  const authorization = req.headers.authorization
  const token = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim() || null
    : null
  res.json(await identityApplication.logout(token, req.authUserId ?? null, metadata(req).ip))
}))

identityRouter.delete('/me/account', safe(async (req, res) => {
  const userId = requireAuth(req)
  try {
    res.json(await identityApplication.deleteAccount(userId, metadata(req)))
  } catch (error) {
    mapIdentityError(error)
  }
}))

identityRouter.post('/auth/ws-ticket', safe(async (req, res) => {
  res.json(await identityApplication.wsTicket(requireAuth(req)))
}))

identityRouter.get('/auth/me', safe(async (req, res) => {
  try {
    res.json(await identityApplication.me(requireAuth(req)))
  } catch (error) {
    mapIdentityError(error)
  }
}))
