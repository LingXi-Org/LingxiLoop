
import { Router } from 'express'
import {
  addCanvasComment,
  appendCanvasFrameContent,
  assignCanvasWorkspaceWork,
  createCanvasFrame,
  deleteCanvasFrame,
  ensureConversationCanvas,
  getCanvasSnapshot,
  getConversationCanvas,
  listCanvasWorkspaces,
  setCanvasStatus,
  steerCanvasAssignment,
  stopCanvasAssignment,
  stopCanvasWorkspace,
  updateCanvasFrame,
} from './application.js'
import { safe } from '../../http/async-handler.js'
import { requireCanvasFrameWorkspace, requireCanvasWorkspace, requireGroupConversation } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertProjectWritable } from '../../http/request-context.js'
import {
  canvasAppendRequestSchema,
  canvasAssignmentRequestSchema,
  canvasCommentRequestSchema,
  canvasConversationQuerySchema,
  canvasFrameCreateRequestSchema,
  canvasFrameUpdateRequestSchema,
  canvasStatusRequestSchema,
  canvasSteerRequestSchema,
} from './contracts.js'

export const canvasRouter = Router()
const api = canvasRouter

/* ============== Shared Canvas (shared state, isolated execution) ======= */

api.get('/conversations/:id/canvas', safe(async (req, res) => {
  const membership = await requireGroupConversation(req, String(req.params.id))
  res.json(await getConversationCanvas(membership.companyId, String(req.params.id), membership.userId))
}))

api.post('/conversations/:id/canvas', safe(async (req, res) => {
  const membership = await requireGroupConversation(req, String(req.params.id))
  await assertProjectWritable(membership.projectId)
  res.status(201).json(await ensureConversationCanvas(membership.companyId, String(req.params.id), membership.userId))
}))

api.get('/canvas', safe(async (req, res) => {
  const { conversationId } = canvasConversationQuerySchema.parse(req.query)
  const membership = await requireGroupConversation(req, conversationId)
  const canvas = await getConversationCanvas(membership.companyId, conversationId, membership.userId)
  if (!canvas) throw new HttpError(404, 'canvas not found')
  res.json(canvas)
}))

api.get('/canvases', safe(async (req, res) => {
  const { conversationId } = canvasConversationQuerySchema.parse(req.query)
  const membership = await requireGroupConversation(req, conversationId)
  res.json(await listCanvasWorkspaces(membership.companyId, conversationId))
}))

api.get('/canvases/:id', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasWorkspace(req, String(req.params.id))
  res.json(await getCanvasSnapshot(companyId, userId, String(req.params.id)))
}))

api.post('/canvases/:id/assignments', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasWorkspace(req, String(req.params.id), true)
  const input = canvasAssignmentRequestSchema.parse(req.body)
  res.status(201).json(await assignCanvasWorkspaceWork({
    companyId,
    canvasId: String(req.params.id),
    actorId: userId,
    agentId: input.agentId,
    assignment: input.assignment,
  }))
}))

api.post('/canvases/:id/assignments/:agentId/steer', safe(async (req, res) => {
  const { companyId } = await requireCanvasWorkspace(req, String(req.params.id), true)
  const input = canvasSteerRequestSchema.parse(req.body)
  await steerCanvasAssignment({ companyId, canvasId: String(req.params.id), agentId: String(req.params.agentId), text: input.text })
  res.json({ ok: true })
}))

api.post('/canvases/:id/assignments/:agentId/stop', safe(async (req, res) => {
  const { companyId } = await requireCanvasWorkspace(req, String(req.params.id), true)
  await stopCanvasAssignment({ companyId, canvasId: String(req.params.id), agentId: String(req.params.agentId) })
  res.json({ ok: true })
}))

api.post('/canvases/:id/stop', safe(async (req, res) => {
  const { companyId } = await requireCanvasWorkspace(req, String(req.params.id), true)
  await stopCanvasWorkspace({ companyId, canvasId: String(req.params.id) })
  res.json({ ok: true })
}))

api.post('/canvas/frames', safe(async (req, res) => {
  const input = canvasFrameCreateRequestSchema.parse(req.body)
  const { userId, companyId, projectId } = await requireCanvasWorkspace(req, input.canvasId, true)
  res.status(201).json(await createCanvasFrame({
    companyId, projectId: projectId ?? undefined, actorId: userId, actorKind: 'user', canvasId: input.canvasId, frame: input,
  }))
}))

api.patch('/canvas/frames/:id', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasFrameWorkspace(req, String(req.params.id), true)
  const patch = canvasFrameUpdateRequestSchema.parse(req.body)
  try {
    res.json(await updateCanvasFrame({
      companyId, actorId: userId, actorKind: 'user', frameId: String(req.params.id), patch,
    }))
  } catch (error) {
    const conflict = error as Error & { status?: number; latestFrame?: unknown }
    if (conflict.status === 409) { res.status(409).json({ error: conflict.message, latestFrame: conflict.latestFrame }); return }
    throw error
  }
}))

api.post('/canvas/frames/:id/append', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasFrameWorkspace(req, String(req.params.id), true)
  const input = canvasAppendRequestSchema.parse(req.body)
  res.json(await appendCanvasFrameContent({
    companyId, actorId: userId, actorKind: 'user', frameId: String(req.params.id),
    content: input.content,
  }))
}))

api.delete('/canvas/frames/:id', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasFrameWorkspace(req, String(req.params.id), true)
  res.json(await deleteCanvasFrame({
    companyId, actorId: userId, actorKind: 'user', frameId: String(req.params.id),
  }))
}))

api.post('/canvas/status', safe(async (req, res) => {
  const input = canvasStatusRequestSchema.parse(req.body)
  const { userId, companyId, projectId } = await requireCanvasWorkspace(req, input.canvasId, true)
  res.json(await setCanvasStatus({
    companyId, projectId: projectId ?? undefined, actorId: userId, actorKind: 'user', canvasId: input.canvasId,
    status: input.status,
    frameId: input.frameId ?? null,
    cursorX: input.cursorX ?? null,
    cursorY: input.cursorY ?? null,
  }))
}))

api.post('/canvas/comments', safe(async (req, res) => {
  const input = canvasCommentRequestSchema.parse(req.body)
  const { userId, companyId, projectId } = await requireCanvasWorkspace(req, input.canvasId, true)
  res.status(201).json(await addCanvasComment({
    companyId, projectId: projectId ?? undefined, actorId: userId, actorKind: 'user', canvasId: input.canvasId,
    frameId: input.frameId ?? null,
    body: input.body,
  }))
}))
