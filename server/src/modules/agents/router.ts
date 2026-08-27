import { Router } from 'express'
import { agentsServiceRoutes } from './service.js'

export const agentsRouter = Router()
agentsRouter.use(agentsServiceRoutes)
