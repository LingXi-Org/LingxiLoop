import express, { Router, type NextFunction, type Request, type Response } from 'express'
import {
  type ResendInboundApplication,
  ResendInboundApplicationError,
} from './resend-inbound-application.js'

type RequestWithRawBody = Request & { rawBody?: Buffer }

export function createResendInboundRouter(application: ResendInboundApplication): Router {
  const router = Router()
  router.use(express.json({
    limit: '1mb',
    verify: (request, _response, body) => {
      (request as RequestWithRawBody).rawBody = Buffer.from(body)
    },
  }))
  router.post('/resend', async (request, response) => {
    await handle(request as RequestWithRawBody, response, application)
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (isBodyParserError(error)) {
      response.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'invalid Resend webhook JSON' })
      return
    }
    next(error)
  })
  return router
}

async function handle(
  request: RequestWithRawBody,
  response: Response,
  application: ResendInboundApplication,
): Promise<void> {
  const headers = {
    id: String(request.headers['svix-id'] ?? ''),
    timestamp: String(request.headers['svix-timestamp'] ?? ''),
    signature: String(request.headers['svix-signature'] ?? ''),
  }
  if (!request.rawBody || !headers.id || !headers.timestamp || !headers.signature) {
    response.status(400).json({ error: 'missing Resend webhook signature headers or body' })
    return
  }
  try {
    const result = await application.handle(request.rawBody, headers)
    response.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof ResendInboundApplicationError) {
      const status = error.code === 'invalid_signature' || error.code === 'invalid_event' ? 400 : 503
      response.status(status).json({ error: error.message })
      return
    }
    throw error
  }
}

function isBodyParserError(error: unknown): error is { type: string } {
  return Boolean(error && typeof error === 'object' && 'type' in error
    && typeof (error as { type?: unknown }).type === 'string')
}
