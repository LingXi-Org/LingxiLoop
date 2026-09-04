import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany, requireWorkspace } from '../../http/request-context.js'
import { ContextThreadApplicationError } from './application.js'
import {
  createLearningThreadRequestSchema,
  createTeacherThreadRequestSchema,
} from './contracts.js'
import { contextThreadsApplication } from './facade.js'

export const contextThreadsRouter = Router()

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

function mapApplicationError(error: unknown): never {
  if (!(error instanceof ContextThreadApplicationError)) throw error
  const status = error.code === 'not_found'
    ? 404
    : error.code === 'idempotency_conflict'
      ? 409
      : 400
  throw new HttpError(status, error.message)
}

contextThreadsRouter.post('/projects/:projectId/context-threads/teacher', safe(async (req, res) => {
  const identity = await requireCompany(req)
  const projectId = String(req.params.projectId)
  await requireWorkspace(req, projectId, 'learning:manage')
  const input = parse(createTeacherThreadRequestSchema.safeParse(req.body ?? {}))
  try {
    const result = await contextThreadsApplication.createTeacherThread({ ...identity, projectId }, input)
    res.status(result.created ? 201 : 200).json(result)
  } catch (error) {
    mapApplicationError(error)
  }
}))

contextThreadsRouter.post('/projects/:projectId/context-threads/learning', safe(async (req, res) => {
  const identity = await requireCompany(req)
  const projectId = String(req.params.projectId)
  await requireWorkspace(req, projectId, 'conversation:write')
  const input = parse(createLearningThreadRequestSchema.safeParse(req.body ?? {}))
  try {
    const result = await contextThreadsApplication.createLearningThread({ ...identity, projectId }, input.agentId)
    res.status(result.created ? 201 : 200).json(result)
  } catch (error) {
    mapApplicationError(error)
  }
}))
