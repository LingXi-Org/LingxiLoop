import { Router } from 'express'
import { calendarServiceRoutes } from './service.js'

export const calendarRouter = Router()
calendarRouter.use(calendarServiceRoutes)
