import { Router } from 'express'
import { messagesServiceRoutes } from './service.js'

export const messagesRouter = Router()
messagesRouter.use(messagesServiceRoutes)
