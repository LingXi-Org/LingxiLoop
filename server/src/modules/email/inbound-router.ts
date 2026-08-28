import { createHmac, timingSafeEqual } from 'node:crypto'
import express, { Router, type NextFunction, type Request, type Response } from 'express'
import { inboundEmailPayloadSchema } from './contracts.js'
import {
  InboundEmailApplicationError,
  type InboundEmailApplication,
} from './inbound-application.js'

type RequestWithRawBody = Request & { rawBody?: Buffer }

export interface InboundEmailRouterDependencies {
  application: Pick<InboundEmailApplication, 'deliver'>
  secret: string
  metric(name: 'email.inbound.bad_signature'): void
}

export function verifyInboundEmailSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!secret) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = signature.trim().toLowerCase().replace(/^sha256=/, '')
  if (!/^[a-f0-9]{64}$/.test(received)) return false
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}

export function createInboundEmailHttpRouter(dependencies: InboundEmailRouterDependencies): Router {
  const router = Router()
  router.use(express.json({
    limit: '26mb',
    verify: (request, _response, body) => {
      (request as RequestWithRawBody).rawBody = Buffer.from(body)
    },
  }))
  router.post('/inbound', async (request, response) => {
    await handleInboundEmail(request as RequestWithRawBody, response, dependencies)
  })
  router.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (isBodyParserError(error)) {
      response.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: 'invalid inbound JSON body' })
      return
    }
    next(error)
  })
  return router
}

async function handleInboundEmail(
  request: RequestWithRawBody,
  response: Response,
  dependencies: InboundEmailRouterDependencies,
): Promise<void> {
  const signature = String(request.headers['x-lingxiloop-signature'] ?? '')
  if (!request.rawBody || !signature) {
    response.status(400).json({ error: 'missing signature or body' })
    return
  }
  if (!dependencies.secret) {
    response.status(503).json({ error: 'inbound email unavailable' })
    return
  }
  if (!verifyInboundEmailSignature(request.rawBody, signature, dependencies.secret)) {
    dependencies.metric('email.inbound.bad_signature')
    response.status(401).json({ error: 'bad signature' })
    return
  }

  const parsed = inboundEmailPayloadSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid inbound payload' })
    return
  }

  try {
    const result = await dependencies.application.deliver(parsed.data)
    if (result.kind === 'no_recipient') {
      response.status(404).json({ error: 'no recipient resolved to a known participant' })
      return
    }
    if (result.kind === 'deduplicated') {
      response.json({
        ok: true,
        deduplicated: true,
        messageId: result.messageId,
        companyIds: result.companyIds,
      })
      return
    }
    response.json({
      ok: true,
      deliveries: result.deliveries,
      deduplicatedCompanyIds: result.deduplicatedCompanyIds,
    })
  } catch (error) {
    if (error instanceof InboundEmailApplicationError) {
      response.status(error.code === 'invalid' ? 400 : 503).json({ error: error.message })
      return
    }
    console.error(JSON.stringify({
      evt: 'email.inbound.failed',
      error: error instanceof Error ? error.message : String(error),
    }))
    response.status(503).json({ error: 'inbound email temporarily unavailable' })
  }
}

function isBodyParserError(error: unknown): error is { type: string } {
  return Boolean(error && typeof error === 'object' && 'type' in error
    && typeof (error as { type?: unknown }).type === 'string')
}
