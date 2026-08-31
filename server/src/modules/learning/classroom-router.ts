import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requireAuth, requireCompany } from '../../http/request-context.js'
import type { PermissionAction } from '../access/public.js'
import { permissionService } from '../access/public.js'
import {
  bindCourseRoomRequestSchema,
  createActivityRequestSchema,
  createObjectivesRequestSchema,
  importLearningActivitiesRequestSchema,
  learningLearnersQuerySchema,
  learningOverviewQuerySchema,
  learningSpacesQuerySchema,
  missionCoordinatorRequestSchema,
  objectiveStatusRequestSchema,
  reviewEvaluationRequestSchema,
  submitActivityRequestSchema,
} from './contracts.js'
import { learningApplication } from './facade.js'
import { parseLearningRequest as parse, respondWithLearning as respond } from './http-adapter.js'

export const classroomRouter = Router()

async function requireCoursePermission(
  req: Parameters<typeof requireCompany>[0],
  courseId: string,
  action: PermissionAction,
) {
  const scope = await requireCompany(req)
  await permissionService.assertCan({
    actorUserId: scope.userId,
    action,
    companyId: scope.companyId,
    resource: { type: 'course', id: courseId },
  })
  return scope
}

async function requireProjectPermission(
  req: Parameters<typeof requireCompany>[0],
  projectId: string,
  action: PermissionAction,
) {
  const scope = await requireCompany(req)
  await permissionService.assertCan({
    actorUserId: scope.userId,
    action,
    companyId: scope.companyId,
    resource: { type: 'project', id: projectId },
  })
  return scope
}

classroomRouter.get('/learning/dashboard', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await respond(() => learningApplication.dashboard(scope)))
}))

classroomRouter.get('/learning/spaces', safe(async (req, res) => {
  const userId = requireAuth(req)
  const input = parse(learningSpacesQuerySchema.safeParse(req.query))
  res.json(await respond(() => learningApplication.spaces(userId, input)))
}))

classroomRouter.get('/projects/:projectId/learning/overview', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:read')
  const input = parse(learningOverviewQuerySchema.safeParse(req.query))
  res.json(await respond(() => learningApplication.overview(scope, projectId, input.windowDays)))
}))

classroomRouter.get('/projects/:projectId/learning/learners', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:review')
  const input = parse(learningLearnersQuerySchema.safeParse(req.query))
  res.json(await respond(() => learningApplication.learners(scope, projectId, input)))
}))

classroomRouter.get('/projects/:projectId/learning/learners/:learnerId', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:review')
  res.json(await respond(() => learningApplication.learnerDetail(
    scope,
    projectId,
    String(req.params.learnerId),
  )))
}))

classroomRouter.get('/projects/:projectId/learning/attempts/:attemptId', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:review')
  res.json(await respond(() => learningApplication.attemptDetail(
    scope,
    projectId,
    String(req.params.attemptId),
  )))
}))

classroomRouter.get('/projects/:projectId/learning/knowledge-units', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:read')
  res.json(await respond(() => learningApplication.projectKnowledgeUnits(scope, projectId)))
}))

classroomRouter.get('/projects/:projectId/learning/activities', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:read')
  res.json(await respond(() => learningApplication.projectActivities(scope, projectId)))
}))

classroomRouter.post('/projects/:projectId/learning/activity-imports', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:manage')
  const input = parse(importLearningActivitiesRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.importActivities(scope, projectId, input)))
}))

classroomRouter.post('/projects/:projectId/learning/activities/:activityId/submit', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:submit')
  const input = parse(submitActivityRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.submitProjectActivity(
    scope, projectId, String(req.params.activityId), input,
  )))
}))

classroomRouter.get('/projects/:projectId/learning/missions', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:read')
  res.json(await respond(() => learningApplication.projectMissions(scope, projectId)))
}))

classroomRouter.get('/projects/:projectId/learning/evidence', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const learnerId = typeof req.query.learnerId === 'string' ? req.query.learnerId : undefined
  const scope = await requireProjectPermission(
    req, projectId, learnerId ? 'learning:review' : 'learning:read',
  )
  res.json(await respond(() => learningApplication.projectEvidence(scope, projectId, learnerId)))
}))

classroomRouter.get('/projects/:projectId/learning/reviews', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:review')
  res.json(await respond(() => learningApplication.projectReviews(scope, projectId)))
}))

classroomRouter.get('/projects/:projectId/learning/progress', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:review')
  res.json(await respond(() => learningApplication.projectProgress(scope, projectId)))
}))

classroomRouter.post('/projects/:projectId/learning/reviews/:evaluationId', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireProjectPermission(req, projectId, 'learning:review')
  const input = parse(reviewEvaluationRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.reviewProject(
    scope, projectId, String(req.params.evaluationId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/teacher-agent', safe(async (req, res) => {
  const courseId = String(req.params.courseId)
  const scope = await requireCoursePermission(req, courseId, 'learning:read')
  res.json(await respond(() => learningApplication.teacherAgent(scope, courseId)))
}))

classroomRouter.put('/courses/:courseId/rooms/:conversationId', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:manage')
  const input = parse(bindCourseRoomRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.bindRoom(
    scope, String(req.params.courseId), String(req.params.conversationId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/objectives', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:read')
  res.json(await respond(() => learningApplication.objectives(scope, String(req.params.courseId))))
}))

classroomRouter.post('/courses/:courseId/objectives', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:manage')
  const input = parse(createObjectivesRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createObjectives(
    scope, String(req.params.courseId), input,
  )))
}))

classroomRouter.post('/courses/:courseId/objectives/:objectiveId/status', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:manage')
  const input = parse(objectiveStatusRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.setObjectiveStatus(
    scope, String(req.params.courseId), String(req.params.objectiveId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/activities', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:read')
  res.json(await respond(() => learningApplication.activities(scope, String(req.params.courseId))))
}))

classroomRouter.post('/courses/:courseId/activities', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:manage')
  const input = parse(createActivityRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createActivity(
    scope, String(req.params.courseId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/activities/:activityId', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:read')
  res.json(await respond(() => learningApplication.activity(
    scope, String(req.params.courseId), String(req.params.activityId),
  )))
}))

classroomRouter.post('/courses/:courseId/activities/:activityId/publish', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:manage')
  res.json(await respond(() => learningApplication.publishActivity(
    scope, String(req.params.courseId), String(req.params.activityId),
  )))
}))

classroomRouter.post('/courses/:courseId/activities/:activityId/close', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:manage')
  res.json(await respond(() => learningApplication.closeActivity(
    scope, String(req.params.courseId), String(req.params.activityId),
  )))
}))

classroomRouter.post('/courses/:courseId/activities/:activityId/submit', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:submit')
  const input = parse(submitActivityRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.submitActivity(
    scope, String(req.params.courseId), String(req.params.activityId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/missions', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:read')
  res.json(await respond(() => learningApplication.missions(scope, String(req.params.courseId))))
}))

classroomRouter.patch('/courses/:courseId/missions/:missionId/coordinator', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:manage')
  const input = parse(missionCoordinatorRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.setMissionCoordinator(
    scope, String(req.params.courseId), String(req.params.missionId), input,
  )))
}))

classroomRouter.get('/courses/:courseId/evidence', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:read')
  const learnerId = typeof req.query.learnerId === 'string' ? req.query.learnerId : undefined
  res.json(await respond(() => learningApplication.evidence(scope, String(req.params.courseId), learnerId)))
}))

classroomRouter.get('/courses/:courseId/reviews', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:review')
  res.json(await respond(() => learningApplication.reviews(scope, String(req.params.courseId))))
}))

classroomRouter.get('/courses/:courseId/progress', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:read')
  res.json(await respond(() => learningApplication.progress(scope, String(req.params.courseId))))
}))

classroomRouter.post('/courses/:courseId/reviews/:evaluationId', safe(async (req, res) => {
  const scope = await requireCoursePermission(req, String(req.params.courseId), 'learning:review')
  const input = parse(reviewEvaluationRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.review(
    scope, String(req.params.courseId), String(req.params.evaluationId), input,
  )))
}))
