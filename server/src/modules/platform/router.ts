import { Router } from 'express'
import { platformServiceRoutes } from './service.js'

export const platformRouter = Router()
platformRouter.use(platformServiceRoutes)
