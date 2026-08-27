import { Router } from 'express'
import { knowledgeServiceRoutes } from './service.js'

export const knowledgeRouter = Router()
knowledgeRouter.use(knowledgeServiceRoutes)
