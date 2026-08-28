import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompanyArtifactContext } from '../../http/request-context.js'
import { DocumentApplicationError } from './application.js'
import { createDocumentRequestSchema, renameDocumentRequestSchema } from './contracts.js'
import { documentsApplication } from './facade.js'

export const documentsRouter = Router()

function mapDocumentError(error: unknown): never {
  if (error instanceof DocumentApplicationError) {
    const status = error.code === 'delete_forbidden' ? 403 : 404
    throw new HttpError(status, error.message)
  }
  throw error
}

documentsRouter.get('/documents', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req)
  res.json({ documents: await documentsApplication.list(scope) })
}))

documentsRouter.post('/documents', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const parsed = createDocumentRequestSchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'invalid document')
  try {
    res.status(201).json(await documentsApplication.create(scope, parsed.data))
  } catch (error) {
    mapDocumentError(error)
  }
}))

documentsRouter.get('/documents/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req)
  try {
    res.json(await documentsApplication.get(scope, String(req.params.id)))
  } catch (error) {
    mapDocumentError(error)
  }
}))

documentsRouter.put('/documents/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  const parsed = renameDocumentRequestSchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'invalid title')
  try {
    res.json(await documentsApplication.rename(scope, String(req.params.id), parsed.data.title))
  } catch (error) {
    mapDocumentError(error)
  }
}))

documentsRouter.delete('/documents/:id', safe(async (req, res) => {
  const scope = await requireCompanyArtifactContext(req, true)
  try {
    res.json(await documentsApplication.delete(scope, String(req.params.id)))
  } catch (error) {
    mapDocumentError(error)
  }
}))
