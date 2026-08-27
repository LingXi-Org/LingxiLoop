import { Router } from 'express'
import { documentsServiceRoutes } from './service.js'

export const documentsRouter = Router()
documentsRouter.use(documentsServiceRoutes)
