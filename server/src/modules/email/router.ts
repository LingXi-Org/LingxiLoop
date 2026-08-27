import { Router } from 'express'
import { emailServiceRoutes } from './service.js'

export const emailRouter = Router()
emailRouter.use(emailServiceRoutes)
