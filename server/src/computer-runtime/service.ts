import '../logging.js'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { DockerProvider, type ExecOptions } from './docker-provider.js'

const port = Number(process.env.COMPUTER_RUNTIME_PORT ?? 5195)
const serviceToken = process.env.COMPUTER_RUNTIME_SERVICE_TOKEN?.trim() ?? ''
if (!serviceToken) throw new Error('missing required environment variable: COMPUTER_RUNTIME_SERVICE_TOKEN')
const runtime = new DockerProvider()

function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? ''
  const provided = header.startsWith('Bearer ') ? header.slice(7) : ''
  return provided.length === serviceToken.length && timingSafeEqual(Buffer.from(provided), Buffer.from(serviceToken))
}

async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += value.byteLength
    if (bytes > 4 * 1024 * 1024) throw Object.assign(new Error('request body exceeds 4 MiB'), { status: 413 })
    chunks.push(value)
  }
  if (chunks.length === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON object body required')
  return parsed as Record<string, unknown>
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  return value
}

function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

async function execute(operation: string, body: Record<string, unknown>): Promise<unknown> {
  if (operation === 'health') { await runtime.health(); return { ok: true } }
  if (operation === 'create') return runtime.create({ businessId: text(body.businessId, 'businessId'), imageVersion: text(body.imageVersion, 'imageVersion') })
  const runtimeRef = text(body.runtimeRef, 'runtimeRef')
  if (operation === 'start') { await runtime.start(runtimeRef); return { ok: true } }
  if (operation === 'stop') { await runtime.stop(runtimeRef); return { ok: true } }
  if (operation === 'destroy') { await runtime.destroy(runtimeRef); return { ok: true } }
  if (operation === 'exec') {
    if (!Array.isArray(body.command) || body.command.some((item) => typeof item !== 'string')) throw new Error('command must be a string array')
    const options = body.options && typeof body.options === 'object' && !Array.isArray(body.options) ? body.options as ExecOptions : {}
    return runtime.exec(runtimeRef, body.command as string[], options)
  }
  if (operation === 'read-file') {
    const data = await runtime.readFile(runtimeRef, text(body.path, 'path'))
    return { data: Buffer.from(data).toString('base64') }
  }
  if (operation === 'write-file') {
    const encoded = text(body.data, 'data')
    const data = Buffer.from(encoded, 'base64')
    if (data.byteLength > 2 * 1024 * 1024) throw Object.assign(new Error('file exceeds 2 MiB'), { status: 413 })
    await runtime.writeFile(runtimeRef, text(body.path, 'path'), data)
    return { ok: true }
  }
  if (operation === 'expose-service') return runtime.exposeService(runtimeRef, Number(body.port))
  throw Object.assign(new Error('unknown Computer Runtime operation'), { status: 404 })
}

const server = http.createServer((req, res) => {
  void (async () => {
    if (req.method === 'GET' && (req.url === '/readyz' || req.url === '/healthz')) {
      try { await runtime.health(); send(res, 200, { ok: true }) }
      catch (error) { send(res, 503, { ok: false, error: error instanceof Error ? error.message : String(error) }) }
      return
    }
    if (req.method !== 'POST' || !req.url?.startsWith('/v1/')) { send(res, 404, { error: 'not found' }); return }
    if (!authorized(req)) { send(res, 401, { error: 'invalid Computer Runtime service identity' }); return }
    const operation = req.url.slice('/v1/'.length).split('?')[0]
    send(res, 200, await execute(operation, await jsonBody(req)))
  })().catch((error) => {
    const status = Number((error as { status?: unknown }).status ?? 500)
    console.error('[computer-runtime] request failed:', error instanceof Error ? error.message : String(error))
    if (!res.headersSent) send(res, status >= 400 && status < 600 ? status : 500, { error: error instanceof Error ? error.message : String(error) })
    else res.end()
  })
})

server.listen(port, '0.0.0.0', () => console.log(`[computer-runtime] ready on :${port}`))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)))
