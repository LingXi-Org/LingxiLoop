import { Router } from 'express'
import { HttpError } from '../../http/errors.js'
import { safe } from '../../http/async-handler.js'
import { requireAuth } from '../../http/request-context.js'
import { createEducationCompanyRequestSchema } from './contracts.js'
import { educationApplication } from './facade.js'

export const educationRouter = Router()

educationRouter.post('/education-companies', safe(async (req, res) => {
  const parsed = createEducationCompanyRequestSchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'invalid Education Company request')
  try {
    res.status(201).json(await educationApplication.createCompany(requireAuth(req), parsed.data))
  } catch (error) {
    if (error instanceof Error && /required|idempotency|duplicate|unique/i.test(error.message)) throw new HttpError(409, error.message)
    throw error
  }
}))
