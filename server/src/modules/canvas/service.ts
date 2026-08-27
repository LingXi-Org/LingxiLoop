
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
} from '../../canvas/service.js'
import { safe } from '../../http/async-handler.js'
import { requireCanvasFrameWorkspace, requireCanvasWorkspace, requireGroupConversation } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertProjectWritable } from '../../http/request-context.js'

export const canvasServiceRoutes = Router()
const api = canvasServiceRoutes

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
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : ''
  if (!conversationId) throw new HttpError(400, 'conversationId is required')
  const membership = await requireGroupConversation(req, conversationId)
  const canvas = await getConversationCanvas(membership.companyId, conversationId, membership.userId)
  if (!canvas) throw new HttpError(404, 'canvas not found')
  res.json(canvas)
}))

api.get('/canvases', safe(async (req, res) => {
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId : ''
  if (!conversationId) throw new HttpError(400, 'conversationId is required')
  const membership = await requireGroupConversation(req, conversationId)
  res.json(await listCanvasWorkspaces(membership.companyId, conversationId))
}))

api.get('/canvases/:id', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasWorkspace(req, String(req.params.id))
  res.json(await getCanvasSnapshot(companyId, userId, String(req.params.id)))
}))

api.post('/canvases/:id/assignments', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasWorkspace(req, String(req.params.id), true)
  res.status(201).json(await assignCanvasWorkspaceWork({
    companyId,
    canvasId: String(req.params.id),
    actorId: userId,
    agentId: String(req.body?.agentId ?? ''),
    assignment: String(req.body?.assignment ?? ''),
  }))
}))

api.post('/canvases/:id/assignments/:agentId/steer', safe(async (req, res) => {
  const { companyId } = await requireCanvasWorkspace(req, String(req.params.id), true)
  await steerCanvasAssignment({ companyId, canvasId: String(req.params.id), agentId: String(req.params.agentId), text: String(req.body?.text ?? '') })
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
  const requestedCanvasId = typeof req.body?.canvasId === 'string' ? req.body.canvasId : undefined
  if (!requestedCanvasId) throw new HttpError(400, 'canvasId is required')
  const { userId, companyId, projectId } = await requireCanvasWorkspace(req, requestedCanvasId, true)
  res.status(201).json(await createCanvasFrame({
    companyId, projectId: projectId ?? undefined, actorId: userId, actorKind: 'user', canvasId: requestedCanvasId, frame: req.body ?? {},
  }))
}))

api.patch('/canvas/frames/:id', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasFrameWorkspace(req, String(req.params.id), true)
  try {
    res.json(await updateCanvasFrame({
      companyId, actorId: userId, actorKind: 'user', frameId: String(req.params.id), patch: req.body ?? {},
    }))
  } catch (error) {
    const conflict = error as Error & { status?: number; latestFrame?: unknown }
    if (conflict.status === 409) { res.status(409).json({ error: conflict.message, latestFrame: conflict.latestFrame }); return }
    throw error
  }
}))

api.post('/canvas/frames/:id/append', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasFrameWorkspace(req, String(req.params.id), true)
  res.json(await appendCanvasFrameContent({
    companyId, actorId: userId, actorKind: 'user', frameId: String(req.params.id),
    content: String(req.body?.content ?? ''),
  }))
}))

api.delete('/canvas/frames/:id', safe(async (req, res) => {
  const { userId, companyId } = await requireCanvasFrameWorkspace(req, String(req.params.id), true)
  res.json(await deleteCanvasFrame({
    companyId, actorId: userId, actorKind: 'user', frameId: String(req.params.id),
  }))
}))

api.post('/canvas/status', safe(async (req, res) => {
  const requestedCanvasId = typeof req.body?.canvasId === 'string' ? req.body.canvasId : undefined
  if (!requestedCanvasId) throw new HttpError(400, 'canvasId is required')
  const { userId, companyId, projectId } = await requireCanvasWorkspace(req, requestedCanvasId, true)
  res.json(await setCanvasStatus({
    companyId, projectId: projectId ?? undefined, actorId: userId, actorKind: 'user', canvasId: requestedCanvasId,
    status: String(req.body?.status ?? ''),
    frameId: typeof req.body?.frameId === 'string' ? req.body.frameId : null,
    cursorX: typeof req.body?.cursorX === 'number' ? req.body.cursorX : null,
    cursorY: typeof req.body?.cursorY === 'number' ? req.body.cursorY : null,
  }))
}))

api.post('/canvas/comments', safe(async (req, res) => {
  const requestedCanvasId = typeof req.body?.canvasId === 'string' ? req.body.canvasId : undefined
  if (!requestedCanvasId) throw new HttpError(400, 'canvasId is required')
  const { userId, companyId, projectId } = await requireCanvasWorkspace(req, requestedCanvasId, true)
  res.status(201).json(await addCanvasComment({
    companyId, projectId: projectId ?? undefined, actorId: userId, actorKind: 'user', canvasId: requestedCanvasId,
    frameId: typeof req.body?.frameId === 'string' ? req.body.frameId : null,
    body: String(req.body?.body ?? ''),
  }))
}))
