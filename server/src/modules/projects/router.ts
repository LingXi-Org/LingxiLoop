import { Router } from 'express'
import type { ProjectLifecycleCommand } from '../../domain/public.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requestedCompanyId, requireAuth } from '../../http/request-context.js'
import { ProjectLifecycleError } from './application.js'
import { projectLifecycleApplication } from './facade.js'

export const projectsRouter = Router()

function execute(command: ProjectLifecycleCommand) {
  return safe(async (req, res) => {
    try {
      res.json(await projectLifecycleApplication.execute({
        actorUserId: requireAuth(req),
        companyId: requestedCompanyId(req),
        projectId: String(req.params.id),
        command,
      }))
    } catch (error) {
      if (!(error instanceof ProjectLifecycleError)) throw error
      throw new HttpError(409, error.message)
    }
  })
}

projectsRouter.post('/projects/:id/activate', execute('ACTIVATE'))
projectsRouter.post('/projects/:id/end', execute('END'))
projectsRouter.post('/projects/:id/enter-read-only', execute('ENTER_READ_ONLY'))
projectsRouter.post('/projects/:id/request-transfer', execute('REQUEST_TRANSFER'))
projectsRouter.post('/projects/:id/cancel-transfer', execute('CANCEL_TRANSFER'))
projectsRouter.post('/projects/:id/enter-retention', execute('ENTER_RETENTION'))
projectsRouter.post('/projects/:id/archive', execute('ARCHIVE'))
projectsRouter.delete('/projects/:id', execute('DELETE'))
