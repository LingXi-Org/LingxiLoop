import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompanyArtifactContext } from '../../http/request-context.js'
import { permissionService } from '../access/public.js'
import { CalendarApplicationError } from './application.js'
import {
  createCalendarEventRequestSchema,
  listCalendarEventsQuerySchema,
  updateCalendarEventRequestSchema,
} from './contracts.js'
import { calendarApplication } from './facade.js'

export const calendarRouter = Router()

function invalidRequest(error: { issues: Array<{ message: string }> }): HttpError {
  return new HttpError(400, error.issues[0]?.message ?? 'invalid calendar request')
}

function mapCalendarError(error: unknown): never {
  if (error instanceof CalendarApplicationError) {
    const status = error.code === 'event_not_found' ? 404 : 400
    throw new HttpError(status, error.message)
  }
  throw error
}

calendarRouter.get('/calendar/events', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, 'calendar:read')
  const parsed = listCalendarEventsQuerySchema.safeParse(req.query)
  if (!parsed.success) throw invalidRequest(parsed.error)
  try {
    res.json({ events: await calendarApplication.list(scope, parsed.data) })
  } catch (error) {
    mapCalendarError(error)
  }
}))

calendarRouter.post('/calendar/events', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, 'calendar:write')
  const parsed = createCalendarEventRequestSchema.safeParse(req.body)
  if (!parsed.success) throw invalidRequest(parsed.error)
  try {
    res.status(201).json({ event: await calendarApplication.create(scope, parsed.data) })
  } catch (error) {
    mapCalendarError(error)
  }
}))

calendarRouter.get('/calendar/events/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, 'calendar:read')
  await permissionService.assertCan({
    actorUserId: scope.userId, action: 'calendar:read', companyId: scope.companyId, projectId: scope.projectId,
    resource: { type: 'calendar_event', id: String(req.params.id) },
  })
  try {
    res.json({ event: await calendarApplication.get(scope, String(req.params.id)) })
  } catch (error) {
    mapCalendarError(error)
  }
}))

calendarRouter.patch('/calendar/events/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, 'calendar:write')
  await permissionService.assertCan({
    actorUserId: scope.userId, action: 'calendar:write', companyId: scope.companyId, projectId: scope.projectId,
    resource: { type: 'calendar_event', id: String(req.params.id) },
  })
  const parsed = updateCalendarEventRequestSchema.safeParse(req.body)
  if (!parsed.success) throw invalidRequest(parsed.error)
  try {
    res.json({ event: await calendarApplication.update(scope, String(req.params.id), parsed.data) })
  } catch (error) {
    mapCalendarError(error)
  }
}))

calendarRouter.delete('/calendar/events/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, 'calendar:write')
  await permissionService.assertCan({
    actorUserId: scope.userId, action: 'calendar:write', companyId: scope.companyId, projectId: scope.projectId,
    resource: { type: 'calendar_event', id: String(req.params.id) },
  })
  try {
    res.json(await calendarApplication.delete(scope, String(req.params.id)))
  } catch (error) {
    mapCalendarError(error)
  }
}))

calendarRouter.post('/calendar/events/:id/run-now', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, 'calendar:write')
  await permissionService.assertCan({
    actorUserId: scope.userId, action: 'calendar:write', companyId: scope.companyId, projectId: scope.projectId,
    resource: { type: 'calendar_event', id: String(req.params.id) },
  })
  try {
    res.json(await calendarApplication.runNow(scope, String(req.params.id)))
  } catch (error) {
    mapCalendarError(error)
  }
}))

calendarRouter.get('/calendar/events/:id/dispatches', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, 'calendar:read')
  try {
    res.json({ dispatches: await calendarApplication.dispatches(scope, String(req.params.id)) })
  } catch (error) {
    mapCalendarError(error)
  }
}))
