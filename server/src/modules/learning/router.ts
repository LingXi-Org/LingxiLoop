import { Router } from 'express'
import { learningServiceRoutes } from './service.js'

export const learningRouter = Router()
learningRouter.use(learningServiceRoutes)
