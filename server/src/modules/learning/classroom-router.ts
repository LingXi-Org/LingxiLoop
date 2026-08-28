import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany } from '../../http/request-context.js'
import { LearningApplicationError } from './application.js'
import {
  bindCourseRoomRequestSchema,
  createActivityRequestSchema,
  createObjectivesRequestSchema,
  missionCoordinatorRequestSchema,
  notificationPreferencesRequestSchema,
  objectiveStatusRequestSchema,
  reviewEvaluationRequestSchema,
  submitActivityRequestSchema,
} from './contracts.js'
import { learningApplication } from './facade.js'

export const classroomRouter = Router()

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

classroomRouter.get('/learning/dashboard', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.dashboard(scope)))
}))

classroomRouter.get('/courses/:courseId/teacher-agent', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.teacherAgent(scope, String(req.params.courseId))))
}))

classroomRouter.put('/courses/:courseId/rooms/:conversationId', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(bindCourseRoomRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.bindRoom(
    scope, String(req.params.courseId), String(req.params.conversationId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/objectives', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.objectives(scope, String(req.params.courseId))))
}))

classroomRouter.post('/courses/:courseId/objectives', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(createObjectivesRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createObjectives(
    scope, String(req.params.courseId), input,
  )))
}))

classroomRouter.post('/courses/:courseId/objectives/:objectiveId/status', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(objectiveStatusRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.setObjectiveStatus(
    scope, String(req.params.courseId), String(req.params.objectiveId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/activities', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.activities(scope, String(req.params.courseId))))
}))

classroomRouter.post('/courses/:courseId/activities', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(createActivityRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createActivity(
    scope, String(req.params.courseId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/activities/:activityId', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.activity(
    scope, String(req.params.courseId), String(req.params.activityId),
  )))
}))

classroomRouter.post('/courses/:courseId/activities/:activityId/publish', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.publishActivity(
    scope, String(req.params.courseId), String(req.params.activityId),
  )))
}))

classroomRouter.post('/courses/:courseId/activities/:activityId/close', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.closeActivity(
    scope, String(req.params.courseId), String(req.params.activityId),
  )))
}))

classroomRouter.post('/courses/:courseId/activities/:activityId/submit', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(submitActivityRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.submitActivity(
    scope, String(req.params.courseId), String(req.params.activityId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/missions', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.missions(scope, String(req.params.courseId))))
}))

classroomRouter.patch('/courses/:courseId/missions/:missionId/coordinator', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(missionCoordinatorRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.setMissionCoordinator(
    scope, String(req.params.courseId), String(req.params.missionId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/evidence', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const learnerId = typeof req.query.learnerId === 'string' ? req.query.learnerId : undefined
  res.json(await respond(() => learningApplication.evidence(scope, String(req.params.courseId), learnerId)))
}))

classroomRouter.get('/courses/:courseId/reviews', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.reviews(scope, String(req.params.courseId))))
}))

classroomRouter.get('/courses/:courseId/progress', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.progress(scope, String(req.params.courseId))))
}))

classroomRouter.post('/courses/:courseId/reviews/:evaluationId', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(reviewEvaluationRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.review(
    scope, String(req.params.courseId), String(req.params.evaluationId), input,
  )))
}))

classroomRouter.get('/learning/notification-preferences', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const courseId = typeof req.query.courseId === 'string' ? req.query.courseId : undefined
  res.json(await respond(() => learningApplication.notificationPreferences(scope, courseId)))
}))

classroomRouter.put('/learning/notification-preferences', safe(async (req, res) => {
  const scope = await requireCompany(req)
  const input = parse(notificationPreferencesRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.setNotificationPreferences(scope, input)))
}))

classroomRouter.get('/learning/deliveries', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await learningApplication.deliveries(scope))
}))
