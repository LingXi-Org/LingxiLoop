import { Router } from 'express'
import { learningDomainRoutes } from '../../learning/router.js'
import { learningServiceRoutes } from './service.js'

export const learningRouter = Router()
learningRouter.use(learningServiceRoutes)
learningRouter.use(learningDomainRoutes)
