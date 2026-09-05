import { Router } from 'express'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth, requestedCompanyId } from '../../http/request-context.js'
import { PresentationApplicationError } from './application.js'
import {
  approvePresentationOutlineRequestSchema,
  retryPresentationRequestSchema,
} from './contracts.js'
import { presentationsApplication } from './facade.js'

export const presentationsRouter = Router()

function mapPresentationError(error: unknown): never {
  if (error instanceof PresentationApplicationError) {
    const status = error.code === 'not_found' ? 404
      : error.code === 'feature_disabled' ? 503
        : error.code === 'conflict' ? 409
          : 409
    throw new HttpError(status, error.message)
  }
  throw error
}

function scope(req: Parameters<typeof requireAuth>[0]): { companyId: string; authorizationUserId: string } {
  return { companyId: requestedCompanyId(req), authorizationUserId: requireAuth(req) }
}

function safeFilename(value: string): string {
  const normalized = value.replace(/[\r\n"\\/]/g, '_').trim().slice(0, 120) || 'presentation'
  return normalized.endsWith('.html') ? normalized : `${normalized}.html`
}

function contentSecurityPolicy(html: string): string {
  const match = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html)
  if (!match?.[1]) throw new Error('presentation artifact has no trusted Content-Security-Policy')
  return match[1]
}

presentationsRouter.get('/presentations/:id', safe(async (req, res) => {
  const context = scope(req)
  try {
    res.json(await presentationsApplication.get(context.companyId, context.authorizationUserId, String(req.params.id)))
  } catch (error) { mapPresentationError(error) }
}))

presentationsRouter.post('/presentations/:id/outline/approve', safe(async (req, res) => {
  const context = scope(req)
  const input = approvePresentationOutlineRequestSchema.parse(req.body ?? {})
  try {
    res.json(await presentationsApplication.approveOutline(
      context.companyId, context.authorizationUserId, String(req.params.id), input,
    ))
  } catch (error) { mapPresentationError(error) }
}))

presentationsRouter.post('/presentations/:id/cancel', safe(async (req, res) => {
  const context = scope(req)
  try {
    res.json(await presentationsApplication.cancel(context.companyId, context.authorizationUserId, String(req.params.id)))
  } catch (error) { mapPresentationError(error) }
}))

presentationsRouter.post('/presentations/:id/retry', safe(async (req, res) => {
  const context = scope(req)
  try {
    const presentationId = String(req.params.id)
    const raw = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? { ...req.body as Record<string, unknown> }
      : {}
    if (typeof raw.idempotencyKey !== 'string' || !raw.idempotencyKey.trim()) {
      const current = await presentationsApplication.get(context.companyId, context.authorizationUserId, presentationId)
      if (current.status !== 'failed' && current.status !== 'needsAttention') {
        res.json(current)
        return
      }
      raw.idempotencyKey = `browser-retry:${presentationId}:${current.updatedAt}`
    }
    const input = retryPresentationRequestSchema.parse(raw)
    res.json(await presentationsApplication.retry(
      context.companyId, context.authorizationUserId, presentationId, input,
    ))
  } catch (error) { mapPresentationError(error) }
}))

presentationsRouter.get('/presentations/:id/versions', safe(async (req, res) => {
  const context = scope(req)
  try {
    res.json(await presentationsApplication.listVersions(
      context.companyId, context.authorizationUserId, String(req.params.id),
    ))
  } catch (error) { mapPresentationError(error) }
}))

async function serveVersion(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<Parameters<typeof safe>[0]>[1],
  download: boolean,
): Promise<void> {
  const context = scope(req)
  try {
    const artifact = await presentationsApplication.readVersion(
      context.companyId,
      context.authorizationUserId,
      String(req.params.id),
      String(req.params.versionId),
    )
    const html = artifact.bytes.toString('utf8')
    res.setHeader('Content-Security-Policy', contentSecurityPolicy(html))
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    if (download) {
      const filename = safeFilename(artifact.title)
      res.setHeader('Content-Disposition', `attachment; filename="presentation.html"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    } else {
      res.setHeader('Content-Disposition', 'inline')
    }
    res.send(artifact.bytes)
  } catch (error) { mapPresentationError(error) }
}

presentationsRouter.get('/presentations/:id/versions/:versionId/content', safe(async (req, res) => {
  await serveVersion(req, res, false)
}))

presentationsRouter.get('/presentations/:id/versions/:versionId/download', safe(async (req, res) => {
  await serveVersion(req, res, true)
}))
