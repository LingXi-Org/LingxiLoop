
import { type Response, Router } from 'express'
import { HttpError } from '../../http/errors.js'
import { assertConversationWritable, assertPollConversationWritable, requireCompany, } from '../../http/request-context.js'
import { castVote, closePoll, createPoll, PollError } from '../../polls.js'

export const pollsRouter = Router()
const api = pollsRouter

/* ============== Polls ====================================================
 * WuKongIM owns poll messages and revision snapshots. Postgres contains only
 * the vote projection; both humans and the loop SDK share ../polls.ts. */

function pollHttpError(res: Response, e: unknown): void {
  if (e instanceof PollError) {
    res.status(e.status).json({ error: e.message })
    return
  }
  if (e instanceof HttpError) {
    res.status(e.status).json({ error: e.message })
    return
  }
  console.error('[polls] unhandled', e)
  res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
}

api.post('/polls', async (req, res) => {
  try {
    const { userId: me, companyId: tenant } = await requireCompany(req)
    const body = req.body ?? {}
    const conversationId = String(body.conversationId ?? '')
    if (!conversationId) { res.status(400).json({ error: 'conversationId required' }); return }
    await assertConversationWritable(tenant, conversationId)
    const optionsRaw = Array.isArray(body.options) ? body.options : []
    const created = await createPoll({
      conversationId,
      companyId: tenant,
      authorId: me,
      question: String(body.question ?? ''),
      mode: body.mode === 'multi' ? 'multi' : 'single',
      options: optionsRaw.map((o: unknown) => String(o ?? '')),
      expiresInMinutes: typeof body.expiresInMinutes === 'number'
        ? body.expiresInMinutes
        : null,
    })
    res.status(201).json(created)
  } catch (e) { pollHttpError(res, e) }
})

api.post('/polls/:messageId/vote', async (req, res) => {
  try {
    const { userId: me, companyId: tenant } = await requireCompany(req)
    const messageId = req.params.messageId
    await assertPollConversationWritable(tenant, messageId)
    const rawOptionIds = Array.isArray(req.body?.optionIds) ? req.body.optionIds : []
    const optionIds = rawOptionIds.map((x: unknown) => String(x ?? '')).filter(Boolean)
    const event = await castVote({
      messageId,
      companyId: tenant,
      voterParticipantId: me,
      voterKind: 'human',
      optionIds,
    })
    res.json({ tallies: event.tallies, poll: event.poll })
  } catch (e) { pollHttpError(res, e) }
})

api.post('/polls/:messageId/close', async (req, res) => {
  try {
    const { userId: me, companyId: tenant } = await requireCompany(req)
    const messageId = req.params.messageId
    await assertPollConversationWritable(tenant, messageId)
    const event = await closePoll({
      messageId,
      companyId: tenant,
      actorId: me,
      reason: 'manual',
    })
    res.json({ closed: !!event, poll: event?.poll ?? null })
  } catch (e) { pollHttpError(res, e) }
})
