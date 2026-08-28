import { type NextFunction, type Request, type Response, Router } from 'express'
import type { AuthedRequest } from '../../auth.js'
import { pool } from '../../db/pool.js'
import { requireCompany } from '../../http/request-context.js'
import {
  bindCourseRoom,
  closeActivity,
  courseProgress,
  createObjectives,
  draftActivity,
  getNotificationPreferences,
  learningDashboard,
  listActivities,
  listEvaluationQueue,
  listEvidence,
  listMissions,
  listObjectives,
  publishActivity,
  requireCourseRole,
  reviewEvaluation,
  setNotificationPreferences,
  setMissionCoordinator,
  setObjectiveStatus,
  submitActivity,
} from '../../learning/service.js'
import type { LearningActivityType, LearningEvaluationMode, LearningRoomPurpose } from '../../learning/types.js'
import { getTeacherAgentSummary } from '../../learning/teacher-agent.js'

export const classroomRouter = Router()
const learningRouter = classroomRouter

type LearningRequest = Request<Record<string, string>> & AuthedRequest

function safe(handler: (req: LearningRequest, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => void handler(req as LearningRequest, res).catch((error: unknown) => {
    if (error instanceof Error) {
      const explicit = Number((error as Error & { status?: number }).status)
      const status = Number.isInteger(explicit) && explicit >= 400 && explicit < 600
        ? explicit
        : /access denied|role required|membership required/.test(error.message) ? 403 : 400
      res.status(status).json({ error: error.message })
      return
    }
    next(error)
  })
}

function body(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {}
}

function text(value: unknown, name: string): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (!result) throw new Error(`${name} is required`)
  return result
}

async function scope(req: Request & AuthedRequest): Promise<{ userId: string; companyId: string }> {
  return requireCompany(req)
}

async function assertCourseCompany(courseId: string, companyId: string): Promise<void> {
  const { rows } = await pool.query(`SELECT 1 FROM courses WHERE id=$1 AND company_id=$2`, [courseId, companyId])
  if (!rows[0]) throw Object.assign(new Error('course not found'), { status: 404 })
}

learningRouter.get('/learning/dashboard', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  res.json(await learningDashboard(companyId, userId))
}))

learningRouter.get('/courses/:courseId/teacher-agent', safe(async (req,res)=>{
  const {userId,companyId}=await scope(req)
  await assertCourseCompany(req.params.courseId,companyId)
  res.json(await getTeacherAgentSummary(req.params.courseId,userId))
}))

learningRouter.put('/courses/:courseId/rooms/:conversationId', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  await assertCourseCompany(req.params.courseId, companyId)
  const purpose = body(req).purpose
  if (purpose !== 'lab' && purpose !== 'discussion') throw new Error('purpose must be lab or discussion; Study Room binding is canonical on the Course')
  await bindCourseRoom({ courseId: req.params.courseId, teacherId: userId, conversationId: req.params.conversationId, purpose: purpose as LearningRoomPurpose })
  res.json({ ok: true })
}))

learningRouter.get('/courses/:courseId/objectives', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  await assertCourseCompany(req.params.courseId, companyId)
  const { rows: membership } = await pool.query<{ role: 'teacher' | 'learner' }>(
    `SELECT role FROM course_members WHERE course_id=$1 AND company_id=$2 AND user_id=$3`,
    [req.params.courseId, companyId, userId],
  )
  const courseRole = membership[0]?.role
  if (!courseRole) throw Object.assign(new Error('course membership required'), { status: 403 })
  const objectives = await listObjectives(req.params.courseId)
  res.json(courseRole === 'teacher' ? objectives : objectives.filter((objective) => objective.status === 'published'))
}))

learningRouter.post('/courses/:courseId/objectives', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  await assertCourseCompany(req.params.courseId, companyId)
  await requireCourseRole(req.params.courseId, userId, 'teacher')
  const data = body(req)
  const objectives = Array.isArray(data.objectives) ? data.objectives as Array<Record<string, unknown>> : []
  res.status(201).json(await createObjectives({ courseId: req.params.courseId, actorId: userId, actorKind: 'teacher', objectives: objectives.map((item) => ({
    title: text(item.title, 'title'), successCriteria: text(item.successCriteria, 'successCriteria'),
    ...(item.targetLevel !== undefined ? { targetLevel: Number(item.targetLevel) } : {}),
    ...(Array.isArray(item.prerequisiteIds) ? { prerequisiteIds: item.prerequisiteIds.map(String) } : {}),
  })) }))
}))

learningRouter.post('/courses/:courseId/objectives/:objectiveId/status', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  const status = body(req).status
  if (status !== 'draft' && status !== 'published' && status !== 'archived') throw new Error('invalid objective status')
  await setObjectiveStatus(req.params.courseId, req.params.objectiveId, userId, status)
  res.json({ ok: true })
}))

learningRouter.get('/courses/:courseId/activities', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  await assertCourseCompany(req.params.courseId, companyId)
  res.json(await listActivities(req.params.courseId, userId))
}))

learningRouter.post('/courses/:courseId/activities', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  await assertCourseCompany(req.params.courseId, companyId)
  await requireCourseRole(req.params.courseId, userId, 'teacher')
  const data = body(req)
  res.status(201).json(await draftActivity({ courseId: req.params.courseId, actorId: userId,
    title: text(data.title, 'title'), instructions: text(data.instructions, 'instructions'), type: text(data.type, 'type') as LearningActivityType,
    evaluationMode: (data.evaluationMode === 'agent_formative' ? 'agent_formative' : 'teacher_required') as LearningEvaluationMode,
    targetLevel: Number(data.targetLevel ?? 2), rubric: Array.isArray(data.rubric) ? data.rubric : [],
    objectiveIds: Array.isArray(data.objectiveIds) ? data.objectiveIds.map(String) : [],
    ...(typeof data.dueAt === 'string' ? { dueAt: data.dueAt } : {}),
  }))
}))

learningRouter.get('/courses/:courseId/activities/:activityId', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  await assertCourseCompany(req.params.courseId, companyId)
  const visible = await listActivities(req.params.courseId, userId)
  const activity = visible.find((item) => item.id === req.params.activityId)
  if (!activity) throw Object.assign(new Error('activity not found'), { status: 404 })
  res.json(activity)
}))

learningRouter.post('/courses/:courseId/activities/:activityId/publish', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  await publishActivity(req.params.courseId, req.params.activityId, userId); res.json({ ok: true })
}))

learningRouter.post('/courses/:courseId/activities/:activityId/close', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  await closeActivity(req.params.courseId, req.params.activityId, userId); res.json({ ok: true })
}))

learningRouter.post('/courses/:courseId/activities/:activityId/submit', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  const data = body(req)
  res.status(201).json(await submitActivity({ courseId: req.params.courseId, activityId: req.params.activityId,
    learnerId: userId, answer: text(data.answer, 'answer'), assistance: data.assistance === 'hint' || data.assistance === 'guided' ? data.assistance : 'none' }))
}))

learningRouter.get('/courses/:courseId/missions', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  res.json(await listMissions(req.params.courseId, userId))
}))

learningRouter.patch('/courses/:courseId/missions/:missionId/coordinator',safe(async(req,res)=>{
  const {userId,companyId}=await scope(req);await assertCourseCompany(req.params.courseId,companyId)
  res.json(await setMissionCoordinator({courseId:req.params.courseId,missionId:req.params.missionId,teacherId:userId,agentId:text(body(req).agentId,'agentId')}))
}))

learningRouter.get('/courses/:courseId/evidence', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  res.json(await listEvidence(req.params.courseId, userId, typeof req.query.learnerId === 'string' ? req.query.learnerId : userId))
}))

learningRouter.get('/courses/:courseId/reviews', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  res.json(await listEvaluationQueue(req.params.courseId, userId))
}))

learningRouter.get('/courses/:courseId/progress', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  res.json(await courseProgress(req.params.courseId, userId))
}))

learningRouter.post('/courses/:courseId/reviews/:evaluationId', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); await assertCourseCompany(req.params.courseId, companyId)
  const data = body(req)
  await reviewEvaluation({ courseId: req.params.courseId, evaluationId: req.params.evaluationId, teacherId: userId,
    decision: data.decision === 'reject' ? 'reject' : 'accept', ...(data.overrideLevel === undefined ? {} : { overrideLevel: Number(data.overrideLevel) }),
    reason: text(data.reason, 'reason') })
  res.json({ ok: true })
}))

learningRouter.get('/learning/notification-preferences', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  res.json(await getNotificationPreferences(companyId, userId, typeof req.query.courseId === 'string' ? req.query.courseId : undefined))
}))

learningRouter.put('/learning/notification-preferences', safe(async (req, res) => {
  const { userId, companyId } = await scope(req); const data = body(req)
  res.json(await setNotificationPreferences({ companyId, userId, ...(typeof data.courseId === 'string' ? { courseId: data.courseId } : {}),
    inAppEnabled: data.inAppEnabled !== false, emailEnabled: data.emailEnabled === true,
    timezone: typeof data.timezone === 'string' ? data.timezone : 'Asia/Shanghai', preferredTime: typeof data.preferredTime === 'string' ? data.preferredTime : '19:00',
    ...(typeof data.quietStart === 'string' ? { quietStart: data.quietStart } : {}), ...(typeof data.quietEnd === 'string' ? { quietEnd: data.quietEnd } : {}),
  }))
}))

learningRouter.get('/learning/deliveries', safe(async (req, res) => {
  const { userId, companyId } = await scope(req)
  const { rows } = await pool.query(
    `SELECT * FROM learning_notification_deliveries
      WHERE company_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 100`,
    [companyId, userId],
  )
  res.json(rows)
}))
