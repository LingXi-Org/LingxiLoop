import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requestedCompanyId, requireAuth } from '../../http/request-context.js'
import { ProjectTransferError } from './application.js'
import {
  confirmProjectTransferSchema,
  requestProjectTransferSchema,
  resolveProjectTransferSchema,
} from './contracts.js'
import { projectTransferApplication } from './facade.js'

export const projectTransfersRouter = Router()

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid Project Transfer request')
  return result.data
}

function respond(work: () => Promise<unknown>) {
  return work().catch((error: unknown) => {
    if (!(error instanceof ProjectTransferError)) throw error
    throw new HttpError(error.code === 'not_found' ? 404 : 409, error.message)
  })
}

projectTransfersRouter.post('/projects/:id/request-transfer', safe(async (req, res) => {
  const input = parse(requestProjectTransferSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => projectTransferApplication.request(
    requireAuth(req), requestedCompanyId(req), String(req.params.id), input,
  )))
}))

projectTransfersRouter.post('/projects/:id/confirm-transfer-owner', safe(async (req, res) => {
  const input = parse(confirmProjectTransferSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => projectTransferApplication.confirmTeacher(
    requireAuth(req), String(req.params.id), input,
  )))
}))

projectTransfersRouter.post('/projects/:id/confirm-transfer-education', safe(async (req, res) => {
  const input = parse(confirmProjectTransferSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => projectTransferApplication.confirmEducation(
    requireAuth(req), String(req.params.id), input,
  )))
}))

projectTransfersRouter.post('/projects/:id/cancel-transfer', safe(async (req, res) => {
  const input = parse(resolveProjectTransferSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => projectTransferApplication.cancel(
    requireAuth(req), String(req.params.id), input,
  )))
}))

projectTransfersRouter.post('/projects/:id/reject-transfer', safe(async (req, res) => {
  const input = parse(resolveProjectTransferSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => projectTransferApplication.reject(
    requireAuth(req), String(req.params.id), input,
  )))
}))

projectTransfersRouter.post('/projects/:id/complete-transfer', safe(async (req, res) => {
  const input = parse(confirmProjectTransferSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => projectTransferApplication.complete(
    requireAuth(req), String(req.params.id), input,
  )))
}))
