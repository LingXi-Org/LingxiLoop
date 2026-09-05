import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany, requireWorkspace } from '../../http/request-context.js'
import { notificationPreferencesRequestSchema } from './contracts.js'
import { notificationApplication } from './facade.js'

export const notificationsRouter = Router()

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

notificationsRouter.get('/notification-preferences', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined
  if (projectId) await requireWorkspace(req, projectId, 'project:read')
  res.json(await notificationApplication.preferences(scope, projectId))
}))

notificationsRouter.put('/notification-preferences', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(notificationPreferencesRequestSchema.safeParse(req.body ?? {}))
  if (input.projectId) await requireWorkspace(req, input.projectId, 'project:read')
  res.json(await notificationApplication.setPreferences(scope, input))
}))

notificationsRouter.get('/notification-deliveries', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await notificationApplication.deliveries(scope))
}))
