import { Router } from 'express'
import { authMiddleware } from '../auth.js'
import { errorHandler } from '../http/errors.js'
import { imRouter } from '../im/router.js'
import { agentsRouter } from '../modules/agents/router.js'
import { calendarRouter } from '../modules/calendar/router.js'
import { canvasRouter } from '../modules/canvas/router.js'
import { companiesRouter } from '../modules/companies/router.js'
import { educationRouter } from '../modules/education/router.js'
import { enterpriseRouter } from '../modules/enterprise/router.js'
import { conversationsRouter } from '../modules/conversations/router.js'
import { contextThreadsRouter } from '../modules/context-threads/router.js'
import { documentsRouter } from '../modules/documents/router.js'
import { emailRouter } from '../modules/email/router.js'
import { identityRouter } from '../modules/identity/router.js'
import { knowledgeRouter } from '../modules/knowledge/router.js'
import { learningRouter } from '../modules/learning/router.js'
import { messagesRouter } from '../modules/messages/router.js'
import { notificationsRouter } from '../modules/notifications/router.js'
import { observabilityRouter } from '../modules/observability/router.js'
import { platformRouter } from '../modules/platform/router.js'
import { pollsRouter } from '../modules/polls/router.js'
import { projectsRouter } from '../modules/projects/router.js'
import { projectTransfersRouter } from '../modules/transfers/router.js'
import { trustRouter } from '../modules/trust/router.js'

export const api = Router()

api.use(authMiddleware as never)
api.use(platformRouter)
api.use(identityRouter)
api.use('/im', imRouter)
api.use(companiesRouter)
api.use(educationRouter)
api.use(enterpriseRouter)
api.use(projectsRouter)
api.use(projectTransfersRouter)
api.use(trustRouter)
api.use(canvasRouter)
api.use(learningRouter)
api.use(knowledgeRouter)
api.use(agentsRouter)
api.use(conversationsRouter)
api.use(contextThreadsRouter)
api.use(messagesRouter)
api.use(notificationsRouter)
api.use(pollsRouter)
api.use(emailRouter)
api.use(observabilityRouter)
api.use(calendarRouter)
api.use(documentsRouter)
api.use(errorHandler)
