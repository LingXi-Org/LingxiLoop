import { Router } from 'express'
import { canvasServiceRoutes } from './service.js'

export const canvasRouter = Router()
canvasRouter.use(canvasServiceRoutes)
