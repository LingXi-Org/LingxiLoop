import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../auth.js'
import { HttpError } from '../http/errors.js'
import { requireConversationMember } from '../http/authorization.js'
import { requestedProjectId } from '../http/request-context.js'
import { exportRetiredVisualize } from './retired-visualize.js'

/** Read-only compatibility surface; no guest, page capability or write route remains. */
export const visualizeRouter = Router({ mergeParams: true })
function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void>) {
  return (req: Request & AuthedRequest, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    void handler(req, res).catch(error => next(error instanceof z.ZodError ? new HttpError(400, 'Invalid archive request.') : error))
  }
}
async function caller(req: Request & AuthedRequest) {
  const channelId = String(req.params.id)
  const access = await requireConversationMember(req, channelId, 'conversation:read')
  const projectId = requestedProjectId(req)
  if (projectId && projectId !== access.projectId) throw new HttpError(403, 'Conversation belongs to another workspace.')
  return { companyId: access.companyId, channelId, userId: access.userId }
}
visualizeRouter.get('/archive', safe(async (req, res) => {
  const query = z.object({ path: z.string().min(1).max(4096), sourceMessageId: z.string().min(1).max(300) }).strict().parse(req.query)
  const archive = await exportRetiredVisualize({ ...await caller(req), ...query })
  res.setHeader('Content-Disposition', 'attachment; filename="visualize-archive.json"')
  res.type('application/json').send(JSON.stringify(archive))
}))
visualizeRouter.use(safe(async (req) => {
  await caller(req)
  throw new HttpError(410, 'Visualize has been retired. Historical content can be exported as an inert archive; editing and interaction use Design.')
}))
