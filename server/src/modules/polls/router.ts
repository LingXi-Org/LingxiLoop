import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany } from '../../http/request-context.js'
import { permissionService } from '../access/public.js'
import { pollApplication } from './facade.js'
import {
  createPollRequestSchema,
  PollApplicationError,
  votePollRequestSchema,
} from './contracts.js'

export const pollsRouter = Router()
const api = pollsRouter

function statusFor(code: PollApplicationError['code']): number {
  if (code === 'invalid') return 400
  if (code === 'forbidden') return 403
  if (code === 'not_found') return 404
  if (code === 'conflict') return 409
  return 500
}

async function pollUseCase<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof PollApplicationError) throw new HttpError(statusFor(error.code), error.message)
    throw error
  }
}

api.post('/polls', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  const input = createPollRequestSchema.parse(req.body)
  await permissionService.assertCan({
    actorUserId: userId,
    action: 'poll:create',
    companyId,
    resource: { type: 'conversation', id: input.conversationId },
  })
  const { clientRequestId, ...poll } = input
  const created = await pollUseCase(() => pollApplication.create({
    ...poll,
    companyId,
    actorId: userId,
    idempotencyKey: clientRequestId,
  }))
  res.status(201).json(created)
}))

api.post('/polls/:messageId/vote', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  const messageId = String(req.params.messageId)
  const input = votePollRequestSchema.parse(req.body)
  await permissionService.assertCan({
    actorUserId: userId,
    action: 'poll:vote',
    companyId,
    resource: { type: 'poll', id: messageId },
  })
  const event = await pollUseCase(() => pollApplication.vote({
    messageId,
    companyId,
    actorId: userId,
    voterKind: 'human',
    optionIds: input.optionIds,
  }))
  res.json({ tallies: event.tallies, poll: event.poll })
}))

api.post('/polls/:messageId/close', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  const messageId = String(req.params.messageId)
  await permissionService.assertCan({
    actorUserId: userId,
    action: 'poll:close',
    companyId,
    resource: { type: 'poll', id: messageId },
  })
  const event = await pollUseCase(() => pollApplication.close({
    messageId,
    companyId,
    actorId: userId,
    reason: 'manual',
  }))
  res.json({ closed: Boolean(event), poll: event?.poll ?? null })
}))
