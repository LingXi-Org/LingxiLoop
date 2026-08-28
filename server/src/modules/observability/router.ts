import { Router } from 'express'
import { deleteAutonomyRule, listAutonomyRules, listHandoffs, upsertAutonomyRule } from '../../agents/coworker.js'
import { safe } from '../../http/async-handler.js'
import { requireConversationMember } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany } from '../../http/request-context.js'
import { ObservabilityNotFoundError } from './application.js'
import {
  activityQuerySchema,
  autonomyRuleSchema,
  memoryDeleteSchema,
  memoryUpdateSchema,
} from './contracts.js'
import { observabilityApplication } from './facade.js'

export const observabilityRouter = Router()

function parsedOr400<T>(result: { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } }): T {
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
  return result.data
}

observabilityRouter.get('/coworker/activity', safe(async (req, res) => {
  const input = parsedOr400(activityQuerySchema.safeParse(req.query))
  const { companyId } = await requireConversationMember(req, input.conversationId)
  res.json(await observabilityApplication.activity(companyId, input.conversationId))
}))

observabilityRouter.get('/coworker/handoffs', safe(async (req, res) => {
  const { companyId } = await requireCompany(req)
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId.trim() : undefined
  if (conversationId) await requireConversationMember(req, conversationId)
  res.json(await listHandoffs(companyId, conversationId || undefined))
}))

observabilityRouter.get('/coworker/memories', safe(async (req, res) => {
  const { companyId } = await requireCompany(req)
  res.json(await observabilityApplication.memories(companyId))
}))

observabilityRouter.patch('/coworker/memories', safe(async (req, res) => {
  const { companyId } = await requireCompany(req)
  const input = parsedOr400(memoryUpdateSchema.safeParse(req.body ?? {}))
  try { res.json(await observabilityApplication.updateMemory(companyId, input)) }
  catch (error) {
    if (error instanceof ObservabilityNotFoundError) throw new HttpError(404, error.message)
    throw error
  }
}))

observabilityRouter.delete('/coworker/memories', safe(async (req, res) => {
  const { companyId } = await requireCompany(req)
  const input = parsedOr400(memoryDeleteSchema.safeParse(req.query))
  try { res.json(await observabilityApplication.deleteMemory(companyId, input)) }
  catch (error) {
    if (error instanceof ObservabilityNotFoundError) throw new HttpError(404, error.message)
    throw error
  }
}))

observabilityRouter.get('/coworker/autonomy-rules', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  res.json(await listAutonomyRules(companyId, userId))
}))

observabilityRouter.put('/coworker/autonomy-rules', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  const input = parsedOr400(autonomyRuleSchema.safeParse(req.body ?? {}))
  res.json(await upsertAutonomyRule({ companyId, userId, ...input }))
}))

observabilityRouter.delete('/coworker/autonomy-rules/:id', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  if (!await deleteAutonomyRule(companyId, userId, String(req.params.id))) throw new HttpError(404, 'rule not found')
  res.json({ ok: true })
}))
