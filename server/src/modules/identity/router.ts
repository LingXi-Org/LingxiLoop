import { Router } from 'express'
import { identityServiceRoutes } from './service.js'

export const identityRouter = Router()
identityRouter.use(identityServiceRoutes)
