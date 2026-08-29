import { timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { env } from '../../env.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany } from '../../http/request-context.js'
import { permissionService } from '../access/public.js'
import { OgError } from '../../og.js'
import { PlatformApplicationError } from './application.js'
import { presignUploadRequestSchema, refreshUploadUrlRequestSchema } from './contracts.js'
import { platformApplication } from './facade.js'

export const platformRouter = Router()

platformRouter.get('/uploads/capabilities', (_req, res) => {
  res.json(platformApplication.uploadCapabilities())
})

platformRouter.post('/uploads/presign', safe(async (req, res) => {
  const { companyId, userId } = await requireCompany(req)
  await permissionService.assertCan({ actorUserId: userId, action: 'attachment:write', companyId })
  const parsed = presignUploadRequestSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    const tooLarge = parsed.error.issues.some((issue) => issue.path[0] === 'size' && issue.code === 'too_big')
    throw new HttpError(tooLarge ? 413 : 400, parsed.error.issues[0]?.message ?? 'invalid upload')
  }
  try {
    res.json(await platformApplication.presignUpload(companyId, parsed.data))
  } catch (error) {
    if (error instanceof PlatformApplicationError && error.code === 'mime_not_allowed') {
      throw new HttpError(415, error.message)
    }
    throw error
  }
}))

platformRouter.post('/uploads/refresh-url', safe(async (req, res) => {
  const { companyId, userId } = await requireCompany(req)
  await permissionService.assertCan({ actorUserId: userId, action: 'attachment:write', companyId })
  const parsed = refreshUploadUrlRequestSchema.safeParse(req.body ?? {})
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'invalid storage key')
  try {
    res.json(await platformApplication.refreshUploadUrl(parsed.data.key))
  } catch (error) {
    if (error instanceof PlatformApplicationError) throw new HttpError(400, error.message)
    throw error
  }
}))

platformRouter.get('/livez', (_req, res) => { res.json({ ok: true, ts: Date.now() }) })

platformRouter.get('/meta', (_req, res) => {
  res.json({
    product: 'LingxiLoop',
    version: env.APP_VERSION,
    commitSha: env.COMMIT_SHA,
    reasoningRuntime: 'agent-os',
  })
})

platformRouter.get('/health', async (_req, res) => {
  try {
    await platformApplication.assertReady()
    res.json({ ok: true, ts: Date.now() })
  } catch (error) {
    res.status(503).json({ ok: false, error: String(error) })
  }
})

platformRouter.get('/health/dependencies', async (_req, res) => {
  const dependencies = await platformApplication.dependencyReadiness()
  const ok = Object.values(dependencies).every(Boolean)
  res.status(ok ? 200 : 503).json({ ok, dependencies, ts: Date.now() })
})

platformRouter.get('/og', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : ''
  if (!url) { res.status(400).json({ error: 'url required' }); return }
  try {
    const og = await platformApplication.openGraph(url)
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(og ?? { url, empty: true })
  } catch (error) {
    if (error instanceof OgError) { res.status(error.status).json({ error: error.message }); return }
    res.status(500).json({ error: 'og fetch failed' })
  }
})

platformRouter.get('/metrics', async (req, res) => {
  const expected = process.env.METRICS_BEARER_TOKEN ?? ''
  if (!expected) { res.status(404).send('not found'); return }
  const fromQuery = typeof req.query.token === 'string' ? req.query.token : ''
  const authorization = req.headers.authorization
  const fromHeader = typeof authorization === 'string' && authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : ''
  const left = Buffer.from(expected)
  const right = Buffer.from(fromQuery || fromHeader)
  let authorized = left.length === right.length
  if (authorized) {
    try { authorized = timingSafeEqual(left, right) } catch { authorized = false }
  }
  if (!authorized) { res.status(401).send('bad token'); return }
  const { renderProm } = await import('../../metrics.js')
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  res.send(renderProm())
})
