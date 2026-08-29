import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { requireConversationMember } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertProjectWritable, requireCompany } from '../../http/request-context.js'
import {
  emailReplyRequestSchema,
  messageHistoryQuerySchema,
} from './contracts.js'
import { messagesApplication } from './facade.js'

export const messagesRouter = Router()

function badRequest(result: { error: { issues: Array<{ message: string }> } }): never {
  throw new HttpError(400, result.error.issues[0]?.message ?? 'invalid request')
}

// Chat writes never enter this HTTP collection. Email is the sole native
// projection here; WuKongIM remains authoritative for ordinary messages.
messagesRouter.all('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { companyId } = await requireCompany(req)
    if (await messagesApplication.kind(companyId, String(req.params.id)) === 'email') {
      next()
      return
    }
    res.status(410).json({
      error: 'REST message writes are retired; use WuKongIM',
      transport: 'wukongim',
    })
  } catch (error) {
    next(error)
  }
})

messagesRouter.get('/conversations/:id/messages', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const { companyId } = await requireConversationMember(req, conversationId)
  const parsed = messageHistoryQuerySchema.safeParse(req.query)
  if (!parsed.success) badRequest(parsed)
  res.json(await messagesApplication.history({ companyId, conversationId, ...parsed.data }))
}))

messagesRouter.post('/conversations/:id/messages', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const scope = await requireConversationMember(req, conversationId)
  await assertProjectWritable(scope.projectId)
  if (scope.kind !== 'email') {
    res.status(410).json({
      error: 'REST message writes are retired; use WuKongIM',
      transport: 'wukongim',
    })
    return
  }
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

messagesRouter.get('/conversations/:id/messages/:rootId/replies', safe(async (req, res) => {
  const conversationId = String(req.params.id)
  const { companyId } = await requireConversationMember(req, conversationId)
  res.json(await messagesApplication.replies(
    companyId,
    conversationId,
    String(req.params.rootId),
  ))
}))
