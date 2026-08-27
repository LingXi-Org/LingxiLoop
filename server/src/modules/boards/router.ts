import { Router } from 'express'
import { boardsServiceRoutes } from './service.js'

export const boardsRouter = Router()
boardsRouter.use(boardsServiceRoutes)
