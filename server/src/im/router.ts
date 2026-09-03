import { Router, type Request, type Response, type NextFunction } from 'express'
import type { ZodType } from 'zod'
import type { AuthedRequest } from '../auth.js'
import { agentApprovalApplication, agentControlApplication } from '../agent-os/public.js'
import type { LingxiMessageV1 } from '../agent-os/types.js'
import { assertTeacherRoomAccessible } from '../modules/learning/public.js'
import type { PermissionAction } from '../modules/access/public.js'
import { permissionService } from '../modules/access/public.js'
import { imAccessApplication } from './access-facade.js'
import { imChannelsApplication } from './channels-facade.js'
import { imMessagesApplication } from './messages-facade.js'
import { imSessionApplication } from './session-facade.js'
import {
  agentRunControlRequestSchema,
  agentRunSteerRequestSchema,
  approvalResolutionRequestSchema,
  approvalSupersedeRequestSchema,
  imHistoryQuerySchema,
  imReactionRequestSchema,
  imReadReceiptsQuerySchema,
  imReadRequestSchema,
  imSendAcceptanceRequestSchema,
} from './contracts.js'
import {
  isReadReceiptChannelMember,
  listReadReceiptAdvances,
} from './read-receipts.js'

export const imRouter = Router()

function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void>): (req: Request & AuthedRequest, res: Response, next: NextFunction) => void {
  return (req, res, next) => { void handler(req, res).catch(next) }
}

function requestInput<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw Object.assign(new Error(parsed.error.issues[0]?.message ?? 'invalid request'), { status: 400 })
  }
  return parsed.data
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

async function assertChannelPermission(
  userId: string,
  companyId: string,
  channelId: string,
  action: PermissionAction,
): Promise<void> {
  await permissionService.assertCan({
    actorUserId: userId,
    action,
    companyId,
    resource: { type: 'conversation', id: channelId },
  })
}

imRouter.get('/bootstrap', safe(async (req, res) => {
  const { userId } = await identity(req)
  res.json(await imSessionApplication.bootstrap(userId))
}))

imRouter.post('/refresh', safe(async (req, res) => {
  const { userId } = await identity(req)
  res.json(await imSessionApplication.bootstrap(userId))
}))

imRouter.get('/channels', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const projectId = String(req.headers['x-project-id'] ?? '').trim()
  if (!projectId) { res.status(400).json({ error: 'x-project-id required' }); return }
  await permissionService.assertCan({ actorUserId: userId, action: 'project:read', companyId, projectId })
  res.json(await imChannelsApplication.list({ companyId, userId, projectId }))
}))

imRouter.get('/channels/:id/messages', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertChannelPermission(userId, companyId, channelId, 'conversation:read')
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const { limit, beforeSeq } = requestInput(imHistoryQuerySchema, req.query)
  const messages = await imMessagesApplication.history({ companyId, userId, channelId, limit, beforeSequence: beforeSeq })
  if (!messages) { res.status(404).json({ error: 'channel not found' }); return }
  res.json(messages)
}))

imRouter.post('/channels/:id/reactions', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertChannelPermission(userId, companyId, channelId, 'conversation:write')
  await assertTeacherRoomAccessible(channelId, companyId, userId)
  const { messageId, messageSeq, emoji } = requestInput(imReactionRequestSchema, req.body)
  const result = await imMessagesApplication.toggleReaction({
    companyId, userId, channelId, messageId, messageSeq, emoji,
  })
  if (!result) { res.status(404).json({ error: 'message not found in the authoritative channel history' }); return }
  res.json(result)
}))

imRouter.post('/channels/:id/messages/accept', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const channelId = String(req.params.id)
  await assertChannelPermission(userId, companyId, channelId, 'conversation:write')
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const { clientNonce, payload: parsedPayload } = requestInput(imSendAcceptanceRequestSchema, req.body)
  if (parsedPayload.clientMsgNo !== clientNonce) {
    res.status(400).json({ error: 'valid clientNonce and matching LingxiMessageV1 payload required' }); return
  }
  const rawData = parsedPayload.data ?? {}
  const { suppressAgentWake: _suppressAgentWake, ...safeData } = rawData
  const payload: LingxiMessageV1 = {
    version: 1, kind: parsedPayload.kind, clientMsgNo: clientNonce,
    ...(parsedPayload.body ? { body: parsedPayload.body } : {}),
    ...(parsedPayload.replyToClientMsgNo ? { replyToClientMsgNo: parsedPayload.replyToClientMsgNo } : {}),
    data: safeData,
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
  await assertChannelPermission(userId, companyId, channelId, 'conversation:read')
  await assertTeacherRoomAccessible(channelId,companyId,userId)
  const { readThroughSeq } = requestInput(imReadRequestSchema, req.body)
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
  await assertChannelPermission(userId, companyId, channelId, 'conversation:read')
  await assertTeacherRoomAccessible(channelId, companyId, userId)
  if (!await isReadReceiptChannelMember({ companyId, channelId, userId })) {
    res.status(404).json({ error: 'channel not found' }); return
  }
  const { fromSeq, toSeq } = requestInput(imReadReceiptsQuerySchema, req.query)
  const receipts = await listReadReceiptAdvances({ companyId, channelId, fromSeq, toSeq })
  res.json({ channelId, fromSeq, toSeq, receipts })
}))

imRouter.get('/approvals', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  res.json(await agentApprovalApplication.list({ companyId, userId }))
}))

imRouter.post('/approvals/:id/resolve', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { approved } = requestInput(approvalResolutionRequestSchema, req.body)
  const result = await agentApprovalApplication.resolve({
    approvalId: String(req.params.id), companyId, userId, approved,
  })
  if (result.kind === 'not_found') { res.status(404).json({ error: 'approval not found' }); return }
  if (result.kind === 'conflict') { res.status(409).json({ error: `approval already ${result.status}` }); return }
  if (result.kind === 'cancelled') { res.status(409).json({ error: result.error, status: 'CANCELLED' }); return }
  res.json({ ok: result.ok, approved: result.approved, result: result.result, error: result.error })
}))

imRouter.post('/approvals/:id/supersede', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { args, summary } = requestInput(approvalSupersedeRequestSchema, req.body)
  const result = await agentApprovalApplication.supersede({
    approvalId: String(req.params.id), companyId, userId, args, ...(summary ? { summary } : {}),
  })
  if (result.kind === 'not_found') { res.status(404).json({ error: 'approval not found' }); return }
  if (result.kind === 'conflict') { res.status(409).json({ error: `approval already ${result.status}` }); return }
  res.status(201).json({ approvalId: result.approvalId, supersedesApprovalId: String(req.params.id) })
}))

imRouter.get('/routines', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  await permissionService.assertCan({ actorUserId: userId, action: 'agent_run:control', companyId })
  res.json(await agentControlApplication.listRoutines({ companyId, userId }))
}))

imRouter.post('/routines/:id/pause', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  await permissionService.assertCan({
    actorUserId: userId,
    action: 'agent_run:control',
    companyId,
    resource: { type: 'routine', id: String(req.params.id) },
  })
  const routine = await agentControlApplication.pauseRoutine({ routineId: String(req.params.id), companyId, userId })
  if (!routine) { res.status(404).json({ error: 'routine not found' }); return }
  res.json(routine)
}))

imRouter.post('/runs/stop', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { agentId, channelId } = requestInput(agentRunControlRequestSchema, req.body)
  await assertChannelPermission(userId, companyId, channelId, 'agent_run:control')
  const result = await agentControlApplication.stop({ companyId, userId, agentId, channelId })
  if (!result) { res.status(404).json({ error: 'no active run' }); return }
  res.json({ ok: true, workId: result.workId })
}))

imRouter.post('/runs/steer', safe(async (req, res) => {
  const { userId, companyId } = await identity(req)
  const { agentId, channelId, text, clientRequestId } = requestInput(agentRunSteerRequestSchema, req.body)
  await assertChannelPermission(userId, companyId, channelId, 'agent_run:control')
  const result = await agentControlApplication.steer({ companyId, userId, agentId, channelId, text, clientRequestId })
  if (!result) { res.status(404).json({ error: 'no active run' }); return }
  if (result.kind === 'conflict') { res.status(409).json({ error: 'clientRequestId was reused with different text' }); return }
  res.json({ ok: true, workId: result.workId, steerId: result.steerId })
}))
