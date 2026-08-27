import { Router } from 'express'
import { conversationsServiceRoutes } from './service.js'

export const conversationsRouter = Router()
conversationsRouter.use(conversationsServiceRoutes)
