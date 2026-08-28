import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth, requireCompany } from '../../http/request-context.js'
import { LearningApplicationError } from './application.js'
import { classroomRouter } from './classroom-router.js'
import {
  archiveCourseRequestSchema,
  createCourseInvitationRequestSchema,
  createCourseRequestSchema,
  updateCourseMemberRequestSchema,
  updateCourseRequestSchema,
} from './contracts.js'
import { learningApplication } from './facade.js'

export const learningRouter = Router()

function parse<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

function mapLearningError(error: unknown): never {
  if (!(error instanceof LearningApplicationError)) throw error
  const status = {
    invalid: 400,
    not_found: 404,
    forbidden: 403,
    conflict: 409,
    gone: 410,
    unauthorized: 401,
  }[error.code]
  throw new HttpError(status, error.message)
}

async function respond<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() }
  catch (error) { mapLearningError(error) }
}

learningRouter.use(classroomRouter)

learningRouter.get('/courses', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await learningApplication.courses(scope))
}))

learningRouter.post('/courses', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(createCourseRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createCourse(scope, input)))
}))

learningRouter.get('/courses/:id', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.course(scope, String(req.params.id))))
}))

learningRouter.patch('/courses/:id', safe(async (req, res) => {
  const userId = requireAuth(req)
  const input = parse(updateCourseRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.updateCourse(userId, String(req.params.id), input)))
}))

learningRouter.post('/courses/:id/archive', safe(async (req, res) => {
  const userId = requireAuth(req)
  const input = parse(archiveCourseRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.archiveCourse(userId, String(req.params.id), input.archive)))
}))

learningRouter.get('/courses/:id/members', safe(async (req, res) => {
  const userId = requireAuth(req)
  res.json(await respond(() => learningApplication.members(userId, String(req.params.id))))
}))

learningRouter.patch('/courses/:id/members/:userId', safe(async (req, res) => {
  const userId = requireAuth(req)
  const input = parse(updateCourseMemberRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.updateMember(
    userId, String(req.params.id), String(req.params.userId), input.role,
  )))
}))

learningRouter.delete('/courses/:id/members/:userId', safe(async (req, res) => {
  const userId = requireAuth(req)
  res.json(await respond(() => learningApplication.removeMember(
    userId, String(req.params.id), String(req.params.userId),
  )))
}))

learningRouter.get('/courses/:id/invitations', safe(async (req, res) => {
  const userId = requireAuth(req)
  res.json(await respond(() => learningApplication.invitations(userId, String(req.params.id))))
}))

learningRouter.post('/courses/:id/invitations', safe(async (req, res) => {
  const userId = requireAuth(req)
  const input = parse(createCourseInvitationRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createInvitation(
    userId, String(req.params.id), input,
  )))
}))

learningRouter.delete('/courses/:id/invitations/:inviteId', safe(async (req, res) => {
  const userId = requireAuth(req)
  res.json(await respond(() => learningApplication.revokeInvitation(
    userId, String(req.params.id), String(req.params.inviteId),
  )))
}))

learningRouter.get('/course-invitations/:token', safe(async (req, res) => {
  res.json(await learningApplication.invitationPreview(String(req.params.token), req.authUserId))
}))

learningRouter.post('/course-invitations/:token/accept', safe(async (req, res) => {
  const userId = requireAuth(req)
  res.json(await respond(() => learningApplication.acceptInvitation(userId, String(req.params.token))))
}))
