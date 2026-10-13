import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { safe } from '../../http/async-handler.js'
import { requireCompany } from '../../http/request-context.js'
import { ForumApplication } from './forum-application.js'
import { forumCommentSchema, forumFlagsSchema, forumPageSchema, forumPostSchema, forumQuerySchema, forumTargetSchema } from './forum-contracts.js'
import { parseLearningRequest as parse, respondWithLearning as respond } from './http-adapter.js'

export const forumRouter = Router()
const forum = new ForumApplication(pool, work => withTransaction(pool, work))

forumRouter.get('/courses/:courseId/forum', safe(async (req, res) => {
  const scope = await requireCompany(req), query = parse(forumQuerySchema.safeParse(req.query))
  res.json(await respond(() => forum.list(scope, String(req.params.courseId), query)))
}))
forumRouter.post('/courses/:courseId/forum', safe(async (req, res) => {
  const scope = await requireCompany(req), input = parse(forumPostSchema.safeParse(req.body))
  res.status(201).json(await respond(() => forum.createPost(scope, String(req.params.courseId), input)))
}))
forumRouter.get('/courses/:courseId/forum/:type/:id', safe(async (req, res) => {
  const scope = await requireCompany(req), type = parse(forumTargetSchema.safeParse(req.params.type))
  res.json(await respond(() => forum.detail(scope, String(req.params.courseId), type, String(req.params.id))))
}))
forumRouter.patch('/courses/:courseId/forum/:type/:id', safe(async (req, res) => {
  const scope = await requireCompany(req), type = parse(forumTargetSchema.safeParse(req.params.type)), input = parse(forumFlagsSchema.safeParse(req.body))
  res.json(await respond(() => forum.updateFlags(scope, String(req.params.courseId), type, String(req.params.id), input)))
}))
forumRouter.get('/courses/:courseId/forum/:type/:id/comments', safe(async (req, res) => {
  const scope = await requireCompany(req), type = parse(forumTargetSchema.safeParse(req.params.type)), query = parse(forumPageSchema.safeParse(req.query))
  res.json(await respond(() => forum.comments(scope, String(req.params.courseId), type, String(req.params.id), query.offset)))
}))
forumRouter.post('/courses/:courseId/forum/:type/:id/comments', safe(async (req, res) => {
  const scope = await requireCompany(req), type = parse(forumTargetSchema.safeParse(req.params.type)), input = parse(forumCommentSchema.safeParse(req.body))
  res.status(201).json(await respond(() => forum.comment(scope, String(req.params.courseId), type, String(req.params.id), input)))
}))
forumRouter.get('/courses/:courseId/activities/:activityId/submissions', safe(async (req, res) => {
  const scope = await requireCompany(req), query = parse(forumPageSchema.safeParse(req.query))
  res.json(await respond(() => forum.submissions(scope, String(req.params.courseId), String(req.params.activityId), query.offset)))
}))
