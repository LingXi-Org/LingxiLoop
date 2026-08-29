import express, { type NextFunction, type Request, type Response, Router } from 'express'
import { parseWukongWebhook } from './webhook-contracts.js'
import { wukongWebhookApplication } from './webhook-facade.js'

export const wukongWebhookRouter = Router()

type RawRequest = Request & { rawBody?: Buffer }

wukongWebhookRouter.use(express.json({
  limit: '2mb',
  verify(req, _res, buffer) { (req as RawRequest).rawBody = Buffer.from(buffer) },
}))

function safe(handler: (req: RawRequest, res: Response) => Promise<void>) {
  return (req: RawRequest, res: Response, next: NextFunction) => { void handler(req, res).catch(next) }
}

wukongWebhookRouter.post('/', safe(async (req, res) => {
  const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}))
  const signature = typeof req.headers['x-wukong-signature'] === 'string'
    ? req.headers['x-wukong-signature'] : undefined
  if (!wukongWebhookApplication.verify(raw, signature)) {
    res.status(401).json({ error: 'invalid webhook signature' })
    return
  }
  const parsed = parseWukongWebhook(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid WuKong webhook' })
    return
  }
  res.json(await wukongWebhookApplication.process({ raw, ...parsed.data }))
}))
