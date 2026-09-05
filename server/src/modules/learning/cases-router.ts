import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requestedCompanyId, requireAuth } from '../../http/request-context.js'
import {
  applyLearningCaseActionRequestSchema,
  createLearningCaseRequestSchema,
  learningCaseParamsSchema,
  learningCaseProjectParamsSchema,
  listLearningCasesQuerySchema,
} from './cases-contracts.js'
import { learningCasesApplication } from './facade.js'
import { parseLearningRequest as parse, respondWithLearning as respond } from './http-adapter.js'

export const learningCasesRouter = Router()

function requestScope(req: Parameters<typeof requireAuth>[0]) {
  return { actorUserId: requireAuth(req), companyId: requestedCompanyId(req) }
}

learningCasesRouter.get('/projects/:projectId/learning/cases', safe(async (req, res) => {
  const { projectId } = parse(learningCaseProjectParamsSchema.safeParse(req.params))
  const query = parse(listLearningCasesQuerySchema.safeParse(req.query))
  res.json(await respond(() => learningCasesApplication.listCases({
    ...requestScope(req),
    projectId,
    ...(query.userId ? { learnerId: query.userId } : {}),
    ...(query.knowledgeUnitId ? { knowledgeUnitId: query.knowledgeUnitId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  })))
}))

learningCasesRouter.post('/projects/:projectId/learning/cases', safe(async (req, res) => {
  const { projectId } = parse(learningCaseProjectParamsSchema.safeParse(req.params))
  const input = parse(createLearningCaseRequestSchema.safeParse(req.body ?? {}))
  const result = await respond(() => learningCasesApplication.createCase({
    ...requestScope(req),
    projectId,
    learnerId: input.userId,
    knowledgeUnitId: input.knowledgeUnitId,
    reason: input.reason,
    summary: input.summary,
  }))
  res.status(result.created ? 201 : 200).json(result)
}))

learningCasesRouter.get('/projects/:projectId/learning/cases/:caseId', safe(async (req, res) => {
  const { projectId, caseId } = parse(learningCaseParamsSchema.safeParse(req.params))
  res.json(await respond(() => learningCasesApplication.getCase({
    ...requestScope(req), projectId, caseId,
  })))
}))

learningCasesRouter.post('/projects/:projectId/learning/cases/:caseId/actions', safe(async (req, res) => {
  const { projectId, caseId } = parse(learningCaseParamsSchema.safeParse(req.params))
  const input = parse(applyLearningCaseActionRequestSchema.safeParse(req.body ?? {}))
  res.json(await respond(() => learningCasesApplication.applyAction({
    ...requestScope(req), projectId, caseId, ...input,
  })))
}))
