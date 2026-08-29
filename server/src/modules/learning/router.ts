import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requireAuth, requireCompany } from '../../http/request-context.js'
import type { PermissionAction } from '../access/public.js'
import { permissionService } from '../access/public.js'
import { classroomRouter } from './classroom-router.js'
import {
  createCourseInvitationRequestSchema,
  createCourseRequestSchema,
  updateCourseMemberRequestSchema,
  updateCourseRequestSchema,
} from './contracts.js'
import { learningApplication } from './facade.js'
import { parseLearningRequest as parse, respondWithLearning as respond } from './http-adapter.js'

export const learningRouter = Router()

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

learningRouter.use(classroomRouter)

learningRouter.get('/courses', safe(async (req, res) => {
  const scope = await requireCompany(req)
  res.json(await learningApplication.courses(scope))
}))

learningRouter.post('/courses', safe(async (req, res) => {
  const scope = await requireCompany(req)
  await permissionService.assertCan({ actorUserId: scope.userId, action: 'course:create', companyId: scope.companyId })
  const input = parse(createCourseRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createCourse(scope, input)))
}))

learningRouter.get('/courses/:id', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const scope = await requireCoursePermission(req, courseId, 'course:read')
  res.json(await respond(() => learningApplication.course(scope, courseId)))
}))

learningRouter.patch('/courses/:id', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'course:update')
  const input = parse(updateCourseRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.updateCourse(userId, courseId, input)))
}))

learningRouter.get('/courses/:id/members', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'project_member:list')
  res.json(await respond(() => learningApplication.members(userId, courseId)))
}))

learningRouter.patch('/courses/:id/members/:userId', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'project_member:update')
  const input = parse(updateCourseMemberRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningApplication.updateMember(
    userId, courseId, String(req.params.userId), input.role,
  )))
}))

learningRouter.delete('/courses/:id/members/:userId', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'project_member:remove')
  res.json(await respond(() => learningApplication.removeMember(
    userId, courseId, String(req.params.userId),
  )))
}))

learningRouter.get('/courses/:id/invitations', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'project_invitation:list')
  res.json(await respond(() => learningApplication.invitations(userId, courseId)))
}))

learningRouter.post('/courses/:id/invitations', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'project_invitation:create')
  const input = parse(createCourseInvitationRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createInvitation(
    userId, courseId, input,
  )))
}))

learningRouter.delete('/courses/:id/invitations/:inviteId', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'project_invitation:revoke')
  res.json(await respond(() => learningApplication.revokeInvitation(
    userId, courseId, String(req.params.inviteId),
  )))
}))

learningRouter.get('/course-invitations/:token', safe(async (req, res) => {
  res.json(await learningApplication.invitationPreview(String(req.params.token), req.authUserId))
}))

learningRouter.post('/course-invitations/:token/accept', safe(async (req, res) => {
  const userId = requireAuth(req)
  res.json(await respond(() => learningApplication.acceptInvitation(userId, String(req.params.token))))
}))
