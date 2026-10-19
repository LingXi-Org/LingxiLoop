import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { HttpError } from '../http/errors.js'
import { requireConversationMember } from '../http/authorization.js'
import { requestedProjectId } from '../http/request-context.js'
import { assertVisualizePage, closeVisualizePage, createVisualizePage, getVisualizeStateSnapshot, mintVisualizeGesture,
  openVisualizeExternal, readAuthorizedVisualizeDocument, readVisualizePageState, readVisualizeResource,
  saveVisualizePageState, submitVisualizeFollowUp } from './visualize.js'

export const visualizeRouter = Router({ mergeParams: true })
function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void>) {
  return (req: Request & AuthedRequest, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    void handler(req, res).catch(error => next(error instanceof z.ZodError ? new HttpError(400, 'Invalid Visualize request.') : error))
  }
}
async function caller(req: Request & AuthedRequest, write = false) {
  const channelId = String(req.params.id)
  const access = await requireConversationMember(req, channelId, write ? 'conversation:write' : 'conversation:read')
  const projectId = requestedProjectId(req)
  if (projectId && projectId !== access.projectId) throw new HttpError(403, 'Conversation belongs to another workspace.')
  return { companyId: access.companyId, channelId, userId: access.userId }
}
async function pageCaller(req: Request & AuthedRequest, write = false) {
  const token = req.header('x-visualize-page-token')
  if (!token || token.length > 100) throw new HttpError(403, 'A Visualize page capability is required.')
  return { ...await caller(req, write), pageId: String(req.params.pageId), token }
}
visualizeRouter.get('/document', safe(async (req, res) => {
  res.json(await readAuthorizedVisualizeDocument({ ...await caller(req), path: z.string().max(4096).parse(req.query.path) }))
}))
visualizeRouter.get('/state', safe(async (req, res) => {
  res.json(await getVisualizeStateSnapshot({ ...await caller(req), path: z.string().max(4096).parse(req.query.path) }))
}))
visualizeRouter.post('/pages', safe(async (req, res) => { res.json(await createVisualizePage({ ...await caller(req), request: req.body })) }))
visualizeRouter.delete('/pages/:pageId', safe(async (req, res) => { await closeVisualizePage(await pageCaller(req)); res.json({}) }))
visualizeRouter.get('/pages/:pageId/validate', safe(async (req, res) => { await assertVisualizePage(pool, await pageCaller(req)); res.json({}) }))
visualizeRouter.get('/pages/:pageId/state', safe(async (req, res) => { res.json(await readVisualizePageState(await pageCaller(req))) }))
visualizeRouter.put('/pages/:pageId/state', safe(async (req, res) => {
  const { state } = z.object({ state: z.unknown() }).strict().parse(req.body)
  res.json(await saveVisualizePageState({ ...await pageCaller(req, true), state }))
}))
visualizeRouter.post('/pages/:pageId/gesture', safe(async (req, res) => {
  // This endpoint is reached only by the authenticated trusted host. The opaque-origin
  // guest never receives session/page capabilities and cannot call it directly.
  res.json(await mintVisualizeGesture(await pageCaller(req, true)))
}))
visualizeRouter.post('/pages/:pageId/follow-up', safe(async (req, res) => { res.json(await submitVisualizeFollowUp({ ...await pageCaller(req, true), request: req.body })) }))
visualizeRouter.post('/pages/:pageId/open-external', safe(async (req, res) => { res.json(await openVisualizeExternal({ ...await pageCaller(req, true), request: req.body })) }))
visualizeRouter.get('/pages/:pageId/resources', safe(async (req, res) => {
  const resource = await readVisualizeResource({ ...await pageCaller(req), name: z.string().min(1).max(250).parse(req.query.name) })
  res.type(resource.mime).send(resource.bytes)
}))
