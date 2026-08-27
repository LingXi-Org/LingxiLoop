import { Router } from 'express'
import { observabilityServiceRoutes } from './service.js'

export const observabilityRouter = Router()
observabilityRouter.use(observabilityServiceRoutes)
