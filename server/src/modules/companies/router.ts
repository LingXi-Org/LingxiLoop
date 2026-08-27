import { Router } from 'express'
import { companiesServiceRoutes } from './service.js'

export const companiesRouter = Router()
companiesRouter.use(companiesServiceRoutes)
