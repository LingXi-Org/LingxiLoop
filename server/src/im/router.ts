import { createHmac } from 'node:crypto'
import { Router, type Request, type Response, type NextFunction } from 'express'
import type { AuthedRequest } from '../auth.js'
import { agentApprovalApplication, agentControlApplication } from '../agent-os/public.js'
import { wukongClient } from './wukong.js'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import { assertTeacherRoomAccessible } from '../modules/learning/public.js'
import { imAccessApplication } from './access-facade.js'
import { imChannelsApplication } from './channels-facade.js'
import { imMessagesApplication } from './messages-facade.js'
import {
  isReadReceiptChannelMember,
  listReadReceiptAdvances,
} from './read-receipts.js'

export const imRouter = Router()

function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void>): (req: Request & AuthedRequest, res: Response, next: NextFunction) => void {
  return (req, res, next) => { void handler(req, res).catch(next) }
}

async function identity(req: Request & AuthedRequest): Promise<{ userId: string; companyId: string }> {
  const userId = req.authUserId
  const companyId = String(req.headers['x-company-id'] ?? '').trim()
  if (!userId) throw Object.assign(new Error('authentication required'), { status: 401 })
  if (!companyId) throw Object.assign(new Error('x-company-id required'), { status: 400 })
  if (!await imAccessApplication.authorize({ userId, companyId })) {
    throw Object.assign(new Error('not a company member'), { status: 403 })
  }
  return { userId, companyId }
}

function userImToken(uid: string): string {
  const secret = process.env.WUKONG_USER_TOKEN_SECRET?.trim() || process.env.AGENT_OS_SERVICE_TOKEN?.trim()
  if (!secret) throw new Error('WUKONG_USER_TOKEN_SECRET or AGENT_OS_SERVICE_TOKEN is required')
  return createHmac('sha256', secret).update(`wukong-user:${uid}`).digest('base64url')
}

imRouter.get('/bootstrap', safe(async (req, res) => {
  const { userId } = await identity(req)
  res.json(await wukongClient().bootstrap(userId, userImToken(userId)))
}))

imRouter.post('/refresh', safe(async (req, res) => {
  const { userId } = await identity(req)
  res.json(await wukongClient().bootstrap(userId, userImToken(userId)))
}))

imRouter.get('/channels', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const projectId = String(req.headers['x-project-id'] ?? '').trim()
  if (!projectId) { res.status(400).json({ error: 'x-project-id required' }); return }
  res.json(await imChannelsApplication.list({ companyId, userId, projectId }))
}))

imRouter.get('/channels/:id/messages', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const requestedLimit = Number(req.query.limit ?? 80)
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit <= 0) {
    res.status(400).json({ error: 'limit must be a positive safe integer' })
    return
  }
  const limit = Math.min(200, requestedLimit)
  const beforeSeq = req.query.beforeSeq === undefined ? 0 : Number(req.query.beforeSeq)
  if (!Number.isSafeInteger(beforeSeq) || beforeSeq < 0) {
    res.status(400).json({ error: 'beforeSeq must be a non-negative safe integer' })
    return
  }
  const messages = await imMessagesApplication.history({ companyId, userId, channelId, limit, beforeSequence: beforeSeq })
  if (!messages) { res.status(404).json({ error: 'channel not found' }); return }
  res.json(messages)
}))

imRouter.post('/channels/:id/reactions', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId, companyId, userId)
  const messageId = String(req.body?.messageId ?? '').trim()
  const messageSeq = Number(req.body?.messageSeq)
  const emoji = String(req.body?.emoji ?? '').trim()
  if (!messageId || !Number.isSafeInteger(messageSeq) || messageSeq <= 0 || !emoji || emoji.length > 32) {
    res.status(400).json({ error: 'messageId, messageSeq, and emoji are required' }); return
  }
  const result = await imMessagesApplication.toggleReaction({
    companyId, userId, channelId, messageId, messageSeq, emoji,
  })
  if (!result) { res.status(404).json({ error: 'message not found in the authoritative channel history' }); return }
  res.json(result)
}))

imRouter.post('/channels/:id/messages/accept', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const clientNonce = String(req.body?.clientNonce ?? '').trim()
  const rawPayload = req.body?.payload as LingxiMessageV1
  if (!clientNonce || clientNonce.length > 80 || !rawPayload || rawPayload.version !== 1 || rawPayload.clientMsgNo !== clientNonce) {
    res.status(400).json({ error: 'valid clientNonce and matching LingxiMessageV1 payload required' }); return
  }
  const rawData = rawPayload.data && typeof rawPayload.data === 'object' ? rawPayload.data : {}
  const { suppressAgentWake: _suppressAgentWake, ...safeData } = rawData
  const payload: LingxiMessageV1 = {
    version: 1, kind: rawPayload.kind, clientMsgNo: clientNonce,
    ...(rawPayload.body ? { body: rawPayload.body } : {}),
    ...(rawPayload.replyToClientMsgNo ? { replyToClientMsgNo: rawPayload.replyToClientMsgNo } : {}),
    data: safeData,
  }
  if (!['text', 'attachment'].includes(payload.kind) || (!payload.body?.trim() && payload.kind !== 'attachment')) {
    res.status(400).json({ error: 'invalid user message payload' }); return
  }
  const result = await imMessagesApplication.acceptUserMessage({
    companyId, userId, channelId, clientNonce, payload,
  })
  if (result.kind === 'channel_not_found') { res.status(404).json({ error: 'channel not found' }); return }
  if (result.kind === 'nonce_conflict') { res.status(409).json({ error: 'clientNonce was reused with different input' }); return }
  res.status(result.duplicate ? 200 : 202).json({ status: 'accepted', echo: result.echo, ...(result.duplicate ? { duplicate: true } : {}) })
}))

imRouter.get('/sends/:clientNonce', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const status = await imMessagesApplication.sendStatus({
    companyId, userId, clientNonce: String(req.params.clientNonce),
  })
  if (!status) { res.status(404).json({ error: 'send acceptance not found' }); return }
  res.json(status)
}))

imRouter.post('/channels/:id/read', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
  const readThroughSeq = Number(body.readThroughSeq)
  if (!Number.isSafeInteger(readThroughSeq) || readThroughSeq <= 0) {
    res.status(400).json({ error: 'readThroughSeq must be a positive safe integer' })
    return
  }
  const result = await imMessagesApplication.markRead({ companyId, userId, channelId, readThroughSeq })
  if (result.kind === 'channel_not_found') { res.status(404).json({ error: 'channel not found' }); return }
  if (result.kind === 'cursor_ahead') {
    res.status(400).json({ error: 'readThroughSeq exceeds latest channel sequence', latestSeq: result.latestSeq })
    return
  }
  res.json({ ok: true, latestSeq: result.latestSeq, receipt: result.receipt })
}))

imRouter.get('/channels/:id/read-receipts', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertTeacherRoomAccessible(channelId, companyId, userId)
  if (!await isReadReceiptChannelMember({ companyId, channelId, userId })) {
    res.status(404).json({ error: 'channel not found' }); return
  }
  const fromSeq = Number(req.query.fromSeq)
  const toSeq = Number(req.query.toSeq)
  if (!Number.isSafeInteger(fromSeq) || fromSeq <= 0 || !Number.isSafeInteger(toSeq) || toSeq < fromSeq) {
    res.status(400).json({ error: 'invalid receipt sequence range' })
    return
  }
  const receipts = await listReadReceiptAdvances({ companyId, channelId, fromSeq, toSeq })
  res.json({ channelId, fromSeq, toSeq, receipts })
}))

imRouter.get('/approvals', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  res.json(await agentApprovalApplication.list({ companyId, userId }))
}))

imRouter.post('/approvals/:id/resolve', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const approved = req.body?.approved === true
  const result = await agentApprovalApplication.resolve({
    approvalId: String(req.params.id), companyId, userId, approved,
  })
  if (result.kind === 'not_found') { res.status(404).json({ error: 'approval not found' }); return }
  if (result.kind === 'conflict') { res.status(409).json({ error: `approval already ${result.status}` }); return }
  if (result.kind === 'expired') { res.status(409).json({ error: result.error, status: 'expired' }); return }
  res.json({ ok: result.ok, approved: result.approved, result: result.result, error: result.error })
}))

imRouter.get('/routines', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  res.json(await agentControlApplication.listRoutines({ companyId, userId }))
}))

imRouter.post('/routines/:id/pause', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const routine = await agentControlApplication.pauseRoutine({ routineId: String(req.params.id), companyId, userId })
  if (!routine) { res.status(404).json({ error: 'routine not found' }); return }
  res.json(routine)
}))

imRouter.post('/runs/stop', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const agentId = String(req.body?.agentId ?? '').trim()
  const channelId = String(req.body?.channelId ?? '').trim()
  if (!agentId || !channelId) { res.status(400).json({ error: 'agentId and channelId required' }); return }
  const result = await agentControlApplication.stop({ companyId, userId, agentId, channelId })
  if (!result) { res.status(404).json({ error: 'no active run' }); return }
  res.json({ ok: true, workId: result.workId })
}))

imRouter.post('/runs/steer', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const agentId = String(req.body?.agentId ?? '').trim()
  const channelId = String(req.body?.channelId ?? '').trim()
  const text = String(req.body?.text ?? '').trim().slice(0, 4_000)
  const clientRequestId = String(req.body?.clientRequestId ?? '').trim()
  if (!agentId || !channelId || !text || !clientRequestId || clientRequestId.length > 80) {
    res.status(400).json({ error: 'agentId, channelId, text and clientRequestId required' }); return
  }
  const result = await agentControlApplication.steer({ companyId, userId, agentId, channelId, text, clientRequestId })
  if (!result) { res.status(404).json({ error: 'no active run' }); return }
  if (result.kind === 'conflict') { res.status(409).json({ error: 'clientRequestId was reused with different text' }); return }
  res.json({ ok: true, workId: result.workId, steerId: result.steerId })
}))
