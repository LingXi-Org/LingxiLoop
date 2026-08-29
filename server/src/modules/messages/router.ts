import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requireConversationMember } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertProjectWritable } from '../../http/request-context.js'
import {
  emailReplyRequestSchema,
  messageHistoryQuerySchema,
} from './contracts.js'
import { messagesApplication } from './facade.js'

export const messagesRouter = Router()

function badRequest(result: { error: { issues: Array<{ message: string }> } }): never {
  throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
}

messagesRouter.get('/conversations/:id/messages', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const { companyId, kind } = await requireConversationMember(req, conversationId)
  if (kind !== 'email') throw new HttpError(404, 'not found')
  const parsed = messageHistoryQuerySchema.safeParse(req.query)
  if (!parsed.success) badRequest(parsed)
  res.json(await messagesApplication.emailHistory({ companyId, conversationId, ...parsed.data }))
}))

messagesRouter.post('/conversations/:id/messages', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationMember(req, conversationId)
  await assertProjectWritable(scope.projectId)
  if (scope.kind !== 'email') throw new HttpError(404, 'not found')
  const parsed = emailReplyRequestSchema.safeParse(req.body ?? {})
  if (!parsed.success) badRequest(parsed)
  const result = await messagesApplication.replyEmail({
    conversationId,
    companyId: scope.companyId,
    authorId: scope.userId,
    body: parsed.data.body,
  })
  res.status(result.transportStatus === 'sent' ? 202 : 502).json({
    id: result.messageId,
    sequence: result.sequence,
    transportStatus: result.transportStatus,
    error: result.error,
  })
}))
