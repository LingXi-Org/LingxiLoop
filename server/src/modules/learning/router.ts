import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requireAuth, requireCompany, requireWorkspace } from '../../http/request-context.js'
import type { PermissionAction } from '../access/public.js'
import { permissionService } from '../access/public.js'
import { classroomRouter } from './classroom-router.js'
import { learningCasesRouter } from './cases-router.js'
import {
  addInstitutionalCourseMemberRequestSchema,
  createProjectInvitationRequestSchema,
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
learningRouter.use(learningCasesRouter)

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

learningRouter.post('/institutional-courses', safe(async (req, res) => {
  const scope = await requireCompany(req)
  await permissionService.assertCan({ actorUserId: scope.userId, action: 'course:create', companyId: scope.companyId })
  const input = parse(createCourseRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createInstitutionalCourse(scope, input)))
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

learningRouter.put('/courses/:id/members/:userId', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'project_member:add')
  const input = parse(addInstitutionalCourseMemberRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.addInstitutionalMember(
    userId,
    courseId,
    String(req.params.userId),
    input,
  )))
}))

learningRouter.delete('/courses/:id/members/:userId', safe(async (req, res) => {
  const courseId = String(req.params.id)
  const { userId } = await requireCoursePermission(req, courseId, 'project_member:remove')
  res.json(await respond(() => learningApplication.removeMember(
    userId, courseId, String(req.params.userId),
  )))
}))

learningRouter.get('/projects/:projectId/invitations', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireWorkspace(req, projectId, 'project_invitation:list')
  res.json(await respond(() => learningApplication.invitations(scope)))
}))

learningRouter.post('/projects/:projectId/invitations', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireWorkspace(req, projectId, 'project_invitation:create')
  const input = parse(createProjectInvitationRequestSchema.safeParse(req.body ?? {}))
  res.status(201).json(await respond(() => learningApplication.createInvitation(scope, input)))
}))

learningRouter.delete('/projects/:projectId/invitations/:inviteId', safe(async (req, res) => {
  const projectId = String(req.params.projectId)
  const scope = await requireWorkspace(req, projectId, 'project_invitation:revoke')
  res.json(await respond(() => learningApplication.revokeInvitation(scope, String(req.params.inviteId))))
}))

learningRouter.get('/project-invitations/:token', safe(async (req, res) => {
  res.json(await learningApplication.invitationPreview(String(req.params.token), req.authUserId))
}))

learningRouter.post('/project-invitations/:token/accept', safe(async (req, res) => {
  const userId = requireAuth(req)
  res.json(await respond(() => learningApplication.acceptInvitation(userId, String(req.params.token))))
}))
