import { Router } from 'express'
import { pollsServiceRoutes } from './service.js'

export const pollsRouter = Router()
pollsRouter.use(pollsServiceRoutes)
