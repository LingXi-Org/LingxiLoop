/**
 * HTTP adapter over {@link ControlPlaneService}. Dependency-free node:http
 * with a small explicit route table; every route is authenticated with a
 * timing-safe service-token comparison.
 */
import { timingSafeEqual } from 'node:crypto'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { nullLogger, type Logger } from '../logging.js'
import type { MetricsRegistry } from '../metrics.js'
import type { AssistantMessage, RunEvent, SessionRecord, WorkCompletion } from '../protocol/types.js'
import type { EnqueueWorkInput } from './stores.js'
import { ControlPlaneError, ControlPlaneService, type LeaseProof } from './service.js'

export interface ControlPlaneServerOptions {
  service: ControlPlaneService
  serviceToken: string
  logger?: Logger
  metrics?: MetricsRegistry
  maxBodyBytes?: number
}

function readBody(req: http.IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        rejectBody(new ControlPlaneError(413, 'request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) { resolveBody({}); return }
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        rejectBody(new ControlPlaneError(400, 'request body must be JSON'))
      }
    })
    req.on('error', rejectBody)
  })
}

function json(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(body)
}

function leaseProofOf(id: string, body: Record<string, unknown>): LeaseProof {
  return {
    id,
    fence: Number(body['fence']),
    leaseToken: String(body['leaseToken'] ?? ''),
  }
}

export class ControlPlaneServer {
  private readonly server: http.Server
  private readonly logger: Logger

  constructor(private readonly options: ControlPlaneServerOptions) {
    this.logger = options.logger ?? nullLogger
    this.server = http.createServer((req, res) => {
      void this.handle(req, res).catch((error: unknown) => {
        if (error instanceof ControlPlaneError) {
          json(res, error.status, { error: error.message })
          return
        }
        this.logger.error('control-plane request failed', { url: req.url, error })
        json(res, 500, { error: 'internal error' })
      })
    })
  }

  private authorized(req: http.IncomingMessage): boolean {
    const auth = req.headers.authorization
    const provided = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : ''
    const expected = this.options.serviceToken
    const providedBuffer = Buffer.from(provided)
    const expectedBuffer = Buffer.from(expected)
    if (providedBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(providedBuffer, expectedBuffer)
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://internal')
    const path = url.pathname
    const method = req.method ?? 'GET'
    const service = this.options.service

    if (method === 'GET' && (path === '/healthz' || path === '/readyz')) {
      json(res, 200, { ok: true })
      return
    }
    if (method === 'GET' && path === '/metrics' && this.options.metrics) {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' })
      res.end(this.options.metrics.expose())
      return
    }
    if (!this.authorized(req)) {
      json(res, 401, { error: 'invalid service identity' })
      return
    }

    const maxBody = this.options.maxBodyBytes ?? 8 * 1024 * 1024
    const body = (method === 'GET' ? {} : await readBody(req, maxBody)) as Record<string, unknown>

    // Route table -----------------------------------------------------------
    if (method === 'POST' && path === '/v2/work') {
      json(res, 200, await service.enqueue(body as unknown as EnqueueWorkInput))
      return
    }
    if (method === 'POST' && path === '/v2/work/claim') {
      json(res, 200, await service.claim(String(body['workerId'] ?? '')))
      return
    }

    const workMatch = /^\/v2\/work\/([^/]+)\/([a-z]+)$/.exec(path)
    if (workMatch) {
      const id = decodeURIComponent(workMatch[1]!)
      const operation = workMatch[2]!
      if (method === 'GET' && operation === 'context') {
        const proof: LeaseProof = {
          id,
          fence: Number(url.searchParams.get('fence')),
          leaseToken: url.searchParams.get('leaseToken') ?? '',
        }
        json(res, 200, await service.loadContext(proof))
        return
      }
      if (method === 'POST') {
        const proof = leaseProofOf(id, body)
        switch (operation) {
          case 'heartbeat':
            json(res, 200, await service.heartbeat(proof)); return
          case 'yield':
            await service.yieldWork(proof); json(res, 200, { ok: true }); return
          case 'actions':
            json(res, 200, await service.executeAction(proof, body['action'] as never)); return
          case 'events':
            await service.recordEvent(proof, body['event'] as RunEvent); json(res, 200, { ok: true }); return
          case 'messages':
            await service.commitMessage(proof, body['message'] as AssistantMessage); json(res, 200, { ok: true }); return
          case 'complete':
            await service.complete(proof, {
              status: body['status'] as WorkCompletion['status'],
              ...(typeof body['resultText'] === 'string' ? { resultText: body['resultText'] } : {}),
              ...(typeof body['error'] === 'string' ? { error: body['error'] } : {}),
            })
            json(res, 200, { ok: true }); return
          case 'cancel':
            json(res, 200, { ok: await service.requestCancel(id) }); return
          case 'preempt':
            json(res, 200, { ok: await service.requestPreempt(id) }); return
          case 'steer':
            json(res, 200, { ok: await service.addSteer(id, String(body['text'] ?? '')) }); return
        }
      }
    }

    const sessionMatch = /^\/v2\/sessions\/(.+)$/.exec(path)
    if (method === 'GET' && sessionMatch) {
      json(res, 200, { session: await service.getSession(decodeURIComponent(sessionMatch[1]!)) })
      return
    }
    if (method === 'PUT' && path === '/v2/sessions') {
      const proof = leaseProofOf(String(body['workId'] ?? ''), body)
      json(res, 200, await service.saveSession(proof, body['session'] as SessionRecord))
      return
    }

    json(res, 404, { error: 'not found' })
  }

  listen(port: number, host = '0.0.0.0'): Promise<number> {
    return new Promise((resolveListen, rejectListen) => {
      this.server.once('error', rejectListen)
      this.server.listen(port, host, () => {
        resolveListen((this.server.address() as AddressInfo).port)
      })
    })
  }

  async close(): Promise<void> {
    await new Promise<void>((resolveClose) => {
      this.server.close(() => resolveClose())
      this.server.closeAllConnections?.()
    })
  }
}

export { ControlPlaneError, ControlPlaneService }
