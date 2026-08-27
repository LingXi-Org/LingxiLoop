import { Router } from 'express'
import { pushServiceRoutes } from './service.js'

export const pushRouter = Router()
pushRouter.use(pushServiceRoutes)
